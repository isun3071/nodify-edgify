import { layout, NODE_RADIUS as R, type Point } from "./layout.js";
import type { FixtureSpec } from "./specs.js";

const SPREAD = 34; // px of bow for each extra edge between the same pair

const CLEAN_FONT = "Helvetica,Arial,sans-serif";
const SKETCH_FONT = "DkgHandwriting,Comic Neue,Segoe Print,cursive";

interface Placed {
  source: string;
  target: string;
  weight: number | null;
  symbol: string | undefined;
  curvature: number;
}

/**
 * Seeded PRNG (mulberry32). Hand-drawn fixtures have to be byte-identical from
 * run to run, or a re-render silently invalidates every cached model response
 * and quietly changes what the scores mean.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Edges between the same pair of vertices have to be fanned apart or they draw
 * on top of each other. Curvature is measured against the pair's SORTED
 * direction, not the edge's own, so an antiparallel pair (A->B and B->A) always
 * bows to visually opposite sides regardless of which was declared first.
 */
function place(spec: FixtureSpec): Placed[] {
  const groups = new Map<string, number[]>();
  spec.edges.forEach(([s, t], i) => {
    const key = [s, t].sort().join("~~");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  });

  const out: Placed[] = new Array(spec.edges.length);
  for (const indices of groups.values()) {
    indices.forEach((edgeIndex, i) => {
      const [source, target, weight, symbol] = spec.edges[edgeIndex]!;
      const curvature =
        indices.length === 1 ? 0 : (i - (indices.length - 1) / 2) * 2 * SPREAD;
      out[edgeIndex] = { source, target, weight, symbol, curvature };
    });
  }
  return out;
}

const unit = (dx: number, dy: number): Point => {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};

function escapeXml(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
}

const f = (n: number) => n.toFixed(1);

/**
 * A closed Catmull-Rom spline through jittered radial points: a circle drawn by
 * a human, which never quite closes on itself and is never quite round. Vertex
 * centres stay put, so the truth positions remain correct -- only the outline
 * wobbles.
 */
function sketchCircle(c: Point, radius: number, rand: () => number): string {
  const STEPS = 11;
  const pts: Point[] = [];
  for (let i = 0; i < STEPS; i++) {
    const theta = (2 * Math.PI * i) / STEPS + (rand() - 0.5) * 0.12;
    const r = radius * (1 + (rand() - 0.5) * 0.11);
    pts.push({ x: c.x + r * Math.cos(theta), y: c.y + r * Math.sin(theta) });
  }
  const at = (i: number) => pts[((i % STEPS) + STEPS) % STEPS]!;
  const segments: string[] = [`M ${f(at(0).x)},${f(at(0).y)}`];
  for (let i = 0; i < STEPS; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    segments.push(
      `C ${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ` +
        `${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ` +
        `${f(p2.x)},${f(p2.y)}`,
    );
  }
  return segments.join(" ");
}

