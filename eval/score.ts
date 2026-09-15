import { edgeKey, labelMap, normalizeLabel, type Graph } from "../src/graph/schema.js";

export interface PRF {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface Score {
  parsed: boolean;
  nodes: PRF;
  edges: PRF;
  /** Of edges matched by endpoints, the fraction carrying the right weight. */
  weightAccuracy: number;
  /** Of edges matched by endpoints, the fraction carrying the right symbol. */
  symbolAccuracy: number;
  /** Vertices whose start/accept role was read wrong. */
  wrongRoles: number;
  directedCorrect: boolean;
  /** Mean distance between matched node centers, in fractions of image size. */
  positionError: number;
  /**
   * Edit operations to turn the extraction into the truth. The headline number:
   * it is the only metric that answers "is importing faster than drawing it".
   * F1 can't -- two graphs with equal F1 can need one click or six.
   */
  fixes: number;
  /** fixes === 0. A clean import feels like magic; anything else feels like work. */
  clean: boolean;
  breakdown: Record<string, number>;
}

function prf(tp: number, fp: number, fn: number): PRF {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

function counted<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    (out.get(k) ?? out.set(k, []).get(k)!).push(item);
  }
  return out;
}

/** Failed to parse at all: every truth element counts as a fix. */
export function zeroScore(truth: Graph): Score {
  const n = truth.nodes.length;
  const e = truth.edges.length;
  return {
    parsed: false,
    nodes: prf(0, 0, n),
    edges: prf(0, 0, e),
    weightAccuracy: 0,
    symbolAccuracy: 0,
    wrongRoles: 0,
    directedCorrect: false,
    positionError: NaN,
    fixes: n + e,
    clean: false,
    breakdown: { unparseable: 1, missingNodes: n, missingEdges: e },
  };
}

export function score(truth: Graph, got: Graph): Score {
  const breakdown: Record<string, number> = {};

  // ---- nodes, matched by normalized label ----
  const truthLabels = counted(truth.nodes, (n) => normalizeLabel(n.label));
  const gotLabels = counted(got.nodes, (n) => normalizeLabel(n.label));
  let nTp = 0, nFp = 0, nFn = 0;
  for (const [label, ts] of truthLabels) {
    const g = gotLabels.get(label)?.length ?? 0;
    nTp += Math.min(ts.length, g);
    nFn += Math.max(0, ts.length - g);
  }
  for (const [label, gs] of gotLabels) {
    nFp += Math.max(0, gs.length - (truthLabels.get(label)?.length ?? 0));
  }
  if (nFn) breakdown.missingNodes = nFn;
  if (nFp) breakdown.spuriousNodes = nFp;

  // ---- edges, as a multiset so parallel edges and self-loops survive ----
  // Both sides canonicalize under TRUTH's directedness, so a model that got
  // the topology right but the directed flag wrong is charged one fix for the
  // flag, not one per edge.
  const truthMap = labelMap(truth);
  const gotMap = labelMap(got);
  const truthEdges = counted(truth.edges, (e) => edgeKey(e, truthMap, truth.directed));
  const gotEdges = counted(got.edges, (e) => edgeKey(e, gotMap, truth.directed));

  let eTp = 0, eFp = 0, eFn = 0, weightMatches = 0, weightChecked = 0;
  let labelMatches = 0, labelChecked = 0;
  for (const [key, ts] of truthEdges) {
    const gs = gotEdges.get(key) ?? [];
    const matched = Math.min(ts.length, gs.length);
    eTp += matched;
    eFn += Math.max(0, ts.length - gs.length);

    // Weights compare as a multiset intersection, not pairwise by position.
    // Two parallel edges weighted 2 and 5: if a model finds only the 5, that
    // edge is right and should cost one fix (the missing edge), not two.
    // Positional pairing would line the surviving 5 up against the 2 and
    // charge a phantom weight error on top.
    const pool = new Map<number | null, number>();
    for (const e of ts) pool.set(e.weight, (pool.get(e.weight) ?? 0) + 1);
    let agreed = 0;
    for (const e of gs) {
      const available = pool.get(e.weight) ?? 0;
      if (available > 0) {
        pool.set(e.weight, available - 1);
        agreed++;
      }
    }
    weightChecked += matched;
    weightMatches += Math.min(agreed, matched);

    // Edge symbols ("a", "0,1", "a/b->R") compare the same way. Kept apart from
    // weights because they are different edits to make and different things to
    // get wrong: a weighted graph carries numbers, an automaton carries symbols,
    // and a model that confuses the two should be visible as such.
    const symbolPool = new Map<string | null, number>();
    for (const e of ts) symbolPool.set(e.label, (symbolPool.get(e.label) ?? 0) + 1);
    let symbolsAgreed = 0;
    for (const e of gs) {
      const available = symbolPool.get(e.label) ?? 0;
      if (available > 0) {
        symbolPool.set(e.label, available - 1);
        symbolsAgreed++;
      }
    }
    labelChecked += matched;
    labelMatches += Math.min(symbolsAgreed, matched);
  }
  for (const [key, gs] of gotEdges) {
    eFp += Math.max(0, gs.length - (truthEdges.get(key)?.length ?? 0));
  }
  if (eFn) breakdown.missingEdges = eFn;
  if (eFp) breakdown.spuriousEdges = eFp;

  const wrongWeights = weightChecked - weightMatches;
  if (wrongWeights) breakdown.wrongWeights = wrongWeights;

  const wrongSymbols = labelChecked - labelMatches;
  if (wrongSymbols) breakdown.wrongSymbols = wrongSymbols;

  // Start and accept states are part of what an automaton IS -- a diagram with
  // the accepting states wrong is the wrong automaton, however good its edges.
  const gotRoleByLabel = new Map(
    got.nodes.map((n) => [normalizeLabel(n.label), n]),
  );
  let wrongRoles = 0;
  for (const t of truth.nodes) {
    const g = gotRoleByLabel.get(normalizeLabel(t.label));
    if (!g) continue; // already charged as a missing node
    // One fix per wrong flag: marking a state accepting and marking it the
    // start state are separate edits, and a state can legitimately be both.
    if (g.start !== t.start) wrongRoles++;
    if (g.accept !== t.accept) wrongRoles++;
  }
  if (wrongRoles) breakdown.wrongRoles = wrongRoles;

  const directedCorrect = truth.directed === got.directed;
  if (!directedCorrect) breakdown.directedness = 1;

  // ---- positions, informational only ----
  const gotByLabel = new Map(got.nodes.map((n) => [normalizeLabel(n.label), n]));
  const deltas: number[] = [];
  for (const t of truth.nodes) {
    const g = gotByLabel.get(normalizeLabel(t.label));
    if (g) deltas.push(Math.hypot(t.x - g.x, t.y - g.y));
  }
  const positionError = deltas.length
    ? deltas.reduce((a, b) => a + b, 0) / deltas.length
    : NaN;

  const fixes =
    nFn + nFp + eFn + eFp + wrongWeights + wrongSymbols + wrongRoles +
    (directedCorrect ? 0 : 1);

  return {
    parsed: true,
    nodes: prf(nTp, nFp, nFn),
    edges: prf(eTp, eFp, eFn),
    weightAccuracy: weightChecked === 0 ? 1 : weightMatches / weightChecked,
    symbolAccuracy: labelChecked === 0 ? 1 : labelMatches / labelChecked,
    wrongRoles,
    directedCorrect,
    positionError,
    fixes,
    clean: fixes === 0,
    breakdown,
  };
}
