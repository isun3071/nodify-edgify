import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderSvg } from "./fixtures/render.js";
import { FIXTURES } from "./fixtures/specs.js";
import { TIERS } from "./fixtures/tiers.js";

const IMG = new URL("./fixtures/images/", import.meta.url).pathname;
let bad = 0;
const fail = (m: string) => { bad++; console.log(`FAIL ${m}`); };

for (const spec of FIXTURES) {
  const clean = renderSvg(spec, { sketch: false });
  const sketch = renderSvg(spec, { sketch: true });

  // INVARIANT 1: vertex centres are identical across render modes, so one truth
  // file is valid for every tier. Jitter must move the outline, never the centre.
  for (const [label, p] of clean.normalized) {
    const q = sketch.normalized.get(label)!;
    if (Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9)
      fail(`${spec.name}: sketch moved vertex ${label}`);
  }

  // INVARIANT 2: same element counts in both modes -- jitter must not add or
  // drop an edge. Sketch draws vertices as <path>, so count paths as a whole.
  const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;
  const weighted = spec.edges.filter(([, , w]) => w !== null).length;
  // fill="none" is an edge; fill="#fff" is a sketch-mode vertex; the arrowhead
  // marker in <defs> is neither and must not be counted.
  const EDGE = /<path d="[^"]+" fill="none"/g;
  const VERTEX = /<path d="[^"]+" fill="#fff"/g;
  if (count(clean.svg, EDGE) !== spec.edges.length)
    fail(`${spec.name}: clean edge paths ${count(clean.svg, EDGE)}!=${spec.edges.length}`);
  if (count(sketch.svg, EDGE) !== spec.edges.length)
    fail(`${spec.name}: sketch edge paths ${count(sketch.svg, EDGE)}!=${spec.edges.length}`);
  if (count(sketch.svg, VERTEX) !== spec.nodes.length)
    fail(`${spec.name}: sketch vertex paths ${count(sketch.svg, VERTEX)}!=${spec.nodes.length}`);
  if (count(clean.svg, /<text /g) !== spec.nodes.length + weighted)
    fail(`${spec.name}: clean text count`);
  if (count(sketch.svg, /<text /g) !== spec.nodes.length + weighted)
    fail(`${spec.name}: sketch text count`);

  // INVARIANT 3: determinism -- re-rendering must be byte-identical, or a
  // regeneration silently invalidates every cached response.
  if (renderSvg(spec, { sketch: true }).svg !== sketch.svg)
    fail(`${spec.name}: sketch render is not deterministic`);

  // INVARIANT 4: every degraded image still carries content. A pipeline that
  // washed the graph out would score as total model failure and look like a
  // model problem.
  for (const tier of TIERS) {
    const file = `${IMG}${spec.name}.${tier.name}.${tier.extension}`;
    const sd = Number(execFileSync("magick", ["identify", "-format", "%[standard-deviation]", file]).toString());
    const mean = Number(execFileSync("magick", ["identify", "-format", "%[mean]", file]).toString());
    if (!(sd > 1500)) fail(`${spec.name}.${tier.name}: near-blank (sd=${sd.toFixed(0)})`);
    if (!(mean > 40000)) fail(`${spec.name}.${tier.name}: too dark (mean=${mean.toFixed(0)})`);
  }
}

// truth is shared, so it must not mention tiers at all
for (const spec of FIXTURES) {
  const truth = JSON.parse(readFileSync(new URL(`./fixtures/truth/${spec.name}.json`, import.meta.url), "utf8"));
  if (truth.nodes.length !== spec.nodes.length || truth.edges.length !== spec.edges.length)
    fail(`${spec.name}: truth drifted from spec`);
}

console.log(bad ? `\n${bad} problem(s)` : `\nall tier invariants hold across ${FIXTURES.length} fixtures x ${TIERS.length} tiers`);
process.exit(bad ? 1 : 0);
