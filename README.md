# nodify edgify

Screenshot a graph, get an editable one.

Algorithms courses run on graphs, and working with them means redrawing the same
twelve-node weighted digraph every time you want to try something. Existing
online graph editors are either algorithm demos you can't easily feed your own
graph into, or general-purpose network tools aimed at somebody else's problem.

So: paste a screenshot of the graph from your problem set, get back a real
graph you can drag, edit, export as an adjacency matrix, and run BFS on.

## Status

Early. The extraction eval harness is built and tested; the editor is not.

- [x] Graph schema, provider seam, extraction prompt
- [x] Eval harness: 12 fixtures x 5 input-quality tiers, scorer, per-tier reporting
- [ ] Pick a model from eval results
- [ ] SVG editor and correction UI
- [ ] Adjacency matrix / list / edge list views, synced
- [ ] Algorithm stepping (BFS, DFS, Dijkstra, MST)

The eval comes first on purpose. Import accuracy decides whether the headline
feature is worth building at all, and it's cheap to measure before committing to
an editor around it.

## Quickstart

Needs Node 22+, `rsvg-convert`, and ImageMagick 7.

```bash
npm install
cp .env.example .env           # add OPENROUTER_API_KEY
npm run fixtures               # render 12 fixtures x 5 quality tiers
npm test                       # scorer + fixture invariants, no API calls
npm run eval                   # score every model on every fixture
npm run eval -- --tiers clean,slide --models mistral-small-3.2
```

`npm test` needs no credentials — it checks the scoring logic and the fixture
generator against their specs.

## How extraction works

Every model routes through OpenRouter, Claude included, so the project needs one
credential. A screenshot goes to a vision model under a schema-constrained
prompt, and comes back as a `Graph` object: vertices with labels and normalized positions, edges
with their own ids and optional weights, plus graph-level `directed` and
`weighted` flags.

Two decisions shape everything else:

**Positions come from the image.** The screenshot already says where every
vertex sits, so the extracted graph keeps that layout. A force-directed
re-layout would scramble the arrangement the student is looking at and destroy
the mental map. Auto-layout is a button, never a default.

**The schema is the security boundary.** Text inside an uploaded image is read
by the model and isn't inherently distinguished from instructions. A response
constrained to a graph object has nowhere to put a smuggled instruction.
Extracted labels are still treated as untrusted strings at render time.

## Measuring it

`fixes` — the number of edit operations to turn an extraction into the truth —
is the metric that matters, because it answers the actual question: is importing
faster than redrawing? F1 can't tell a graph needing one click from one needing
six.

Every fixture renders at five input qualities (`clean`, `slide`, `photo`,
`sketch`, `sketch-photo`) against one shared truth file, so a score drop is
attributable to image quality alone rather than to the graph being harder.

See [eval/README.md](eval/README.md) for the metric definitions, the fixture
set, and what the numbers can and can't tell you.

## Known limitations

**Input quality dominates.** Clean slides beat hand-drawn graphs, by a lot.
Thin lines and arrowheads degrade under blur, compression and jitter far faster
than circles do, so the expected failure on a bad photo is *edges wrong,
vertices fine*. The plan is to degrade into partial import — "here are your
vertices, draw the edges yourself" — rather than report failure, because that
still saves most of the drawing.

**The fixtures are synthetic.** They approximate warp, noise and handwriting;
they don't reproduce real camera optics, glare, or real handwriting variance.
They rank models honestly against each other and show the shape of the quality
gradient, but they won't predict absolute real-world accuracy. Real screenshots
are the correction.

**No public benchmark measures this task.** Models scoring ~94% on AI2D
(multiple-choice diagram questions) have scored F1 0.22-0.30 on FlowLearn
(flowchart to structured output). Answering a question about a diagram is a much
easier job than emitting a complete, correct edge list, which is why this repo
carries its own eval.

## Layout

```
prompts/extract.md     the extraction prompt, swappable
src/graph/schema.ts    Zod GraphSchema: contract, type, and injection boundary
src/extract/           provider seam + model registry with per-token pricing
eval/fixtures/         specs -> layout -> SVG -> degraded images + exact truth
eval/score.ts          the metric
eval/run.ts            extract -> cache -> score -> per-tier tables
```

Adding a model is a row in `src/extract/registry.ts`. Anything on OpenRouter
needs no new code.
