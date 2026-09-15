# nodify edgify

Screenshot a graph, get an editable one.

Photograph or screenshot a graph from a problem set, lecture slide or textbook,
and have it editable in a click or two -- instead of sitting down and rebuilding
the whole thing by hand.

That is the whole point, and it is the one thing no existing tool does. Plenty
of them simulate algorithms better than this ever will: VisuAlgo, CS Academy and
learngraphtheory are good at stepping through Dijkstra. None of them will read
your graph out of a picture. Getting the graph *in* is the hard part, and it is
the part everyone re-does by hand.

Measured over the 12 fixtures of round two: **0.5 fixes per imported graph.** "One or two edits" is
the result, not the aspiration -- see [eval/README.md](eval/README.md).

## Status

Early. The extraction eval harness is built and tested; the editor is not.

- [x] Graph schema, provider seam, extraction prompt
- [x] Eval harness: 14 fixtures x 5 input-quality tiers, scorer, per-tier reporting
- [x] Model chosen: GLM 5.3 Flash, Opus 5 as fallback ($0.0014/import)
- [x] Automata notation in the schema (start/accept states, transition symbols)
- [ ] SVG editor and correction UI -- the critical path
- [ ] Export: TikZ, adjacency matrix / list, edge list, DOT
- [ ] Export targets for tools that simulate well (VisuAlgo, CS Academy edge lists)
- [ ] Maybe: a token BFS/DFS, only to sanity-check that an import is right

The eval comes first on purpose. Import accuracy decides whether the headline
feature is worth building at all, and it's cheap to measure before committing to
an editor around it.

**Algorithm stepping is deliberately not a goal.** Other tools do it better, and
competing there would mean building a worse VisuAlgo. This is the on-ramp: it
gets your graph out of a picture and into whatever you actually use. That makes
export half the product rather than an afterthought -- TikZ for writing up
solutions, edge lists for the simulators, adjacency structures for code.

## Quickstart

Needs Node 22+, `rsvg-convert`, and ImageMagick 7.

```bash
npm install
cp .env.example .env           # add OPENROUTER_API_KEY
npm run fixtures               # render 14 fixtures x 5 quality tiers
npm test                       # scorer + fixture invariants, no API calls
npm run eval                   # score every model on every fixture
npm run eval -- --tiers clean,slide --models mistral-small-3.2
```

`npm test` needs no credentials — it checks the scoring logic and the fixture
generator against their specs.

## How extraction works

Every model routes through OpenRouter, Claude included, so the project needs one
credential. The default is GLM 5.3 Flash, which matched Opus 5 on extraction
quality at 1/43rd the cost, with Opus 5 as a fallback for the rare response that
fails schema validation -- about $1.40 per thousand imports. See
[eval/README.md](eval/README.md) for the numbers.

A screenshot goes to a vision model under a schema-constrained
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
