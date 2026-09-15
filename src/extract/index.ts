import { anthropicExtractor } from "./anthropic.js";
import { openrouterExtractor } from "./openrouter.js";
import { lookup } from "./registry.js";
import type { Extractor } from "./types.js";

export { MODELS, lookup } from "./registry.js";
export type { Extractor, ExtractResult, ModelSpec, Usage } from "./types.js";

export function extractorFor(name: string): Extractor {
  const spec = lookup(name);
  return spec.provider === "anthropic"
    ? anthropicExtractor(spec)
    : openrouterExtractor(spec);
}
