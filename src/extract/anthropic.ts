import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GraphSchema } from "../graph/schema.js";
import { costOf, type Extractor, type ExtractResult, type ModelSpec } from "./types.js";

/**
 * Anthropic direct.
 *
 * Structured output lives on the beta namespace in @anthropic-ai/sdk 0.70.x:
 * `beta.messages.parse` with a top-level `output_format`, and the result on
 * `.parsed_output`. Published docs describe `messages.parse` with
 * `output_config.format` -- that's a later SDK. If you bump the SDK major and
 * this stops compiling, that's the move to make.
 *
 * The schema is enforced server-side, so the response cannot be anything but a
 * graph. That's what stops a screenshot with hostile text embedded in it from
 * steering the model somewhere else.
 */
export function anthropicExtractor(spec: ModelSpec): Extractor {
  const client = new Anthropic();

  return {
    name: spec.name,
    async extract(image, mediaType, prompt): Promise<ExtractResult> {
      const started = Date.now();
      try {
        const response = await client.beta.messages.parse({
          model: spec.id,
          max_tokens: 16000,
          // Stable prefix first, volatile image last: caching is a prefix match
          // and this system prompt is byte-identical on every call.
          system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType as "image/png",
                    data: image.toString("base64"),
                  },
                },
                { type: "text", text: "Extract the graph from this image." },
              ],
            },
          ],
          output_format: betaZodOutputFormat(GraphSchema),
        });

        const usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: costOf(spec, response.usage.input_tokens, response.usage.output_tokens),
        };

        // parsed_output is null when validation fails -- guard, never assert.
        return {
          graph: response.parsed_output ?? null,
          raw: JSON.stringify(response.content),
          usage,
          latencyMs: Date.now() - started,
          error: response.parsed_output ? undefined : "schema validation failed",
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
