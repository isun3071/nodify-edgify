import type { ModelSpec } from "./types.js";

/**
 * The candidate set, ordered by input price.
 *
 * Everything routes through OpenRouter, Claude included, so the project needs
 * one key. Slugs, prices and vision/structured-output support were read from
 * GET /api/v1/models rather than guessed; re-check with:
 *
 *   curl -s https://openrouter.ai/api/v1/models \
 *     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
 *     | jq -r '.data[] | select(.id=="...") | [.id, .pricing.prompt] | @tsv'
 *
 * Every model here reports `structured_outputs` support. That flag has already
 * proved unreliable twice (see REMOVED below), which is why openrouter.ts
 * re-validates every response locally rather than trusting the contract.
 *
 * Notes below are measured, not marketing. The headline: price does not predict
 * quality here. GLM 5.3 Flash at $0.075 matched Opus 5 at $5.00, while Haiku 4.5
 * at $1.00 performed like the sub-$0.11 tier. Published AI2D and OCRBench
 * rankings were a reasonable way to build this shortlist and a poor way to pick
 * the winner -- see eval/README.md for the full table.
 *
 * Worth knowing: every model here has a `:batch` variant at half price. For a
 * 96-call eval that is real money, at the cost of an async submit/poll flow.
 *
 * REMOVED, both for lying about structured output support:
 *   qwen/qwen3.6-35b-a3b  -- returned prose instead of JSON on 5 of 5 calls.
 *   qwen/qwen3-vl-8b-instruct -- worked, but qwen3-vl-32b-instruct is both
 *     cheaper ($0.104 vs $0.117) and better ranked on OCRBench v2 (#2 at 0.674
 *     vs #5 at 0.654), so keeping the 8B only burned calls.
 */
export const MODELS: ModelSpec[] = [
  {
    name: "opus-5",
    id: "anthropic/claude-opus-5",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    note:
      "measured 10/12 clean, 0.8 fixes/graph -- never fails to parse, so it is the fallback",
  },
  {
    name: "sonnet-5",
    id: "anthropic/claude-sonnet-5",
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    note:
      "measured 7/12 clean, 1.8 fixes -- beaten by gemini-flash at lower cost",
  },
  {
    name: "haiku-4.5",
    id: "anthropic/claude-haiku-4.5",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    note:
      "measured 2/12 clean, 5.3 fixes -- performs like the sub-$0.11 tier at 10x the price",
  },
  {
    name: "gemini-3.8-flash",
    id: "google/gemini-3.8-flash",
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    note:
      "measured 8/12 clean, 1.2 fixes -- best of the non-GLM mid tier",
  },
  {
    name: "qwen3.6-plus",
    id: "qwen/qwen3.6-plus",
    inputPerMTok: 0.325,
    outputPerMTok: 1.95,
    note:
      "measured 2/12 clean; returns a bare array where the schema wants an object",
  },
  {
    name: "qwen3-vl-32b",
    id: "qwen/qwen3-vl-32b-instruct",
    inputPerMTok: 0.104,
    outputPerMTok: 0.416,
    note:
      "measured 2/12 clean, 5.0 fixes -- better than the 8B it replaced, still weak",
  },
  {
    name: "mistral-small-3.2",
    id: "mistralai/mistral-small-3.2-24b-instruct",
    inputPerMTok: 0.075,
    outputPerMTok: 0.2,
    note:
      "measured 3/12 clean, 6.3 fixes; also the most rate-limited model here",
  },
  {
    name: "glm-5.3-flash",
    id: "z-ai/glm-5.3-flash",
    inputPerMTok: 0.075,
    outputPerMTok: 0.25,
    note:
      "DEFAULT. 9/11 clean, 0.5 fixes, 100% weight accuracy -- matches Opus 5 at 1/43rd the cost",
  },
  {
    name: "gpt-5-nano",
    id: "openai/gpt-5-nano",
    inputPerMTok: 0.05,
    outputPerMTok: 0.4,
    note:
      "measured 4/12 clean, 3.4 fixes -- best of the truly cheap tier after GLM",
  },
];

export function lookup(name: string): ModelSpec {
  const spec = MODELS.find((m) => m.name === name);
  if (!spec) {
    throw new Error(
      `Unknown model '${name}'. Known: ${MODELS.map((m) => m.name).join(", ")}`,
    );
  }
  return spec;
}