export function renderSvg(
  spec: FixtureSpec,
  options: { sketch?: boolean } = {},
): { svg: string; normalized: Map<string, Point> } {
  const sketch = options.sketch ?? false;
  const { width, height, pos } = layout(spec);
  const rand = rng(hashSeed(spec.name + (sketch ? ":sketch" : ":clean")));
  const parts: string[] = [];
  const arrow = spec.directed ? ' marker-end="url(#a)"' : "";
  const font = sketch ? SKETCH_FONT : CLEAN_FONT;
  const ink = sketch ? "#1a2540" : "#111";
  // Hand-drawn strokes vary; printed ones don't.
  const stroke = () => (sketch ? 1.5 + rand() * 1.4 : 1.8);

  for (const edge of place(spec)) {
    const p = pos.get(edge.source)!;
    const q = pos.get(edge.target)!;
    let path: string;
    let labelAt: Point;

    if (edge.source === edge.target) {
      const j = sketch ? () => (rand() - 0.5) * 11 : () => 0;
      path =
        `M ${f(p.x - 13 + j())},${f(p.y - R + 4 + j())} ` +
        `C ${f(p.x - 66 + j())},${f(p.y - 104 + j())} ` +
        `${f(p.x + 66 + j())},${f(p.y - 104 + j())} ` +
        `${f(p.x + 13 + j())},${f(p.y - R + 4 + j())}`;
      labelAt = { x: p.x, y: p.y - 86 };
    } else {
      const [a, b] = [edge.source, edge.target].sort() as [string, string];
      const from = pos.get(a)!;
      const to = pos.get(b)!;
      const dir = unit(to.x - from.x, to.y - from.y);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const control = {
        x: mid.x - dir.y * edge.curvature,
        y: mid.y + dir.x * edge.curvature,
      };
      // Pull both ends back to the circle boundary so arrowheads sit on it.
      const su = unit(control.x - p.x, control.y - p.y);
      const tu = unit(control.x - q.x, control.y - q.y);
      const start = { x: p.x + su.x * R, y: p.y + su.y * R };
      const end = { x: q.x + tu.x * R, y: q.y + tu.y * R };

      if (sketch) {
        // A hand-drawn line bows unintentionally and over- or under-shoots the
        // vertex it lands on. Both are exactly what makes edge tracing hard.
        const wob = () => (rand() - 0.5) * 9;
        const s2 = { x: start.x + wob() * 0.7, y: start.y + wob() * 0.7 };
        const e2 = { x: end.x + wob() * 0.7, y: end.y + wob() * 0.7 };
        const c1 = {
          x: s2.x + (control.x - s2.x) * 0.6 + wob(),
          y: s2.y + (control.y - s2.y) * 0.6 + wob(),
        };
        const c2 = {
          x: e2.x + (control.x - e2.x) * 0.6 + wob(),
          y: e2.y + (control.y - e2.y) * 0.6 + wob(),
        };
        path = `M ${f(s2.x)},${f(s2.y)} C ${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(e2.x)},${f(e2.y)}`;
      } else {
        path = `M ${f(start.x)},${f(start.y)} Q ${f(control.x)},${f(control.y)} ${f(end.x)},${f(end.y)}`;
      }

      const bez = {
        x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
        y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
      };
      labelAt = { x: bez.x - dir.y * 13, y: bez.y + dir.x * 13 };
    }

    parts.push(
      `  <path d="${path}" fill="none" stroke="${ink}" stroke-width="${f(stroke())}" ` +
        `stroke-linecap="round"${arrow}/>`,
    );
    // An automaton edge carries a symbol where a weighted graph carries a
    // number. Exactly one of the two is drawn.
    const edgeText = edge.symbol ?? (edge.weight !== null ? String(edge.weight) : null);
    if (edgeText !== null) {
      const tilt = sketch ? ` transform="rotate(${f((rand() - 0.5) * 16)} ${f(labelAt.x)} ${f(labelAt.y)})"` : "";
      parts.push(
        `  <text x="${f(labelAt.x)}" y="${f(labelAt.y)}"${tilt} ` +
          `font-family="${font}" font-size="${sketch ? 17 : 15}" fill="${ink}" ` +
          `text-anchor="middle" dominant-baseline="central" ` +
          `stroke="#fff" stroke-width="3.5" paint-order="stroke">${escapeXml(edgeText)}</text>`,
      );
    }
  }

  for (const label of spec.nodes) {
    const p = pos.get(label)!;
    const shape = sketch
      ? `  <path d="${sketchCircle(p, R, rand)}" fill="#fff" stroke="${ink}" ` +
        `stroke-width="${f(stroke())}" stroke-linecap="round"/>`
      : `  <circle cx="${f(p.x)}" cy="${f(p.y)}" r="${R}" fill="#fff" stroke="${ink}" stroke-width="1.8"/>`;

    // Start state: a stub arrow entering from the left, originating nowhere.
    // Drawn first so the vertex outline sits on top of where it lands.
    if (spec.start === label) {
      const j = sketch ? () => (rand() - 0.5) * 5 : () => 0;
      parts.push(
        `  <path d="M ${f(p.x - R - 42 + j())},${f(p.y + j())} ` +
          `L ${f(p.x - R - 2)},${f(p.y + j())}" fill="none" stroke="${ink}" ` +
          `stroke-width="${f(stroke())}" stroke-linecap="round" marker-end="url(#a)"/>`,
      );
    }

    parts.push(shape);

    // Accepting state: the inner ring of the conventional double circle. It has
    // to come AFTER the outer circle -- that one is fill="#fff", so a ring drawn
    // first would be painted over and invisible.
    if (spec.accept?.includes(label)) {
      parts.push(
        sketch
          ? `  <path d="${sketchCircle(p, R - 5, rand)}" fill="none" stroke="${ink}" ` +
            `stroke-width="${f(stroke())}" stroke-linecap="round"/>`
          : `  <circle cx="${f(p.x)}" cy="${f(p.y)}" r="${R - 5}" fill="none" ` +
            `stroke="${ink}" stroke-width="1.8"/>`,
      );
    }

    const tilt = sketch ? ` transform="rotate(${f((rand() - 0.5) * 18)} ${f(p.x)} ${f(p.y)})"` : "";
    parts.push(
      `  <text x="${f(p.x)}" y="${f(p.y)}"${tilt} font-family="${font}" ` +
        `font-size="${label.length > 3 ? (sketch ? 12 : 11) : sketch ? 18 : 16}" fill="${ink}" ` +
        `text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`,
    );
  }

  const paper = sketch ? "#fdfdfa" : "#fff";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" ` +
      `markerHeight="6.5" orient="auto-start-reverse">` +
      `<path d="M 0 0 L 10 5 L 0 10 z" fill="${ink}"/></marker></defs>`,
    `  <rect width="100%" height="100%" fill="${paper}"/>`,
    ...parts,
    `</svg>`,
  ].join("\n");

  const normalized = new Map(
    [...pos].map(([k, p]) => [k, { x: p.x / width, y: p.y / height }] as const),
  );
  return { svg, normalized };
}
