import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH } from "../../components/NodeCard";
import type { CanvasNode, Edge, EdgeKind, NodeType } from "../../types";
import { autoArrange } from "../autoArrange";

const T = "2026-09-01T00:00:00.000Z";

function node(id: string, type: NodeType, title: string, x = 0, y = 0): CanvasNode {
  return { id, type, title, body: "", fileIds: [], x, y, createdAt: T, updatedAt: T };
}

let edgeSeq = 0;
function edge(fromId: string, toId: string, kind: EdgeKind = "serves"): Edge {
  return { id: `ed_${++edgeSeq}`, fromId, toId, kind, label: null };
}

/** Three chains of content → campaign → strategy → goal: twelve nodes. */
function twelveChained() {
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];
  for (const n of [1, 2, 3]) {
    nodes.push(
      node(`goal${n}`, "goal", `Goal ${n}`),
      node(`str${n}`, "strategy", `Strategy ${n}`),
      node(`cmp${n}`, "campaign", `Campaign ${n}`),
      node(`con${n}`, "content", `Content ${n}`),
    );
    edges.push(edge(`con${n}`, `cmp${n}`), edge(`cmp${n}`, `str${n}`), edge(`str${n}`, `goal${n}`));
  }
  return { nodes, edges };
}

const rect = (p: { x: number; y: number }) => ({
  left: p.x,
  top: p.y,
  right: p.x + CARD_WIDTH,
  bottom: p.y + CARD_HEIGHT,
});

describe("autoArrange layers", () => {
  it("puts goals above strategies, strategies above campaigns and campaigns above content", () => {
    const { nodes, edges } = twelveChained();
    const at = autoArrange(nodes, edges);

    const ys = (prefix: string) => [1, 2, 3].map((n) => at[`${prefix}${n}`]!.y);
    const rows = { goal: ys("goal"), str: ys("str"), cmp: ys("cmp"), con: ys("con") };

    expect(Math.max(...rows.goal)).toBeLessThan(Math.min(...rows.str));
    expect(Math.max(...rows.str)).toBeLessThan(Math.min(...rows.cmp));
    expect(Math.max(...rows.cmp)).toBeLessThan(Math.min(...rows.con));
    // One row per layer: everything of a type shares a y.
    for (const row of Object.values(rows)) expect(new Set(row).size).toBe(1);
  });

  it("puts content and assets that serve something on the same row", () => {
    const nodes = [
      node("cmp", "campaign", "Campaign"),
      node("con", "content", "Reel"),
      node("ast", "asset", "lookbook.pdf"),
    ];
    const at = autoArrange(nodes, [edge("con", "cmp"), edge("ast", "cmp")]);

    expect(at.con!.y).toBe(at.ast!.y);
    expect(at.con!.y).toBeGreaterThan(at.cmp!.y);
  });

  it("puts a note that serves something on its own row below content", () => {
    const nodes = [
      node("str", "strategy", "Positioning"),
      node("con", "content", "Reel"),
      node("note", "note", "Price dropped"),
    ];
    const at = autoArrange(nodes, [edge("con", "str"), edge("note", "str")]);

    expect(at.note!.y).toBeGreaterThan(at.con!.y);
    expect(at.con!.y).toBeGreaterThan(at.str!.y);
  });

  it("places nodes with no serves edge in one row beneath every layered row, whatever their type", () => {
    const nodes = [
      node("goal", "goal", "Goal"),
      node("cmp", "campaign", "Campaign"),
      node("con", "content", "Reel"),
      node("lone-goal", "goal", "A goal nothing serves"),
      node("lone-note", "note", "Competitor dropped price"),
      node("lone-asset", "asset", "hero.jpg"),
    ];
    const at = autoArrange(nodes, [edge("con", "cmp"), edge("cmp", "goal")]);

    const loose = ["lone-goal", "lone-note", "lone-asset"].map((id) => at[id]!);
    expect(new Set(loose.map((p) => p.y)).size).toBe(1);
    expect(loose[0]!.y).toBeGreaterThanOrEqual(at.con!.y + CARD_HEIGHT);
  });

  it("keeps the loose row beneath even a layered note row", () => {
    const nodes = [
      node("goal", "goal", "Goal"),
      node("str", "strategy", "Positioning"),
      node("note", "note", "Price dropped"),
      node("lone", "asset", "hero.jpg"),
    ];
    const at = autoArrange(nodes, [edge("str", "goal"), edge("note", "str")]);

    expect(at.lone!.y).toBeGreaterThanOrEqual(at.note!.y + CARD_HEIGHT);
  });

  it("treats a node whose only edges are relates-to as having no serves edge", () => {
    const nodes = [
      node("goal", "goal", "Goal"),
      node("str", "strategy", "Positioning"),
      node("con", "content", "Reel"),
      node("ast", "asset", "lookbook.pdf"),
    ];
    const at = autoArrange(nodes, [edge("str", "goal"), edge("con", "str"), edge("ast", "str", "relates-to")]);

    // Counted as layered, the asset would share the content row; it is loose, so it sits beneath it.
    expect(at.ast!.y).toBeGreaterThanOrEqual(at.con!.y + CARD_HEIGHT);
  });

  it("ignores a serves edge that points at a node which is not on the board", () => {
    const nodes = [node("goal", "goal", "Goal"), node("con", "content", "Orphaned reel")];
    const at = autoArrange(nodes, [edge("con", "deleted-campaign"), edge("deleted-strategy", "goal")]);

    // Neither edge connects two present nodes, so both nodes are loose and share one row.
    expect(at.con!.y).toBe(at.goal!.y);
  });

  it("keeps every node: nothing is omitted, nothing is added", () => {
    const { nodes, edges } = twelveChained();
    const loose = node("loose", "note", "Loose thought");
    const at = autoArrange([...nodes, loose], edges);

    expect(Object.keys(at).sort()).toEqual([...nodes.map((n) => n.id), "loose"].sort());
  });

  it("returns nothing for an empty board", () => {
    expect(autoArrange([], [])).toEqual({});
  });

  it("lays a board with no serves edges at all out as a single row", () => {
    const nodes = [node("a", "note", "A"), node("b", "goal", "B"), node("c", "asset", "C")];
    const at = autoArrange(nodes, []);

    expect(new Set(Object.values(at).map((p) => p.y)).size).toBe(1);
    expect(new Set(Object.values(at).map((p) => p.x)).size).toBe(3);
  });
});

