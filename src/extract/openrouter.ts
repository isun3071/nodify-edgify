import { z } from "zod";
import { GraphSchema } from "../graph/schema.js";
import { costOf, type Extractor, type ExtractResult, type ModelSpec } from "./types.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Retry budget for transient provider failures (429 rate limit, 5xx, timeout). */
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * True for failures worth retrying: provider rate limits and server-side
 * errors. A 400 (bad request, unsupported parameter) is our bug and retrying
 * it just wastes time.
 *
 * This matters more than it looks. Untreated, a 429 scores as a total
 * extraction failure -- zero nodes, zero edges -- which is indistinguishable
 * in the summary from a model that simply cannot read the picture. That has
 * already made one decent model look worthless in this eval.
 */
function isTransient(message: string): boolean {
  return /\b(429|408|500|502|503|504)\b/.test(message) || /timeout|aborted|ECONNRESET/i.test(message);
}

/**
 * The user-turn instruction. It has to contain the literal word "json": some
 * OpenAI-compatible providers (Alibaba, serving the Qwen models) reject a
 * request with `response_format` set unless the messages mention it, with
 * `'messages' must contain the word 'json' in some form`. OpenRouter forwards
 * that rejection as an HTTP 400, so the model never runs at all.
 *
 * Exported because eval/run.ts folds it into the response cache key -- it is
 * part of the request, so changing it has to invalidate cached answers.
 */
export const USER_INSTRUCTION = "Extract the graph from this image as JSON.";

/**
 * OpenRouter, OpenAI-compatible chat completions.
 *
 * Schema enforcement here is per-endpoint, not per-model: some providers
 * enforce it, others translate it into their own format, others treat it as a
 * strong hint. So we ask for strict mode AND re-validate locally with the same
 * Zod schema. A provider that ignores the constraint shows up honestly as a
 * parse failure in the results rather than as a silently malformed graph.
 */
export function openrouterExtractor(spec: ModelSpec): Extractor {
  // Zod 4 converts natively, so both providers derive their contract from the
  // same GraphSchema object -- no second definition to drift out of sync.
  const jsonSchema = z.toJSONSchema(GraphSchema, { target: "draft-7" });

  return {
    name: spec.name,
    async extract(image, mediaType, prompt): Promise<ExtractResult> {
      const started = Date.now();
      let lastError = "";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "",
            "X-Title": process.env.OPENROUTER_SITE_NAME ?? "nodify-edgify",
          },
          body: JSON.stringify({
            model: spec.id,
            messages: [
              { role: "system", content: prompt },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mediaType};base64,${image.toString("base64")}`,
                    },
                  },
                  { type: "text", text: USER_INSTRUCTION },
                ],
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "graph", strict: true, schema: jsonSchema },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const body = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const raw = body.choices?.[0]?.message?.content ?? "";
        const inputTokens = body.usage?.prompt_tokens ?? 0;
        const outputTokens = body.usage?.completion_tokens ?? 0;
        const usage = {
          inputTokens,
          outputTokens,
          costUsd: costOf(spec, inputTokens, outputTokens),
        };

        // Layer two: the provider may have ignored strict mode entirely.
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return {
            graph: null, raw, usage,
            latencyMs: Date.now() - started,
            error: "response was not valid JSON",
          };
        }

        const check = GraphSchema.safeParse(parsed);
        return {
          graph: check.success ? check.data : null,
          raw,
          usage,
          latencyMs: Date.now() - started,
          error: check.success ? undefined : `schema mismatch: ${check.error.issues[0]?.message}`,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_ATTEMPTS && isTransient(lastError)) {
          // Exponential backoff with jitter, so parallel streams that trip the
          // same provider limit don't all come back at the same instant.
          const wait = BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.7 + Math.random() * 0.6);
          await sleep(wait);
          continue;
        }
        break;
      }
      }

      return {
        graph: null,
        raw: "",
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        latencyMs: Date.now() - started,
        error: lastError,
      };
    },
  };
}
