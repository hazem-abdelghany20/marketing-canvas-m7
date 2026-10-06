import { describe, expect, it } from "vitest";
import { byIdMap, edge, node, SEED_ANNOTATIONS, SEED_EDGES, SEED_NODES } from "../../test/seed";
import type { CanvasNode, Edge } from "../../types";
import { buildGraph, buildTrace, MAX_TRACE_ROWS, reachesGoal, rowLabel, tracePathTo, type TraceRow } from "../traceModel";

const graph = (nodes: CanvasNode[] = SEED_NODES, edges: Edge[] = SEED_EDGES) =>
  buildGraph({ nodes: byIdMap(nodes), edges: byIdMap(edges), annotations: byIdMap(SEED_ANNOTATIONS) });

const titles = (row: TraceRow) => row.cards.map((card) => card.node.title);
const ids = (row: TraceRow) => row.cards.map((card) => card.node.id);
/** The card on screen in each row. */
const onScreen = (rows: TraceRow[]) => rows.map((row) => row.cards[row.selected]?.node.id);

describe("the rows of a trace", () => {
  it("starts with the goals, in the order the API gave them, and one row under the first for each layer that serves it", () => {
    const rows = buildTrace(graph());

    expect(rows).toHaveLength(4);
    expect(ids(rows[0]!)).toEqual(["nd_goal_vayn", "nd_goal_md"]);
    expect(ids(rows[1]!)).toEqual(["nd_str_icp", "nd_str_pos"]);
    expect(ids(rows[2]!)).toEqual(["nd_cmp_linen"]);
    expect(ids(rows[3]!)).toEqual(["nd_con_linenstyle", "nd_con_quiet"]);
    expect(onScreen(rows)).toEqual(["nd_goal_vayn", "nd_str_icp", "nd_cmp_linen", "nd_con_linenstyle"]);
  });

  it("hangs each row from the card on screen above it, and says so", () => {
    const rows = buildTrace(graph());

    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 3]);
    expect(rows.map((row) => row.parentId)).toEqual([null, "nd_goal_vayn", "nd_str_icp", "nd_cmp_linen"]);
  });

  it("redraws every row under a card that is chosen, starting each at its first card", () => {
    const otherGoal = buildTrace(graph(), ["nd_goal_md"]);
    expect(onScreen(otherGoal)).toEqual(["nd_goal_md", "nd_str_voice", "nd_cmp_ee", "nd_con_2am"]);

    const otherStrategy = buildTrace(graph(), ["nd_goal_vayn", "nd_str_pos"]);
    expect(onScreen(otherStrategy)).toEqual(["nd_goal_vayn", "nd_str_pos", "nd_cmp_ramadan", "nd_con_email"]);
  });

  it("keeps a choice made lower down only while the cards above it are the ones it was made under", () => {
    // The second piece of content under the linen drop, but under the first strategy.
    const kept = buildTrace(graph(), ["nd_goal_vayn", "nd_str_icp", "nd_cmp_linen", "nd_con_quiet"]);
    expect(onScreen(kept)).toEqual(["nd_goal_vayn", "nd_str_icp", "nd_cmp_linen", "nd_con_quiet"]);

    // Move to the other strategy and the same path no longer applies below it: those rows start over.
    const moved = buildTrace(graph(), ["nd_goal_vayn", "nd_str_pos", "nd_cmp_linen", "nd_con_quiet"]);
    expect(onScreen(moved)).toEqual(["nd_goal_vayn", "nd_str_pos", "nd_cmp_ramadan", "nd_con_email"]);
  });

  it("falls back to the first card in a row whose chosen node is gone", () => {
    const rows = buildTrace(graph(), ["nd_deleted", "nd_deleted_too"]);

    expect(onScreen(rows)).toEqual(["nd_goal_vayn", "nd_str_icp", "nd_cmp_linen", "nd_con_linenstyle"]);
  });

  it("is empty when there is no goal to start from", () => {
    const withoutGoals = SEED_NODES.filter((n) => n.type !== "goal");

    expect(buildTrace(graph(withoutGoals))).toEqual([]);
    expect(buildTrace(graph([], []))).toEqual([]);
  });

  it("labels a row by the one type it holds, and by 'Served by' when it holds more than one", () => {
    const rows = buildTrace(graph());
    expect(rows.map(rowLabel)).toEqual(["Goal", "Strategy", "Campaign", "Content"]);

    const direct = node("nd_con_direct", "content", "A reel made straight for the goal");
    const mixed = buildTrace(graph([...SEED_NODES, direct], [...SEED_EDGES, edge(99, "nd_con_direct", "nd_goal_vayn")]));
    expect(titles(mixed[1]!)).toEqual([
      "Vayn ICP: 25-34 urban women",
      "Vayn positioning: quiet luxury, not fast fashion",
      "A reel made straight for the goal",
    ]);
    expect(mixed[1]!.type).toBeNull();
    expect(rowLabel(mixed[1]!)).toBe("Served by");
  });
});

