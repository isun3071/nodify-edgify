import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { extractorFor, MODELS, USER_INSTRUCTION } from "../src/extract/index.js";
import type { Graph } from "../src/graph/schema.js";
import { score, zeroScore, type Score } from "./score.js";
import { parseImageName, TIERS, TIER_BY_NAME, type TierName } from "./fixtures/tiers.js";

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES = join(here, "fixtures/images");
const TRUTH = join(here, "fixtures/truth");
const RUNS = join(here, "runs");
const RESULTS = join(here, "results");
const PROMPT = join(here, "../prompts/extract.md");

interface Row {
  model: string;
  fixture: string;
  tier: TierName;
  score: Score;
  costUsd: number;
  latencyMs: number;
  /** The call never reached the model (rate limit, timeout, bad request). */
  failedCall: boolean;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1] ?? null;
  };
  return {
    models: (get("--models") ?? MODELS.map((m) => m.name).join(",")).split(","),
    tiers: (get("--tiers") ?? TIERS.map((t) => t.name).join(",")).split(",") as TierName[],
    fixtures: get("--fixtures")?.split(",") ?? null,
    noCache: argv.includes("--no-cache"),
  };
}

function cachePath(model: string, promptText: string, image: Buffer, key: string): string {
  // Every input that shapes the request belongs in the key. The user-turn
  // instruction was missing: editing it changed what the model saw while
  // leaving the key identical, so stale answers would have been served as
  // though they came from the new prompt.
  const hash = createHash("sha256")
    .update(model).update(promptText).update(USER_INSTRUCTION).update(image)
    .digest("hex").slice(0, 12);
  return join(RUNS, `${model}__${key}__${hash}.json`);
}

const pct = (x: number) => (Number.isNaN(x) ? "   - " : `${(x * 100).toFixed(0)}%`.padStart(5));
const mean = <T>(xs: T[], f: (x: T) => number) =>
  xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : NaN;

