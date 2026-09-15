import type { ModelSpec } from "./types.js";

/**
 * The shortlist, chosen off AI2D (diagram understanding) and OCRBench v2
 * (text in images) and filtered for price. Opus 5 is not a candidate -- it is
 * the ceiling the cheap models are measured against, so we know whether a low
 * score means "hard task" or "weak model".
 *
 * Prices are USD per million tokens as of Sept 2026. OpenRouter slugs drift;
 * verify against https://openrouter.ai/models before trusting a cost column,
 * and check the `structured_outputs` flag on the provider entry -- an endpoint
 * that treats the schema as a hint rather than a constraint will quietly
 * inflate the parse-failure rate.
 */
export const MODELS: ModelSpec[] = [
  {
    name: "opus-5",
    provider: "anthropic",
    id: "claude-opus-5",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    note: "ceiling reference, not a cost candidate",
  },
  {
    name: "mistral-small-3.2",
    provider: "openrouter",
    id: "mistralai/mistral-small-3.2-24b-instruct",
    inputPerMTok: 0.07,
    outputPerMTok: 0.2,
    note: "0.929 AI2D at 1/35th GPT-4o input price -- best accuracy/$ on paper",
  },
  {
    name: "qwen3-vl-8b",
    provider: "openrouter",
    id: "qwen/qwen3-vl-8b-instruct",
    inputPerMTok: 0.117,
    outputPerMTok: 0.455,
    note: "0.654 OCRBench v2, beats the 30B variant on text while costing less",
  },
  {
    name: "qwen3.6-35b-a3b",
    provider: "openrouter",
    id: "qwen/qwen3.6-35b-a3b",
    inputPerMTok: 0.1,
    outputPerMTok: 0.95,
    note: "0.927 AI2D",
  },
  {
    name: "qwen3.6-plus",
    provider: "openrouter",
    id: "qwen/qwen3.6-plus",
    inputPerMTok: 0.5,
    outputPerMTok: 3.0,
    note: "0.944 AI2D -- fallback if the whole cheap tier fails",
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