describe("a card", () => {
  const rows = buildTrace(graph());
  const card = (row: number, id: string) => rows[row]!.cards.find((c) => c.node.id === id)!;

  it("tells a goal how many nodes sit under it at any depth, and any other card how many serve it", () => {
    expect(card(0, "nd_goal_vayn").under).toBe(7);
    expect(card(0, "nd_goal_md").under).toBe(3);
    expect(card(0, "nd_goal_vayn").serving).toBe(2);
    expect(card(1, "nd_str_icp").serving).toBe(1);
    expect(card(3, "nd_con_linenstyle").serving).toBe(0);
  });

  it("names the one type that serves it, when they share one", () => {
    expect(card(0, "nd_goal_vayn").servingType).toBe("strategy");
    expect(card(1, "nd_str_icp").servingType).toBe("campaign");
    expect(card(2, "nd_cmp_linen").servingType).toBe("content");
    expect(card(3, "nd_con_linenstyle").servingType).toBeNull();
  });

  it("lists what it is joined to by relates-to, from either end, and counts its notes", () => {
    expect(card(3, "nd_con_linenstyle").related.map((n) => n.id)).toEqual(["nd_ast_hero"]);
    expect(card(3, "nd_con_linenstyle").notes).toBe(1);
    expect(card(0, "nd_goal_vayn").notes).toBe(1);
    expect(card(2, "nd_cmp_linen").related).toEqual([]);

    const positioning = buildTrace(graph(), ["nd_goal_vayn", "nd_str_pos"])[1]!.cards.find((c) => c.node.id === "nd_str_pos")!;
    expect(positioning.related.map((n) => n.id)).toEqual(["nd_not_price"]);
  });

  it("does not count a relates-to edge as serving", () => {
    expect(buildTrace(graph(), ["nd_goal_vayn", "nd_str_pos"])[2]!.cards.map((c) => c.node.id)).toEqual(["nd_cmp_ramadan"]);
    expect(ids(buildTrace(graph(), ["nd_goal_vayn", "nd_str_pos", "nd_cmp_ramadan"])[3]!)).toEqual(["nd_con_email"]);
  });
});