async function main() {
  const args = parseArgs();
  mkdirSync(RUNS, { recursive: true });
  mkdirSync(RESULTS, { recursive: true });

  const available = existsSync(IMAGES) ? readdirSync(IMAGES) : [];
  const targets = available
    .map((file) => ({ file, parsed: parseImageName(file) }))
    .filter((t): t is { file: string; parsed: NonNullable<ReturnType<typeof parseImageName>> } =>
      t.parsed !== null)
    .filter((t) => args.tiers.includes(t.parsed.tier))
    .filter((t) => !args.fixtures || args.fixtures.includes(t.parsed.fixture))
    .sort((a, b) => a.file.localeCompare(b.file));

  if (!targets.length) {
    console.error("No matching fixtures. Run: npm run fixtures");
    process.exit(1);
  }

  const promptText = readFileSync(PROMPT, "utf8");
  const total = args.models.length * targets.length;
  let done = 0;

  /**
   * Models run concurrently; each model's fixtures run in sequence.
   *
   * That split is deliberate. Fanning out *within* a model would multiply the
   * request rate against a single upstream provider, and this eval already
   * trips 429s at sequential pace -- mistral-small lost 8 of 12 calls to
   * DeepInfra and Parasail rate limits. Different models mostly sit behind
   * different providers, so going wide across models leaves each provider
   * seeing the same rate it saw before while cutting wall-clock by the number
   * of models. 108 sequential calls become 12 deep.
   */
  const perModel = await Promise.all(
    args.models.map(async (modelName) => {
      const extractor = extractorFor(modelName);
      const lines: string[] = [];
      const modelRows: Row[] = [];

      for (const { file, parsed } of targets) {
        const { fixture, tier } = parsed;
        const image = readFileSync(join(IMAGES, file));
        const truth = JSON.parse(readFileSync(join(TRUTH, `${fixture}.json`), "utf8")) as Graph;
        const mediaType = file.endsWith(".png") ? "image/png" : "image/jpeg";
        const cache = cachePath(modelName, promptText, image, `${fixture}.${tier}`);

        let result;
        if (!args.noCache && existsSync(cache)) {
          result = JSON.parse(readFileSync(cache, "utf8"));
        } else {
          result = await extractor.extract(image, mediaType, promptText);
          // Cache only calls the model actually answered. A model returning an
          // unparseable graph is a real result worth keeping; a rate limit or a
          // dropped connection is not, and caching those would silently poison
          // every later run with a failure that never happened.
          if (result.usage.inputTokens > 0) {
            writeFileSync(cache, JSON.stringify(result, null, 2));
          }
        }

        const s = result.graph ? score(truth, result.graph) : zeroScore(truth);
        if (!TIER_BY_NAME.get(tier)!.geometryPreserving) s.positionError = NaN;

        modelRows.push({
          model: modelName, fixture, tier, score: s,
          costUsd: result.usage.costUsd, latencyMs: result.latencyMs,
          // An empty response with no tokens billed never reached the model.
          // Kept apart from extraction quality so a throttled call is never
          // averaged in as though the model read the picture and failed.
          failedCall: !result.graph && result.usage.inputTokens === 0,
        });

        const detail = Object.entries(s.breakdown).map(([k, v]) => `${k}:${v}`).join(" ");
        lines.push(
          `  ${fixture.padEnd(20)} ${tier.padEnd(13)} ` +
            `${s.clean ? "clean " : `${String(s.fixes).padStart(2)} fix`}  ` +
            `edgeF1 ${pct(s.edges.f1)}  nodeF1 ${pct(s.nodes.f1)}  ${detail}` +
            `${result.error ? ` [${result.error.slice(0, 90)}]` : ""}`,
        );

        done++;
        process.stderr.write(`\r  ${done}/${total} calls   `);
      }
      return { modelName, lines, modelRows };
    }),
  );
  process.stderr.write("\n");

  const rows: Row[] = [];
  for (const { modelName, lines, modelRows } of perModel) {
    console.log(`\n${modelName}`);
    lines.forEach((l) => console.log(l));
    rows.push(...modelRows);
  }

  // ---- per model x tier ----
  console.log(
    `\n${"model".padEnd(20)} ${"tier".padEnd(13)} clean%  fixes  edgeF1  nodeF1  weight   $/img  failed`,
  );
  const tsv = [
    ["model", "tier", "clean", "fixes", "edgeF1", "nodeF1", "weightAcc", "costUsd", "p50ms", "failedCalls", "ranCalls"].join("\t"),
  ];

  for (const modelName of args.models) {
    for (const tier of args.tiers) {
      const cell = rows.filter((r) => r.model === modelName && r.tier === tier);
      if (!cell.length) continue;
      // Quality is measured only over calls the model actually answered. A
      // rate limit or a gateway timeout says nothing about whether a model can
      // read a graph, and averaging those in as zeros has already made two
      // decent models look worthless in this eval.
      const ran = cell.filter((r) => !r.failedCall);
      const failed = cell.length - ran.length;
      const latencies = ran.map((r) => r.latencyMs).sort((a, b) => a - b);
      const v = {
        clean: mean(ran, (r) => (r.score.clean ? 1 : 0)),
        fixes: mean(ran, (r) => r.score.fixes),
        edgeF1: mean(ran, (r) => r.score.edges.f1),
        nodeF1: mean(ran, (r) => r.score.nodes.f1),
        weight: mean(ran, (r) => r.score.weightAccuracy),
        cost: mean(ran, (r) => r.costUsd),
        p50: latencies[Math.floor(latencies.length / 2)] ?? 0,
      };
      console.log(
        `${modelName.padEnd(20)} ${tier.padEnd(13)} ${pct(v.clean)}  ` +
          `${v.fixes.toFixed(1).padStart(5)}  ${pct(v.edgeF1)}   ${pct(v.nodeF1)}   ` +
          `${pct(v.weight)}  $${v.cost.toFixed(5)}  ` +
          `${failed ? `${failed}/${cell.length}` : "  -  "}`,
      );
      tsv.push([
        modelName, tier, v.clean.toFixed(3), v.fixes.toFixed(2), v.edgeF1.toFixed(3),
        v.nodeF1.toFixed(3), v.weight.toFixed(3), v.cost.toFixed(6), String(v.p50),
        String(failed), String(ran.length),
      ].join("\t"));
    }
  }

  // ---- the partial-import question ----
  // If nodeF1 holds up as edgeF1 collapses, a bad input still yields correctly
  // placed vertices, and import should degrade to "vertices found, draw the
  // edges yourself" rather than reporting failure.
  console.log(`\nnode vs edge recovery by tier (all models pooled)`);
  console.log(`${"tier".padEnd(15)} nodeF1  edgeF1  gap`);
  for (const tier of args.tiers) {
    const cell = rows.filter((r) => r.tier === tier && !r.failedCall);
    if (!cell.length) continue;
    const n = mean(cell, (r) => r.score.nodes.f1);
    const e = mean(cell, (r) => r.score.edges.f1);
    console.log(`${tier.padEnd(15)} ${pct(n)}   ${pct(e)}  ${pct(n - e)}`);
  }

  writeFileSync(join(RESULTS, "scores.tsv"), tsv.join("\n") + "\n");
  writeFileSync(join(RESULTS, "detail.json"), JSON.stringify(rows, null, 2) + "\n");
  console.log(`\nwrote ${join(RESULTS, "scores.tsv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
