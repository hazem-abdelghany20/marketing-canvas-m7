import { describe, expect, it } from "vitest";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { STRIP_CHIP, stripScene } from "../stripLayout";

const SIZE = { width: 336, height: 140 };
const scene = (cited: string[] = [], nodes = SEED_NODES, edges = SEED_EDGES) => stripScene(nodes, edges, cited, SIZE);
const ids = (s: ReturnType<typeof scene>) => s.items.map((item) => item.node.id).sort();
const LINEN = ["nd_con_linenstyle", "nd_cmp_linen"];

describe("what the strip shows", () => {
  it("is empty on a board with nothing on it", () => {
    const empty = stripScene([], [], [], SIZE);

    expect(empty.mode).toBe("empty");
    expect(empty.items).toEqual([]);
    expect(empty.lines).toEqual([]);
  });

  it("is the whole board as an outline when nothing is cited: every node, every connection", () => {
    const outline = scene();

    expect(outline.mode).toBe("overview");
    expect(outline.cited).toBe(0);
    expect(outline.items).toHaveLength(SEED_NODES.length);
    expect(outline.lines).toHaveLength(SEED_EDGES.length);
    expect(outline.items.every((item) => !item.cited)).toBe(true);
  });

  it("is the cited nodes and the nodes they are connected to, when a reply cites some, with the cited ones marked", () => {
    const cited = scene(LINEN);

    expect(cited.mode).toBe("cited");
    expect(cited.cited).toBe(2);
    // The reel and the linen drop, and what touches them: the other piece of content, the strategy above, the asset joined to the reel.
    expect(ids(cited)).toEqual(["nd_ast_hero", "nd_cmp_linen", "nd_con_linenstyle", "nd_con_quiet", "nd_str_icp"]);
    expect(cited.items.filter((item) => item.cited).map((item) => item.node.id).sort()).toEqual([...LINEN].sort());
  });

  it("draws a line only between two nodes that are both in it", () => {
    const cited = scene(LINEN);
    const on = new Set(ids(cited));

    expect(cited.lines).toHaveLength(4);
    for (const line of cited.lines) {
      const edge = SEED_EDGES.find((e) => e.id === line.id)!;
      expect(on.has(edge.fromId) && on.has(edge.toId)).toBe(true);
    }
    expect(cited.lines.map((line) => line.kind).sort()).toEqual(["relates-to", "serves", "serves", "serves"]);
  });

  it("goes back to the outline when everything a reply cited has since been deleted", () => {
    expect(scene(["nd_gone", "nd_gone_too"]).mode).toBe("overview");
    // A node that is gone among the ones that are not is only left out.
    expect(scene([...LINEN, "nd_gone"]).cited).toBe(2);
  });
});

describe("where it puts them", () => {
  it("keeps every chip wholly inside the strip", () => {
    for (const cited of [LINEN, ["nd_goal_vayn"], ["nd_con_email", "nd_con_2am", "nd_goal_md"]]) {
      for (const item of scene(cited).items) {
        expect(item.x - STRIP_CHIP.width / 2).toBeGreaterThanOrEqual(-0.01);
        expect(item.x + STRIP_CHIP.width / 2).toBeLessThanOrEqual(SIZE.width + 0.01);
        expect(item.y - STRIP_CHIP.height / 2).toBeGreaterThanOrEqual(-0.01);
        expect(item.y + STRIP_CHIP.height / 2).toBeLessThanOrEqual(SIZE.height + 0.01);
      }
    }
  });

  it("keeps the outline's dots inside the strip too", () => {
    for (const item of scene().items) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(SIZE.width);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThanOrEqual(SIZE.height);
    }
  });

  it("keeps the board's own arrangement: what is left of another on the board is left of it here, and what is above is above", () => {
    const placed = scene(["nd_con_email", "nd_con_linenstyle", "nd_goal_vayn"]);
    const at = (id: string) => placed.items.find((item) => item.node.id === id)!;

    expect(at("nd_con_email").x).toBeLessThan(at("nd_con_linenstyle").x);
    expect(at("nd_goal_vayn").y).toBeLessThan(at("nd_con_linenstyle").y);
  });

  it("puts a node with nothing to show beside it in the middle", () => {
    const alone = stripScene([SEED_NODES[0]!], [], ["nd_goal_vayn"], SIZE);

    expect(alone.items).toHaveLength(1);
    expect(alone.items[0]).toMatchObject({ x: SIZE.width / 2, y: SIZE.height / 2, cited: true });
  });

  it("does not stack chips on each other when there is room for them", () => {
    const placed = scene(LINEN).items;

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const apart =
          Math.abs(placed[i]!.x - placed[j]!.x) >= STRIP_CHIP.width - 0.5 ||
          Math.abs(placed[i]!.y - placed[j]!.y) >= STRIP_CHIP.height - 0.5;
        expect(apart, `${placed[i]!.node.title} and ${placed[j]!.node.title}`).toBe(true);
      }
    }
  });

  it("is the same every time it is asked", () => {
    expect(scene(LINEN)).toEqual(scene(LINEN));
    expect(scene()).toEqual(scene());
  });

  it("joins each line to the two chips it connects", () => {
    const cited = scene(LINEN);
    const at = (id: string) => cited.items.find((item) => item.node.id === id)!;

    for (const line of cited.lines) {
      const edge = SEED_EDGES.find((e) => e.id === line.id)!;
      expect(line.from).toEqual({ x: at(edge.fromId).x, y: at(edge.fromId).y });
      expect(line.to).toEqual({ x: at(edge.toId).x, y: at(edge.toId).y });
    }
  });
});
