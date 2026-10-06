import { describe, expect, it } from "vitest";
import { byIdMap, edge, node, SEED_ANNOTATIONS, SEED_EDGES, SEED_NODES } from "../../test/seed";
import type { CanvasNode, Edge } from "../../types";
import { buildGraph } from "../../trace/traceModel";
import { buildFind, FIND_FILTERS, type FindFilter, type FindGroup, type FindRow } from "../findModel";

const graph = (nodes: CanvasNode[] = SEED_NODES, edges: Edge[] = SEED_EDGES) =>
  buildGraph({ nodes: byIdMap(nodes), edges: byIdMap(edges), annotations: byIdMap(SEED_ANNOTATIONS) });

const index = (g = graph()) => {
  const view = buildFind(g, "", "all");
  if (view.kind !== "index") throw new Error(`expected an index, got ${view.kind}`);
  return view.groups;
};
const list = (query: string, filter: FindFilter = "all", g = graph()) => {
  const view = buildFind(g, query, filter);
  if (view.kind !== "list") throw new Error(`expected a list, got ${view.kind}`);
  return view;
};
const ids = (rows: FindRow[]) => rows.map((row) => row.node.id);
const group = (groups: FindGroup[], id: string) => groups.find((g) => g.id === id)!;

describe("Find with nothing typed", () => {
  it("is empty on a board with nothing on it", () => {
    expect(buildFind(graph([], []), "", "all")).toEqual({ kind: "empty" });
    expect(buildFind(graph([], []), "linen", "all")).toEqual({ kind: "empty" });
  });

  it("groups what reaches a goal by type, in the order of the chain, and then what does not", () => {
    const groups = index();

    expect(groups.map((g) => g.id)).toEqual(["goal", "strategy", "campaign", "content", "loose"]);
    expect(groups.map((g) => g.label)).toEqual([
      "Goals",
      "Strategies",
      "Campaigns",
      "Content",
      "Not connected to a goal",
    ]);
    expect(ids(group(groups, "goal").rows)).toEqual(["nd_goal_vayn", "nd_goal_md"]);
    expect(ids(group(groups, "strategy").rows)).toEqual(["nd_str_icp", "nd_str_pos", "nd_str_voice"]);
    expect(ids(group(groups, "content").rows)).toEqual([
      "nd_con_linenstyle",
      "nd_con_quiet",
      "nd_con_2am",
      "nd_con_email",
    ]);
  });

  it("puts what no goal is above in the last group, in board order, whatever its type", () => {
    expect(ids(group(index(), "loose").rows)).toEqual(["nd_ast_lookbook", "nd_ast_hero", "nd_not_price", "nd_not_reach"]);
  });

  it("shows a node once: the last group takes it from its type's group", () => {
    const every = index().flatMap((g) => ids(g.rows));

    expect(every).toHaveLength(SEED_NODES.length);
    expect(new Set(every).size).toBe(SEED_NODES.length);
  });

  it("leaves out a group with nothing in it", () => {
    const onlyGoals = index(graph(SEED_NODES.filter((n) => n.type === "goal"), []));

    expect(onlyGoals.map((g) => g.id)).toEqual(["goal"]);
  });

  it("says what each row is: how much is under a goal, that a node can be traced, and why one cannot", () => {
    const groups = index();
    const note = (id: string) => groups.flatMap((g) => g.rows).find((row) => row.node.id === id)!.note;

    expect(note("nd_goal_vayn")).toBe("7 under it");
    expect(note("nd_goal_md")).toBe("3 under it");
    expect(note("nd_str_pos")).toBe("trace →");
    expect(note("nd_con_email")).toBe("trace →");
    expect(note("nd_ast_hero")).toBe("relates only");
    expect(note("nd_not_price")).toBe("relates only");
    expect(note("nd_not_reach")).toBe("no links");
  });

  it("says what a row does: traces what reaches a goal, opens what does not", () => {
    const rows = index().flatMap((g) => g.rows);
    const goes = (id: string) => rows.find((row) => row.node.id === id)!.goes;

    expect(goes("nd_goal_vayn")).toBe("trace");
    expect(goes("nd_con_quiet")).toBe("trace");
    expect(goes("nd_ast_lookbook")).toBe("open");
    expect(goes("nd_not_reach")).toBe("open");
  });

  it("calls a goal with nothing under it just a goal", () => {
    const lonely = index(graph([SEED_NODES[0]!], []));

    expect(group(lonely, "goal").rows[0]!.note).toBe("");
  });

  it("puts a node that is part of a chain that stops short in the last group, saying no goal is above it", () => {
    const nodes = [SEED_NODES[2]!, SEED_NODES[6]!]; // a strategy and the campaign that serves it, with no goal
    const groups = index(graph(nodes, [edge(1, "nd_cmp_linen", "nd_str_icp")]));

    expect(groups.map((g) => g.id)).toEqual(["loose"]);
    expect(group(groups, "loose").rows.map((row) => row.note)).toEqual(["no goal above it", "no goal above it"]);
  });

  it("keeps an asset that serves a campaign with the assets, since a goal is above it", () => {
    const asset = node("nd_ast_serving", "asset", "A brief that serves the linen drop");
    const groups = index(graph([...SEED_NODES, asset], [...SEED_EDGES, edge(99, "nd_ast_serving", "nd_cmp_linen")]));

    expect(ids(group(groups, "asset").rows)).toEqual(["nd_ast_serving"]);
    expect(group(groups, "asset").rows[0]).toMatchObject({ goes: "trace", note: "trace →" });
    expect(ids(group(groups, "loose").rows)).not.toContain("nd_ast_serving");
  });
});

