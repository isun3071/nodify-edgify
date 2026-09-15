import { openrouterExtractor } from "./openrouter.js";
import { lookup } from "./registry.js";
import type { Extractor } from "./types.js";

export { MODELS, lookup } from "./registry.js";
export { USER_INSTRUCTION } from "./openrouter.js";
export type { Extractor, ExtractResult, ModelSpec, Usage } from "./types.js";

/**
 * Everything goes through OpenRouter today, so this looks like indirection for
 * its own sake. It isn't: the eval and the web app both depend on the Extractor
 * interface rather than on a provider, which is what lets the winning model
 * drop into the API route by changing EXTRACTOR_MODEL instead of by a rewrite.
 *
 * A direct Anthropic implementation lived here and was removed when Claude
 * moved to OpenRouter routing. The one thing that costs us is prompt caching:
 * the system prompt is byte-identical on every call and was cached with an
 * explicit cache_control breakpoint. Worth revisiting once the app is live and
 * many users are hitting the same prefix -- for the eval it's noise, since
 * responses are cached on disk anyway.
 */
export function extractorFor(name: string): Extractor {
  return openrouterExtractor(lookup(name));
}
