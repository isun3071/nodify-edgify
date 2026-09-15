import { readFileSync } from "node:fs";
import { score } from "./score.js";
import type { Graph } from "../src/graph/schema.js";

const load = (n: string): Graph =>
  JSON.parse(readFileSync(new URL(`./fixtures/truth/${n}.json`, import.meta.url), "utf8"));
const clone = (g: Graph): Graph => JSON.parse(JSON.stringify(g));

let failures = 0;
function check(name: string, got: number, want: number, extra = "") {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? " ok " : "FAIL"} ${name.padEnd(46)} fixes=${got} want=${want} ${extra}`);
}

const dijkstra = load("dijkstra-clrs");
const loops = load("self-loops-parallel");
const k5 = load("k5");

// identity
check("identity: dijkstra", score(dijkstra, clone(dijkstra)).fixes, 0);
check("identity: self-loops+parallel", score(loops, clone(loops)).fixes, 0);
check("identity: k5 (undirected)", score(k5, clone(k5)).fixes, 0);

// one missing edge
{ const g = clone(dijkstra); g.edges.splice(0, 1);
  check("drop one edge", score(dijkstra, g).fixes, 1); }

// one spurious edge
{ const g = clone(dijkstra); g.edges.push({ id: "x", source: "s", target: "x", weight: 1, label: null });
  check("add one phantom edge", score(dijkstra, g).fixes, 1); }

// wrong weight
{ const g = clone(dijkstra); g.edges[0]!.weight = 99;
  check("one wrong weight", score(dijkstra, g).fixes, 1); }

// direction flipped on one edge: one missing + one spurious
{ const g = clone(dijkstra); const e = g.edges[0]!; [e.source, e.target] = [e.target, e.source];
  check("reverse one edge", score(dijkstra, g).fixes, 2, "(1 missing + 1 spurious)"); }

// directed flag wrong but topology intact -> charged once, not per edge
{ const g = clone(dijkstra); g.directed = false;
  const s = score(dijkstra, g);
  check("directed flag flipped, topology kept", s.fixes, 1, `edgeF1=${s.edges.f1.toFixed(2)}`); }

// undirected edge listed in the other order is the SAME edge
{ const g = clone(k5); const e = g.edges[0]!; [e.source, e.target] = [e.target, e.source];
  check("undirected edge order swapped", score(k5, g).fixes, 0); }

// parallel edges collapsed into one
{ const g = clone(loops);
  const i = g.edges.findIndex((e) => e.source === "q0" && e.target === "q1");
  g.edges.splice(i, 1);
  check("collapse parallel edge pair", score(loops, g).fixes, 1); }

// self-loop dropped
{ const g = clone(loops);
  g.edges = g.edges.filter((e) => e.source !== e.target || e.source !== "q1");
  check("drop a self-loop", score(loops, g).fixes, 1); }

// missing node takes its edges with it
{ const g = clone(dijkstra);
  g.nodes = g.nodes.filter((n) => n.label !== "z");
  g.edges = g.edges.filter((e) => e.source !== "z" && e.target !== "z");
  const s = score(dijkstra, g);
  check("drop node z and its 4 edges", s.fixes, 5, `(1 node + 4 edges)`); }

// label case/whitespace must not count as a different vertex
{ const g = clone(k5); g.nodes[0]!.label = " a ";
  check("label ' a ' vs 'A'", score(k5, g).fixes, 0); }

// ---- automata fields ----
const dfa = load("dfa-binary");
check("identity: dfa-binary", score(dfa, clone(dfa)).fixes, 0);

{ const g = clone(dfa); g.nodes.find((n) => n.label === "q0")!.accept = false;
  check("accepting state missed", score(dfa, g).fixes, 1); }

{ const g = clone(dfa); g.nodes.find((n) => n.label === "q0")!.start = false;
  check("start state missed", score(dfa, g).fixes, 1); }

{ const g = clone(dfa); const n = g.nodes.find((x) => x.label === "q0")!;
  n.start = false; n.accept = false;
  check("q0 is BOTH start and accept; losing both", score(dfa, g).fixes, 2,
    "(two independent flags, not one enum)"); }

{ const g = clone(dfa); g.edges[0]!.label = "1";
  check("transition symbol misread", score(dfa, g).fixes, 1); }

{ const g = clone(dfa); const e = g.edges[0]!; e.label = null; e.weight = 0;
  check("symbol coerced into a weight", score(dfa, g).fixes, 2,
    "(wrong symbol + wrong weight)"); }

const nfa = load("nfa-multisymbol");
check("identity: nfa-multisymbol", score(nfa, clone(nfa)).fixes, 0);

{ const g = clone(nfa); const e = g.edges.find((x) => x.label === "a,b")!;
  e.label = "a";
  check("comma-separated symbol set split", score(nfa, g).fixes, 1); }

console.log(failures ? `\n${failures} scorer test(s) failed` : "\nscorer behaves as specified");
process.exit(failures ? 1 : 0);
