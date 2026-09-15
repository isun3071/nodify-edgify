import type { Graph } from "../graph/schema.js";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ExtractResult {
  /** null when the response failed schema validation -- a real, scoreable outcome. */
  graph: Graph | null;
  raw: string;
  usage: Usage;
  latencyMs: number;
  error?: string;
}

/**
 * The seam. One interface, many providers; the eval and the web app both talk
 * to this and neither knows which model answered. Whatever wins the eval drops
 * into the API route by changing EXTRACTOR_MODEL, not by a rewrite.
 */
export interface Extractor {
  name: string;
  extract(image: Buffer, mediaType: string, prompt: string): Promise<ExtractResult>;
}

export interface ModelSpec {
  /** Key used on the command line and in results. */
  name: string;
  /** OpenRouter slug, e.g. "anthropic/claude-opus-5". */
  id: string;
  /** USD per million tokens. */
  inputPerMTok: number;
  outputPerMTok: number;
  note?: string;
}

export function costOf(spec: ModelSpec, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * spec.inputPerMTok +
    (outputTokens / 1_000_000) * spec.outputPerMTok
  );
}
