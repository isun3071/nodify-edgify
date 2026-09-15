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
 * The lineup bisects a 100x price range on purpose. The first round established
 * both ends -- everything at or below $0.33 scored 0/15 clean imports, while
 * Opus 5 at $5 scored 13/15 -- and left the middle entirely unsampled. The
 * question now is where between those the edge-reading actually starts working,
 * so the additions are mid-priced and from vendors not yet tested at all.
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
    note: "ceiling reference: 13/15 clean in round one",
  },
  {
    name: "sonnet-5",
    id: "anthropic/claude-sonnet-5",
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    note: "2.5x cheaper than Opus -- first step down from the known-good end",
  },
  {
    name: "haiku-4.5",
    id: "anthropic/claude-haiku-4.5",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    note: "5x cheaper than Opus",
  },
  {
    name: "gemini-3.8-flash",
    id: "google/gemini-3.8-flash",
    inputPerMTok: 0.75,
    outputPerMTok: 3.75,
    note: "Google untested until now; strong diagram/document reputation",
  },
  {
    name: "qwen3.6-plus",
    id: "qwen/qwen3.6-plus",
    inputPerMTok: 0.325,
    outputPerMTok: 1.95,
    note: "0.944 AI2D; round one was an HTTP 400, never actually ran",
  },
  {
    name: "qwen3-vl-32b",
    id: "qwen/qwen3-vl-32b-instruct",
    inputPerMTok: 0.104,
    outputPerMTok: 0.416,
    note: "#2 on OCRBench v2 (0.674), and cheaper than the 8B it replaces",
  },
  {
    name: "mistral-small-3.2",
    id: "mistralai/mistral-small-3.2-24b-instruct",
    inputPerMTok: 0.075,
    outputPerMTok: 0.2,
    note: "0.929 AI2D; round one 0/15 clean, 8 fixes/graph, nodes perfect",
  },
  {
    name: "glm-5.3-flash",
    id: "z-ai/glm-5.3-flash",
    inputPerMTok: 0.075,
    outputPerMTok: 0.25,
    note: "reported on the intelligence-vs-cost Pareto frontier",
  },
  {
    name: "gpt-5-nano",
    id: "openai/gpt-5-nano",
    inputPerMTok: 0.05,
    outputPerMTok: 0.4,
    note: "cheapest credible vision model; OpenAI untested until now",
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
