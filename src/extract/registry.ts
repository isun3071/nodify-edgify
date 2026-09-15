import type { ModelSpec } from "./types.js";

/**
 * The shortlist, chosen off AI2D (diagram understanding) and OCRBench v2
 * (text in images) and filtered for price. Opus 5 is not a cost candidate --
 * it is the ceiling the cheap models are measured against, so a low score can
 * be read as "hard task" rather than "weak model".
 *
 * Everything routes through OpenRouter, including Claude, so the project needs
 * one key. Slugs, prices and vision/structured-output support below were read
 * from GET /api/v1/models rather than guessed; re-check with:
 *
 *   curl -s https://openrouter.ai/api/v1/models \
 *     -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.data[] | select(.id=="...")'
 *
 * All five report `structured_outputs` support, which matters: an endpoint that
 * treats the schema as a hint rather than a constraint shows up as parse
 * failures, and weakens the injection boundary the schema is there to provide.
 *
 * Worth knowing: every model here has a `:batch` variant at half price. For a
 * 300-call eval that is real money, at the cost of an async submit/poll flow.
 */
export const MODELS: ModelSpec[] = [
  {
    name: "opus-5",
    id: "anthropic/claude-opus-5",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    note: "ceiling reference, not a cost candidate",
  },
  {
    name: "mistral-small-3.2",
    id: "mistralai/mistral-small-3.2-24b-instruct",
    inputPerMTok: 0.075,
    outputPerMTok: 0.2,
    note: "0.929 AI2D at 1/35th GPT-4o input price -- best accuracy/$ on paper",
  },
  {
    name: "qwen3-vl-8b",
    id: "qwen/qwen3-vl-8b-instruct",
    inputPerMTok: 0.117,
    outputPerMTok: 0.455,
    note: "0.654 OCRBench v2, beats the 30B variant on text while costing less",
  },
  {
    name: "qwen3.6-35b-a3b",
    id: "qwen/qwen3.6-35b-a3b",
    inputPerMTok: 0.1,
    outputPerMTok: 0.9,
    note: "0.927 AI2D",
  },
  {
    name: "qwen3.6-plus",
    id: "qwen/qwen3.6-plus",
    inputPerMTok: 0.325,
    outputPerMTok: 1.95,
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
