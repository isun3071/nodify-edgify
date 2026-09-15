# Extraction eval

Answers one question: **which model can read a course graph off a screenshot
accurately enough that fixing its output beats redrawing the graph by hand?**

```bash
cp .env.example .env           # fill in OPENROUTER_API_KEY
npm run fixtures               # render the 12 fixtures
npm test                       # scorer self-test, no API calls
npm run eval                   # all models, all fixtures, all tiers
npm run eval -- --tiers clean,slide          # skip the hard input tiers
npm run eval -- --models mistral-small-3.2 --fixtures petersen --no-cache
```

## Metrics

`fixes` is the headline: edit operations to turn the extraction into the truth
(missing edge, spurious edge, wrong weight, wrong label, wrong directed flag).
It is the only metric that answers the real question, because F1 doesn't
distinguish a graph needing one click from one needing six.

`clean%` — fixtures needing zero fixes — is the north star. A model at 70%
clean feels like magic; one at 20% feels like a toy regardless of its F1.

Edge and node P/R/F1, weight accuracy and position error are diagnostics: they
tell you *how* a model fails once `fixes` tells you *that* it does.

Comparison rules worth knowing:
- Edges are matched as a **multiset**, so parallel edges and self-loops count
  properly instead of collapsing.
- Both sides canonicalize under the truth's directedness, so a model that got
  the topology right but the `directed` flag wrong is charged one fix, not one
  per edge.
- Weights compare as a multiset intersection, never pairwise by position.
- Node labels are matched case- and whitespace-insensitively.

## Results (round 2, Sept 2026)

9 models x 12 fixtures at the `clean` tier. `fixes` and `edgeF1` are measured
only over calls that reached the model; `failed` counts rate limits, timeouts
and rejected requests separately, because averaging those in as zeros made two
capable models look worthless in round one.

| model | $/MTok in | clean | fixes/graph | edgeF1 | weightAcc | $/import |
|---|---|---|---|---|---|---|
| **glm-5.3-flash** | **$0.075** | **9/11** | **0.5** | **96%** | **100%** | **$0.0014** |
| opus-5 | $5.00 | 10/12 | 0.8 | 97% | 95% | $0.0599 |
| gemini-3.8-flash | $0.75 | 8/12 | 1.2 | 94% | 99% | $0.0241 |
| sonnet-5 | $2.00 | 7/12 | 1.8 | 92% | 99% | $0.0270 |
| gpt-5-nano | $0.05 | 4/12 | 3.4 | 86% | 94% | $0.0020 |
| mistral-small-3.2 | $0.075 | 3/12 | 6.3 | 77% | 90% | $0.0003 |
| haiku-4.5 | $1.00 | 2/12 | 5.3 | 79% | 90% | $0.0049 |
| qwen3-vl-32b | $0.104 | 2/12 | 5.0 | 79% | 84% | $0.0005 |
| qwen3.6-plus | $0.325 | 2/12 | 9.8 | 45% | 46% | $0.0116 |

**GLM 5.3 Flash matches Opus 5 at 1/43rd the cost** -- fewer fixes per graph,
comparable edge F1, better weight accuracy. It is the default extractor, with
Opus 5 as the fallback for the one case in twelve where it returns invalid JSON.

Three findings worth keeping:

**Vertices are free; edges are the whole problem.** Every model that returned a
schema-valid graph got the vertex set exactly right -- correct count, correct
labels, nothing invented. All the damage is in edges, and especially in binding
the right weight to the right edge. The bottom of the market fails at JSON
compliance rather than at vision.

**Price does not predict quality.** A $0.075 model beat a $5.00 one, and the
$1.00 Haiku performed like the sub-$0.11 tier. Published AI2D and OCRBench
rankings were a decent way to build a shortlist and a poor way to pick a winner.

**Negative weights are the hardest fixture for every model**, the best ones
included -- minus signs get dropped or misread more than any other feature.

## What round one got wrong

Input quality tiers were a good hypothesis the data refused. Across five tiers
(`clean` through `sketch-photo`) and three models, fix counts moved within noise
-- one model trended slightly *better* on degraded images, and Opus's single
worst result came on its cleanest input. Model choice explained essentially all
variance and image quality explained none.

The likely reason is that synthetic degradation is too mild to stress a capable
model, not that photo quality is irrelevant in reality. Until real phone photos
exist to test that, `--tiers clean` is the default worth running: dropping the
tier dimension bought 4x the fixture diversity at the same call count, and the
fixtures are the axis that actually separates models.

## Input quality tiers

Every fixture renders at five input qualities against **one shared truth file**,
so graph difficulty is held constant and a score drop is attributable to image
quality alone.

| tier | what it stands for |
|---|---|
| `clean` | digital figure, PDF export, screenshot of a good slide |
| `slide` | downscaled and JPEG-compressed, as a screenshotted slide arrives |
| `photo` | phone photo of a screen or page: warped, blurred, noisy |
| `sketch` | hand-drawn, scanned flat and cleanly |
| `sketch-photo` | phone photo of a whiteboard or notebook -- realistic worst case |

Never read a single averaged number across tiers. The expected result is good on
slides, mediocre on photos, poor on handwriting, and that is a shippable answer
as long as the UI knows which case it's in.

The run prints a **node vs edge recovery** table per tier, which answers the
design question behind the tiers: circles survive blur, compression and jitter
far better than thin lines and arrowheads do. If `nodeF1` holds while `edgeF1`
collapses, a bad input still yields correctly placed vertices, and import should
degrade to "here are your vertices, draw the edges yourself" rather than
reporting failure. That still saves most of the drawing.

Position error is suppressed on `photo` and `sketch-photo`: the perspective warp
moves vertices, so the truth's coordinates no longer describe the image.
Structural scoring is unaffected.

## Fixtures

Six canonical graphs a student actually meets (K5, K3,3, Petersen, a
CLRS-style Dijkstra graph, an MST example, a topological-sort DAG) and six
built to break one specific thing each:

| fixture | targets |
|---|---|
| `self-loops-parallel` | self-loops, parallel edges |
| `numeric-labels` | vertices labeled 0-5 *and* numeric weights |
| `disconnected` | three components, one isolated vertex |
| `negative-weights` | minus signs |
| `flow-network` | antiparallel pairs with different capacities |
| `dense-crossings` | many crossings, phantom-edge risk |

Ground truth is exact by construction: `specs.ts` produces both the rendered
image and the truth JSON, so there is no transcription to get wrong.

**These numbers will run optimistic.** Rendered SVG is cleaner than a
photographed slide — crisp strokes, uniform fonts, no compression artifacts, no
perspective. The fixtures rank models honestly against each other; they do not
predict real-world accuracy. Drop real screenshots into `fixtures/images/` with
matching truth files to correct that, and expect scores to fall.

## Cost

Responses are cached on `(model, prompt, image bytes)`, so re-scoring is free —
which matters, because the scorer gets rewritten a few times before "a fix"
settles down. Only a changed prompt or a new model spends money. Failed calls
are not cached.

A full run is 12 fixtures x 5 tiers x 5 models = 300 calls: roughly $1.50 for
Opus 5 and a few cents for the four cheap models combined. `--tiers clean,slide`
cuts that to 120 calls while still covering the inputs most users will actually
paste in.

## Adding a model

Add a row to `src/extract/registry.ts`. Anything on OpenRouter needs no new
code. Verify the slug and the `structured_outputs` flag at
https://openrouter.ai/models first — an endpoint that treats the schema as a
hint rather than a constraint shows up as parse failures.
