import { z } from "zod";

/**
 * The single source of truth for what a graph is here.
 *
 * Three jobs: extraction contract for the model, TypeScript type for the
 * editor, and the injection boundary -- a schema-constrained response has
 * nowhere to put instructions smuggled in through an uploaded image.
 *
 * Shaped around the things that actually break on real course diagrams:
 *   - `directed` is stated once at graph level, not inferred per edge, so a
 *     half-visible arrowhead can't produce a graph that's half directed.
 *   - edges carry their own `id`, so self-loops and parallel edges (common in
 *     automata and flow networks) survive. Keying on (source,target) loses them.
 *   - x/y are normalized against the image, so the layout the student is
 *     looking at is preserved instead of being re-derived by a force sim.
 */

export const NodeSchema = z.object({
  id: z.string().describe("Stable identifier, unique within the graph."),
  label: z
    .string()
    .describe("Text drawn inside or beside the vertex, e.g. 'A', 's', 'q0'."),
  // Two independent flags, not one enum: a DFA's start state is very often also
  // an accepting state, and an enum cannot say both.
  start: z
    .boolean()
    .describe(
      "Automata notation: true if an arrow points into this vertex from no " +
        "other vertex (the start state). False for ordinary graphs.",
    ),
  accept: z
    .boolean()
    .describe(
      "Automata notation: true if this vertex is drawn as a double circle " +
        "(an accepting state). False for ordinary graphs.",
    ),
  x: z.number().min(0).max(1).describe("Center, fraction of image width."),
  y: z.number().min(0).max(1).describe("Center, fraction of image height, top-down."),
});

export const EdgeSchema = z.object({
  id: z.string().describe("Stable identifier, unique within the graph."),
  source: z.string().describe("id of the source node."),
  target: z.string().describe("id of the target node. Equal to source for a self-loop."),
  weight: z
    .number()
    .nullable()
    .describe("Numeric label on the edge, or null if unlabeled. May be negative."),
  label: z
    .string()
    .nullable()
    .describe(
      "Non-numeric label on the edge: an automaton's transition symbols " +
        "('a', '0,1', 'a/b->R'). Null when the edge carries no symbol. An edge " +
        "labeled with a plain number uses `weight` instead, not this.",
    ),
});

export const GraphSchema = z.object({
  directed: z
    .boolean()
    .describe(
      "True only if edges carry arrowheads. If no arrowheads are drawn anywhere, false.",
    ),
  weighted: z.boolean().describe("True if any edge carries a numeric label."),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type GraphNode = z.infer<typeof NodeSchema>;
export type GraphEdge = z.infer<typeof EdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;

/**
 * Canonical comparison key for an edge.
 *
 * Directedness decides whether (a,b) and (b,a) are the same edge, which is why
 * it has to be a graph-level fact before any edge can be compared. Labels are
 * used rather than ids because ids are arbitrary across extractions -- two
 * models will not agree on "n1" but will agree on "A".
 */
export function edgeKey(
  edge: GraphEdge,
  labelOf: Map<string, string>,
  directed: boolean,
): string {
  const a = labelOf.get(edge.source) ?? edge.source;
  const b = labelOf.get(edge.target) ?? edge.target;
  return directed ? `${a}->${b}` : [a, b].sort().join("--");
}

export function labelMap(graph: Graph): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, normalizeLabel(n.label)]));
}

/** Trim and casefold, so 'A ' and 'a' don't count as different vertices. */
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}
