# Extraction eval

Answers one question: **which model can read a course graph off a screenshot
accurately enough that fixing its output beats redrawing the graph by hand?**

```bash
cp .env.example .env.local     # fill in ANTHROPIC_API_KEY + OPENROUTER_API_KEY
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
