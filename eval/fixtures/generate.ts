import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Graph } from "../../src/graph/schema.js";
import { renderSvg } from "./render.js";
import { FIXTURES } from "./specs.js";
import { TIERS } from "./tiers.js";

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES = join(here, "images");
const TRUTH = join(here, "truth");

function main() {
  rmSync(IMAGES, { recursive: true, force: true });
  mkdirSync(IMAGES, { recursive: true });
  mkdirSync(TRUTH, { recursive: true });

  for (const spec of FIXTURES) {
    // One truth file per fixture, shared by every tier. That's the whole point:
    // holding the graph constant while image quality varies is what isolates
    // the effect of quality from the effect of the graph being hard.
    const { normalized } = renderSvg(spec);
    const truth: Graph = {
      directed: spec.directed,
      weighted: spec.edges.some(([, , w]) => w !== null),
      nodes: spec.nodes.map((label) => ({
        id: label,
        label,
        x: +(normalized.get(label)?.x ?? 0.5).toFixed(4),
        y: +(normalized.get(label)?.y ?? 0.5).toFixed(4),
      })),
      edges: spec.edges.map(([source, target, weight], i) => ({
        id: `e${i}`, source, target, weight,
      })),
    };
    writeFileSync(
      join(TRUTH, `${spec.name}.json`),
      JSON.stringify({ ...truth, _meta: { kind: spec.kind, traps: spec.traps } }, null, 2) + "\n",
    );

    const rendered: string[] = [];
    for (const tier of TIERS) {
      const { svg } = renderSvg(spec, { sketch: tier.sketch });
      const out = join(IMAGES, `${spec.name}.${tier.name}.${tier.extension}`);

      // 2x keeps small weight labels legible through the downscale the degrade
      // step applies, while staying far under Vercel's 4.5MB body limit.
      const png = execFileSync("rsvg-convert", ["-z", "2", "-f", "png"], {
        input: svg,
        maxBuffer: 64 * 1024 * 1024,
      });

      const args = tier.degrade(...dimensionsOf(png));
      execFileSync("magick", ["png:-", ...args, `${tier.extension}:${out}`], {
        input: png,
        maxBuffer: 64 * 1024 * 1024,
      });
      rendered.push(tier.name);
    }

    console.log(
      `${spec.name.padEnd(22)} ${String(spec.nodes.length).padStart(2)}n ` +
        `${String(spec.edges.length).padStart(2)}e  ` +
        `${spec.directed ? "directed  " : "undirected"}  ${spec.kind.padEnd(9)} ` +
        `${rendered.length} tiers`,
    );
  }

  const total = FIXTURES.length * TIERS.length;
  console.log(`\n${FIXTURES.length} fixtures x ${TIERS.length} tiers = ${total} images -> ${IMAGES}`);
}

/** PNG dimensions straight out of the IHDR chunk -- no decode needed. */
function dimensionsOf(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

main();
