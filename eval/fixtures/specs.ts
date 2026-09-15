/**
 * The fixture set.
 *
 * Two halves. The canonical ones are graphs a student actually meets in a
 * course -- K5, Petersen, a CLRS-style Dijkstra graph -- so a score here means
 * something about real use. The hard ones each target one specific failure
 * mode, so when a model scores badly you can read off WHY instead of guessing.
 *
 * Ground truth is exact by construction: the same spec produces both the
 * rendered image and the truth JSON, so there is no transcription to get wrong.
 * The tradeoff is that Graphviz output is cleaner than a photographed slide --
 * these numbers will run optimistic. They rank models honestly; they don't
 * predict real-world accuracy. Real screenshots correct that.
 */
export type Layout = "circle" | "bipartite" | "layered" | "petersen" | "clusters";

export interface FixtureSpec {
  name: string;
  description: string;
  kind: "canonical" | "hard";
  /** What this fixture is designed to break. Shows up in per-fixture results. */
  traps: string[];
  directed: boolean;
  layout: Layout;
  /** Explicit layer assignment for layout "layered". Left to right. */
  layers?: string[][];
  nodes: string[];
  /** [source, target, weight] -- weight null means unlabeled. */
  edges: [string, string, number | null][];
}

const pentagon = ["0", "1", "2", "3", "4"];
const pentagram = ["5", "6", "7", "8", "9"];