describe("Find by type", () => {
  it("lists every node of the type, connected or not, in board order, each saying how it connects", () => {
    const content = list("", "content");

    expect(content.searching).toBe(false);
    expect(ids(content.rows)).toEqual(["nd_con_linenstyle", "nd_con_quiet", "nd_con_2am", "nd_con_email"]);
    expect(content.rows.every((row) => row.goes === "trace")).toBe(true);

    const notes = list("", "note");
    expect(notes.rows.map((row) => [row.node.id, row.note])).toEqual([
      ["nd_not_price", "relates only"],
      ["nd_not_reach", "no links"],
    ]);
  });

  it("offers a filter for every type, and for all", () => {
    expect(FIND_FILTERS.map((f) => f.id)).toEqual(["all", "goal", "strategy", "campaign", "content", "asset", "note"]);
    expect(FIND_FILTERS.map((f) => f.label)).toEqual(["All", "Goals", "Strategies", "Campaigns", "Content", "Assets", "Notes"]);
  });
});

describe("Find with something typed", () => {
  it("lists what matches, titles before bodies, as search does on a desktop", () => {
    const view = list("linen");

    expect(view.searching).toBe(true);
    expect(view.rows.slice(0, 3).map((row) => row.node.title)).toEqual([
      "Vayn linen drop - September",
      "Reel: 3 ways to style linen",
      "linen-shoot-hero.jpg",
    ]);
    const bodyOnly = list("baseline");
    expect(ids(bodyOnly.rows)).toEqual(["nd_goal_vayn"]);
  });

  it("does not mind case or the spaces round it", () => {
    expect(ids(list("  RAMADAN ").rows)).toEqual(ids(list("ramadan").rows));
    expect(list("ramadan").rows.length).toBeGreaterThan(1);
  });

  it("goes by the filter too", () => {
    expect(ids(list("linen", "content").rows)).toEqual(["nd_con_linenstyle"]);
    expect(ids(list("linen", "asset").rows)).toEqual(["nd_ast_hero"]);
  });

  it("is an empty list, still a search, when nothing matches", () => {
    expect(list("zzzz")).toEqual({ kind: "list", rows: [], searching: true });
  });

  it("is the index again when what is typed is only spaces", () => {
    expect(buildFind(graph(), "   ", "all").kind).toBe("index");
  });

  it("gives each match the start of its body, to tell it from another with a like title", () => {
    const [first] = list("baseline").rows;

    expect(first!.snippet).toBe("Baseline is 180/month. The number that matters is repeat rate, not reach.");
    const long = node("nd_long", "note", "Long one", "x".repeat(200));
    expect(list("long", "all", graph([long], [])).rows[0]!.snippet).toHaveLength(81); // 80 and an ellipsis
    expect(list("loose", "all", graph([node("n", "note", "Loose", ""), long], [])).rows[0]!.snippet).toBe("");
  });
});