describe("autoArrange row order", () => {
  it("sits each node under the nodes it serves, even when titles would order them the other way", () => {
    const nodes = [
      node("goalA", "goal", "Goal A"),
      node("goalB", "goal", "Goal B"),
      // Alphabetically "Strategy 1" is first, but it serves the right-hand goal.
      node("s1", "strategy", "Strategy 1"),
      node("s2", "strategy", "Strategy 2"),
    ];
    const at = autoArrange(nodes, [edge("s1", "goalB"), edge("s2", "goalA")]);

    expect(at.goalA!.x).toBeLessThan(at.goalB!.x);
    expect(at.s2!.x).toBeLessThan(at.s1!.x);
  });

  it("places a node that serves two parents midway between them", () => {
    const nodes = [
      node("g1", "goal", "Goal 1"),
      node("g2", "goal", "Goal 2"),
      node("s", "strategy", "Shared strategy"),
    ];
    const at = autoArrange(nodes, [edge("s", "g1"), edge("s", "g2")]);

    const mid = (at.g1!.x + at.g2!.x) / 2;
    expect(Math.abs(at.s!.x - mid)).toBeLessThanOrEqual(1);
  });

  it("follows the nodes above all the way down, not just one level", () => {
    // Goal A and Goal B; "Strategy 9" serves B, "Strategy 1" serves A.
    // "Campaign Z" serves Strategy 1, "Campaign A" serves Strategy 9: by title Campaign A would come first.
    const nodes = [
      node("gA", "goal", "Goal A"),
      node("gB", "goal", "Goal B"),
      node("s9", "strategy", "Strategy 9"),
      node("s1", "strategy", "Strategy 1"),
      node("cZ", "campaign", "Campaign Z"),
      node("cA", "campaign", "Campaign A"),
    ];
    const at = autoArrange(nodes, [edge("s9", "gB"), edge("s1", "gA"), edge("cZ", "s1"), edge("cA", "s9")]);

    expect(at.s1!.x).toBeLessThan(at.s9!.x);
    expect(at.cZ!.x).toBeLessThan(at.cA!.x);
  });

  it("lets a relates-to edge between layered nodes leave the order alone", () => {
    const nodes = [
      node("gA", "goal", "Goal A"),
      node("gB", "goal", "Goal B"),
      node("s1", "strategy", "Strategy 1"),
      node("s2", "strategy", "Strategy 2"),
    ];
    const serving = [edge("s1", "gA"), edge("s2", "gB")];
    const plain = autoArrange(nodes, serving);
    const withRelation = autoArrange(nodes, [...serving, edge("s1", "gB", "relates-to")]);

    expect(withRelation).toEqual(plain);
  });

  it("copes with a layered node that serves nothing above it", () => {
    // Campaigns serve the strategy, but the strategy serves no goal.
    const nodes = [
      node("s", "strategy", "Strategy"),
      node("c1", "campaign", "Campaign 1"),
      node("c2", "campaign", "Campaign 2"),
    ];
    const at = autoArrange(nodes, [edge("c1", "s"), edge("c2", "s")]);

    for (const p of Object.values(at)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(at.s!.y).toBeLessThan(at.c1!.y);
    expect(at.c1!.x).toBeLessThan(at.c2!.x);
  });

  it("terminates on serves edges that run sideways or loop", () => {
    const nodes = [
      node("a", "campaign", "Campaign A"),
      node("b", "campaign", "Campaign B"),
      node("c", "content", "Reel"),
      node("d", "content", "Reel 2"),
    ];
    const at = autoArrange(nodes, [edge("a", "b"), edge("b", "a"), edge("c", "d")]);

    expect(Object.keys(at).sort()).toEqual(["a", "b", "c", "d"]);
    expect(at.a!.y).toBe(at.b!.y);
    expect(at.a!.y).toBeLessThan(at.c!.y);
  });

  it("orders the top row, and ties, by title", () => {
    const nodes = [
      node("g2", "goal", "Beta goal"),
      node("g1", "goal", "Alpha goal"),
      node("s", "strategy", "Strategy"),
    ];
    const at = autoArrange(nodes, [edge("s", "g1"), edge("s", "g2")]);

    expect(at.g1!.x).toBeLessThan(at.g2!.x);
  });
});

describe("autoArrange geometry", () => {
  it("never lets two cards touch, and leaves room between rows for the lines", () => {
    const { nodes, edges } = twelveChained();
    const loose = [node("l1", "note", "Loose 1"), node("l2", "asset", "Loose 2")];
    const at = autoArrange([...nodes, ...loose], edges);

    const ids = Object.keys(at);
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const ra = rect(at[a]!);
        const rb = rect(at[b]!);
        const apartX = ra.right + 16 <= rb.left || rb.right + 16 <= ra.left;
        const apartY = ra.bottom + 40 <= rb.top || rb.bottom + 40 <= ra.top;
        expect(apartX || apartY, `${a} and ${b} are too close`).toBe(true);
      }
    }
  });

  it("returns whole pixels", () => {
    const { nodes, edges } = twelveChained();
    const odd = nodes.map((n, i) => ({ ...n, x: i * 37.7, y: i * 11.3 }));
    for (const p of Object.values(autoArrange(odd, edges))) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it("keeps the graph centred where it already was, so it stays in view", () => {
    const { nodes, edges } = twelveChained();
    const far = nodes.map((n, i) => ({ ...n, x: 5000 + (i % 4) * 300, y: -3000 + Math.floor(i / 4) * 200 }));
    const centre = (list: Array<{ x: number; y: number }>) => ({
      x: (Math.min(...list.map((p) => p.x)) + Math.max(...list.map((p) => p.x + CARD_WIDTH))) / 2,
      y: (Math.min(...list.map((p) => p.y)) + Math.max(...list.map((p) => p.y + CARD_HEIGHT))) / 2,
    });

    const after = centre(Object.values(autoArrange(far, edges)));
    const before = centre(far);

    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });
});

describe("autoArrange as a function", () => {
  it("gives the same layout however the nodes and edges happen to be ordered", () => {
    const { nodes, edges } = twelveChained();
    const forward = autoArrange(nodes, edges);
    const backward = autoArrange([...nodes].reverse(), [...edges].reverse());

    expect(backward).toEqual(forward);
  });

  it("gives nodes with the same title the same places whatever order they arrive in", () => {
    const nodes = [node("a", "note", "Untitled"), node("b", "note", "Untitled"), node("c", "note", "Untitled")];

    expect(autoArrange([...nodes].reverse(), [])).toEqual(autoArrange(nodes, []));
  });

  it("is stable: arranging an arranged board moves nothing", () => {
    const { nodes, edges } = twelveChained();
    const once = autoArrange(nodes, edges);
    const placed = nodes.map((n) => ({ ...n, ...once[n.id]! }));

    expect(autoArrange(placed, edges)).toEqual(once);
  });

  it("does not touch its inputs", () => {
    const { nodes, edges } = twelveChained();
    const frozenNodes = nodes.map((n) => Object.freeze({ ...n }));
    const frozenEdges = edges.map((e) => Object.freeze({ ...e }));
    const before = JSON.stringify([frozenNodes, frozenEdges]);

    autoArrange(Object.freeze(frozenNodes) as CanvasNode[], Object.freeze(frozenEdges) as Edge[]);

    expect(JSON.stringify([frozenNodes, frozenEdges])).toBe(before);
  });
});