export const FIXTURES: FixtureSpec[] = [
  // ---------------- canonical ----------------
  {
    name: "k5",
    description: "Complete graph on 5 vertices",
    kind: "canonical",
    traps: ["edge crossings", "every pair adjacent"],
    directed: false,
    layout: "circle",
    nodes: ["A", "B", "C", "D", "E"],
    edges: [
      ["A", "B", null], ["A", "C", null], ["A", "D", null], ["A", "E", null],
      ["B", "C", null], ["B", "D", null], ["B", "E", null],
      ["C", "D", null], ["C", "E", null], ["D", "E", null],
    ],
  },
  {
    name: "k33",
    description: "Complete bipartite graph K(3,3)",
    kind: "canonical",
    traps: ["edge crossings", "bipartite layout"],
    directed: false,
    layout: "bipartite",
    nodes: ["u1", "u2", "u3", "v1", "v2", "v3"],
    edges: [
      ["u1", "v1", null], ["u1", "v2", null], ["u1", "v3", null],
      ["u2", "v1", null], ["u2", "v2", null], ["u2", "v3", null],
      ["u3", "v1", null], ["u3", "v2", null], ["u3", "v3", null],
    ],
  },
  {
    name: "petersen",
    description: "Petersen graph: outer pentagon, inner pentagram, five spokes",
    kind: "canonical",
    traps: ["near-miss crossings", "inner star edges", "10 nodes 15 edges"],
    directed: false,
    layout: "petersen",
    nodes: [...pentagon, ...pentagram],
    edges: [
      // outer 5-cycle
      ...pentagon.map((n, i) => [n, pentagon[(i + 1) % 5]!, null] as [string, string, null]),
      // spokes
      ...pentagon.map((n, i) => [n, pentagram[i]!, null] as [string, string, null]),
      // inner pentagram (step of 2)
      ...pentagram.map((n, i) => [n, pentagram[(i + 2) % 5]!, null] as [string, string, null]),
    ],
  },
  {
    name: "dijkstra-clrs",
    description: "CLRS-style directed weighted graph with antiparallel pairs",
    kind: "canonical",
    traps: ["antiparallel edges", "arrowheads", "weights"],
    directed: true,
    layout: "layered",
    layers: [["s"], ["t", "y"], ["x"], ["z"]],
    nodes: ["s", "t", "x", "y", "z"],
    edges: [
      ["s", "t", 10], ["s", "y", 5],
      ["t", "x", 1], ["t", "y", 2],
      ["y", "t", 3], ["y", "x", 9], ["y", "z", 2],
      ["x", "z", 4], ["z", "x", 6], ["z", "s", 7],
    ],
  },
  {
    name: "mst-weighted",
    description: "Undirected weighted graph, classic Prim/Kruskal example",
    kind: "canonical",
    traps: ["weights on undirected edges", "no arrowheads"],
    directed: false,
    layout: "circle",
    nodes: ["A", "B", "C", "D", "E", "F", "G"],
    edges: [
      ["A", "B", 7], ["A", "D", 5],
      ["B", "C", 8], ["B", "D", 9], ["B", "E", 7],
      ["C", "E", 5], ["D", "E", 15], ["D", "F", 6],
      ["E", "F", 8], ["E", "G", 9], ["F", "G", 11],
    ],
  },
  {
    name: "dag-topo",
    description: "Directed acyclic graph, topological sort example",
    kind: "canonical",
    traps: ["arrowheads", "no weights", "layered layout"],
    directed: true,
    layout: "layered",
    layers: [["shirt", "pants", "socks"], ["tie", "belt"], ["shoes"], ["jacket"]],
    nodes: ["shirt", "tie", "jacket", "belt", "pants", "shoes", "socks"],
    edges: [
      ["shirt", "tie", null], ["shirt", "belt", null],
      ["tie", "jacket", null], ["belt", "jacket", null],
      ["pants", "belt", null], ["pants", "shoes", null],
      ["socks", "shoes", null],
    ],
  },

  // ---------------- hard ----------------
  {
    name: "self-loops-parallel",
    description: "Multigraph: self-loops and parallel edges",
    kind: "hard",
    traps: ["self-loops", "parallel edges", "multiset edge counting"],
    directed: true,
    layout: "layered",
    layers: [["q0"], ["q1"], ["q2"]],
    nodes: ["q0", "q1", "q2"],
    edges: [
      ["q0", "q0", 1], ["q0", "q1", 2], ["q0", "q1", 5],
      ["q1", "q1", 3], ["q1", "q2", 4],
      ["q2", "q0", 6], ["q2", "q2", 7],
    ],
  },
  {
    name: "numeric-labels",
    description: "Vertices labeled 0-5 AND numeric edge weights",
    kind: "hard",
    traps: ["label/weight ambiguity", "0-indexed vertices"],
    directed: false,
    layout: "circle",
    nodes: ["0", "1", "2", "3", "4", "5"],
    edges: [
      ["0", "1", 4], ["0", "2", 3], ["1", "2", 2],
      ["1", "3", 5], ["2", "4", 6], ["3", "4", 1],
      ["3", "5", 7], ["4", "5", 8],
    ],
  },
  {
    name: "disconnected",
    description: "Three disconnected components, one an isolated vertex",
    kind: "hard",
    traps: ["disconnected components", "isolated vertex", "no-edge node"],
    directed: false,
    layout: "clusters",
    nodes: ["A", "B", "C", "D", "E", "F", "G"],
    edges: [
      ["A", "B", null], ["B", "C", null], ["C", "A", null],
      ["D", "E", null], ["E", "F", null],
      // G is isolated -- models love to invent an edge for it
    ],
  },
  {
    name: "negative-weights",
    description: "Bellman-Ford style graph with negative edge weights",
    kind: "hard",
    traps: ["minus signs", "negative numbers", "OCR of '-' vs '–'"],
    directed: true,
    layout: "layered",
    layers: [["s"], ["a", "b"], ["d"], ["c"]],
    nodes: ["s", "a", "b", "c", "d"],
    edges: [
      ["s", "a", 6], ["s", "b", 7],
      ["a", "b", 8], ["a", "c", -4], ["a", "d", 5],
      ["b", "c", 9], ["b", "d", -3],
      ["d", "c", 7], ["c", "s", 2],
    ],
  },
  {
    name: "flow-network",
    description: "Flow network with antiparallel edges of differing capacity",
    kind: "hard",
    traps: ["antiparallel pairs", "curved duplicate edges", "asymmetric weights"],
    directed: true,
    layout: "layered",
    layers: [["s"], ["v1", "v2"], ["v3", "v4"], ["t"]],
    nodes: ["s", "v1", "v2", "v3", "v4", "t"],
    edges: [
      ["s", "v1", 16], ["s", "v2", 13],
      ["v1", "v2", 10], ["v2", "v1", 4],
      ["v1", "v3", 12],
      ["v3", "v2", 9], ["v2", "v4", 14],
      ["v4", "v3", 7], ["v3", "t", 20], ["v4", "t", 4],
    ],
  },
  {
    name: "dense-crossings",
    description: "Dense undirected graph laid out with heavy edge crossing",
    kind: "hard",
    traps: ["many crossings", "near-miss edges", "phantom edge risk"],
    directed: false,
    layout: "circle",
    nodes: ["A", "B", "C", "D", "E", "F", "G", "H"],
    edges: [
      ["A", "C", null], ["A", "E", null], ["A", "G", null], ["A", "H", null],
      ["B", "D", null], ["B", "F", null], ["B", "G", null],
      ["C", "E", null], ["C", "F", null], ["C", "H", null],
      ["D", "G", null], ["D", "H", null],
      ["E", "G", null], ["F", "H", null],
    ],
  },
];
