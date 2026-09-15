import type { FixtureSpec } from "./specs.js";

export interface Point { x: number; y: number }
export interface Layout {
  width: number;
  height: number;
  pos: Map<string, Point>;
}

const R = 24; // node radius, px -- render.ts uses the same value

function onCircle(cx: number, cy: number, radius: number, i: number, n: number): Point {
  // Start at the top and go clockwise, which is how these are drawn in books.
  const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
}

function components(spec: FixtureSpec): string[][] {
  const adj = new Map<string, Set<string>>(spec.nodes.map((n) => [n, new Set<string>()]));
  for (const [s, t] of spec.edges) {
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of spec.nodes) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    out.push(group);
  }
  return out;
}

export function layout(spec: FixtureSpec): Layout {
  const pos = new Map<string, Point>();

  switch (spec.layout) {
    case "circle": {
      const size = 620;
      const radius = size / 2 - R - 46; // leave room for weight labels outside
      spec.nodes.forEach((n, i) =>
        pos.set(n, onCircle(size / 2, size / 2, radius, i, spec.nodes.length)),
      );
      return { width: size, height: size, pos };
    }

    case "petersen": {
      // Outer pentagon and inner pentagram share angles, so the five spokes are
      // radial. The inner star edges then cross each other near the middle --
      // the near-miss geometry this fixture exists to test.
      const size = 620;
      const outer = size / 2 - R - 30;
      const half = spec.nodes.length / 2;
      spec.nodes.slice(0, half).forEach((n, i) =>
        pos.set(n, onCircle(size / 2, size / 2, outer, i, half)),
      );
      spec.nodes.slice(half).forEach((n, i) =>
        pos.set(n, onCircle(size / 2, size / 2, outer * 0.46, i, half)),
      );
      return { width: size, height: size, pos };
    }

    case "bipartite": {
      const width = 620, height = 520;
      const half = spec.nodes.length / 2;
      const place = (group: string[], x: number) =>
        group.forEach((n, i) =>
          pos.set(n, { x, y: (height * (i + 1)) / (group.length + 1) }),
        );
      place(spec.nodes.slice(0, half), width * 0.25);
      place(spec.nodes.slice(half), width * 0.75);
      return { width, height, pos };
    }

    case "layered": {
      const layers = spec.layers ?? [spec.nodes];
      const width = Math.max(560, 190 * layers.length);
      const height = Math.max(360, 130 * Math.max(...layers.map((l) => l.length)) + 120);
      layers.forEach((layer, li) => {
        const x = (width * (li + 1)) / (layers.length + 1);
        layer.forEach((n, i) =>
          pos.set(n, { x, y: (height * (i + 1)) / (layer.length + 1) }),
        );
      });
      return { width, height, pos };
    }

    case "clusters": {
      // Each component gets a slot sized to its own radius, then slots are laid
      // side by side. Spacing the centres evenly across a fixed canvas instead
      // lets neighbouring components overlap once a component grows.
      const GAP = 70;
      const groups = components(spec);
      const radii = groups.map((g) => (g.length === 1 ? 0 : Math.min(90, 30 * g.length)));
      const slots = radii.map((r) => 2 * (r + R));
      const width = slots.reduce((a, b) => a + b, 0) + GAP * (groups.length + 1);
      const height = 2 * (Math.max(...radii) + R) + 2 * GAP;
      const cy = height / 2;

      let cursor = GAP;
      groups.forEach((group, gi) => {
        const cx = cursor + slots[gi]! / 2;
        cursor += slots[gi]! + GAP;
        if (group.length === 1) {
          pos.set(group[0]!, { x: cx, y: cy });
        } else {
          group.forEach((n, i) => pos.set(n, onCircle(cx, cy, radii[gi]!, i, group.length)));
        }
      });
      return { width, height, pos };
    }
  }
}

export { R as NODE_RADIUS };