describe("what is expected below a card nothing serves", () => {
  it("gives a goal, a strategy or a campaign an empty row, naming the layer that would go in it", () => {
    const onlyGoal = buildTrace(graph([SEED_NODES[0]!], []));
    expect(onlyGoal).toHaveLength(2);
    expect(onlyGoal[1]).toMatchObject({ cards: [], parentId: "nd_goal_vayn", addType: "strategy" });
    expect(rowLabel(onlyGoal[1]!)).toBe("Strategy");

    const goalAndStrategy = buildTrace(
      graph([SEED_NODES[0]!, SEED_NODES[2]!], [edge(1, "nd_str_icp", "nd_goal_vayn")]),
    );
    expect(goalAndStrategy[2]).toMatchObject({ cards: [], parentId: "nd_str_icp", addType: "campaign" });

    const toCampaign = buildTrace(
      graph(
        [SEED_NODES[0]!, SEED_NODES[2]!, SEED_NODES[6]!],
        [edge(1, "nd_str_icp", "nd_goal_vayn"), edge(2, "nd_cmp_linen", "nd_str_icp")],
      ),
    );
    expect(toCampaign[3]).toMatchObject({ cards: [], parentId: "nd_cmp_linen", addType: "content" });
  });

  it("gives content, and anything else, no row below it: nothing is expected to serve a finished piece", () => {
    const rows = buildTrace(graph());
    expect(rows.at(-1)!.cards.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(4);

    const reelNothingServes = buildTrace(graph(), ["nd_goal_vayn", "nd_str_icp", "nd_cmp_linen", "nd_con_quiet"]);
    expect(reelNothingServes).toHaveLength(4);
  });
});

describe("loops and depth", () => {
  it("never shows a node twice in one chain, however the serves edges loop", () => {
    // goal ← strategy ← campaign ← content, and the strategy serves that content: a loop of three.
    const nodes = [
      node("g", "goal", "Goal"),
      node("s", "strategy", "Strategy"),
      node("c", "campaign", "Campaign"),
      node("k", "content", "Content"),
    ];
    const edges = [edge(1, "s", "g"), edge(2, "c", "s"), edge(3, "k", "c"), edge(4, "s", "k")];

    const rows = buildTrace(graph(nodes, edges));

    expect(onScreen(rows)).toEqual(["g", "s", "c", "k"]);
    expect(new Set(onScreen(rows)).size).toBe(rows.length);
  });

  it("stops at a fixed number of rows", () => {
    const nodes = [node("n0", "goal", "Goal")];
    const edges: Edge[] = [];
    for (let i = 1; i <= 20; i++) {
      nodes.push(node(`n${i}`, "strategy", `Step ${i}`));
      edges.push(edge(i, `n${i}`, `n${i - 1}`));
    }

    expect(buildTrace(graph(nodes, edges)).length).toBeLessThanOrEqual(MAX_TRACE_ROWS);
  });
});

describe("the chain from a node up to its goal", () => {
  it("is the goal first and the node last", () => {
    expect(tracePathTo(graph(), "nd_con_linenstyle")).toEqual([
      "nd_goal_vayn",
      "nd_str_icp",
      "nd_cmp_linen",
      "nd_con_linenstyle",
    ]);
    expect(tracePathTo(graph(), "nd_con_2am")).toEqual(["nd_goal_md", "nd_str_voice", "nd_cmp_ee", "nd_con_2am"]);
  });

  it("is just the goal for a goal, and for a node partway up", () => {
    expect(tracePathTo(graph(), "nd_goal_md")).toEqual(["nd_goal_md"]);
    expect(tracePathTo(graph(), "nd_str_pos")).toEqual(["nd_goal_vayn", "nd_str_pos"]);
  });

  it("is nothing for a node that serves nothing: relates-to does not lead to a goal", () => {
    expect(tracePathTo(graph(), "nd_not_reach")).toBeNull();
    expect(tracePathTo(graph(), "nd_not_price")).toBeNull();
    expect(tracePathTo(graph(), "nd_ast_hero")).toBeNull();
    expect(tracePathTo(graph(), "nd_not_there")).toBeNull();
  });

  it("takes the way that reaches a goal when a node serves more than one thing, the first in board order if several do", () => {
    const nodes = [
      node("g1", "goal", "One"),
      node("g2", "goal", "Two"),
      node("s1", "strategy", "A"),
      node("s2", "strategy", "B"),
      node("k", "content", "Both"),
    ];
    const edges = [edge(1, "s1", "g1"), edge(2, "s2", "g2"), edge(3, "k", "s2"), edge(4, "k", "s1")];

    expect(tracePathTo(graph(nodes, edges), "k")).toEqual(["g1", "s1", "k"]);
  });

  it("reaches a goal, or not, by the same walk", () => {
    expect(reachesGoal(graph(), "nd_con_quiet")).toBe(true);
    expect(reachesGoal(graph(), "nd_goal_vayn")).toBe(true);
    expect(reachesGoal(graph(), "nd_not_reach")).toBe(false);
  });

  it("does not loop forever on edges that go round", () => {
    const nodes = [node("a", "strategy", "A"), node("b", "strategy", "B")];
    const edges = [edge(1, "a", "b"), edge(2, "b", "a")];

    expect(tracePathTo(graph(nodes, edges), "a")).toBeNull();
  });
});
