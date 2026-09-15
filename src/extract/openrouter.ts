import { z } from "zod";
import { GraphSchema } from "../graph/schema.js";
import { costOf, type Extractor, type ExtractResult, type ModelSpec } from "./types.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
                  { type: "text", text: "Extract the graph from this image." },
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
        return {
          graph: null,
          raw: "",
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          latencyMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
