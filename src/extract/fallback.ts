import type { Extractor, ExtractResult } from "./types.js";

/**
 * Runs `primary`, and falls back to `secondary` only when the primary produced
 * no usable graph -- a schema violation, malformed JSON, or a call that never
 * landed after its retries.
 *
 * The eval is what makes this shape the right one. GLM 5.3 Flash matched Opus 5
 * on extraction quality (0.5 fixes per graph vs 0.8, 96% edge F1 vs 97%, and
 * better weight accuracy) at 1/43rd the price, but lost one fixture in twelve
 * to invalid JSON. Opus never failed to parse. So the cheap model carries
 * essentially all the traffic and the expensive one covers the rare hole, which
 * costs about $1.40 per thousand imports instead of $60 -- for the quality of
 * the more expensive model on the cases that matter.
 *
 * Note this triggers on *unusable output*, not on low quality. A confidently
 * wrong graph looks like success here, which is exactly why the correction UI
 * exists and why import is never presented as authoritative.
 */
export function withFallback(primary: Extractor, secondary: Extractor): Extractor {
  return {
    name: `${primary.name}+${secondary.name}`,
    async extract(image, mediaType, prompt): Promise<ExtractResult> {
      const first = await primary.extract(image, mediaType, prompt);
      if (first.graph) return first;

      const second = await secondary.extract(image, mediaType, prompt);
      return {
        ...second,
        // Bill both attempts: the first one burned tokens even though it
        // produced nothing usable, and hiding that would understate the real
        // cost per import.
        usage: {
          inputTokens: first.usage.inputTokens + second.usage.inputTokens,
          outputTokens: first.usage.outputTokens + second.usage.outputTokens,
          costUsd: first.usage.costUsd + second.usage.costUsd,
        },
        latencyMs: first.latencyMs + second.latencyMs,
        error: second.graph
          ? `primary ${primary.name} failed (${first.error}); recovered via ${secondary.name}`
          : `both failed -- ${primary.name}: ${first.error}; ${secondary.name}: ${second.error}`,
      };
    },
  };
}
