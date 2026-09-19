// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { byId } from "../../store/records";
import type { EdgeKind, NodeType } from "../../types";
import { EdgePath, edgeGeometry, HIT_EXTRA, toFlowEdges } from "../EdgeLine";
import { makeNode } from "./cards";

afterEach(cleanup);

const a = { x: 0, y: 0, width: 236, height: 132 };
const b = { x: 0, y: 400, width: 236, height: 132 };

function draw(kind: EdgeKind, fromType: NodeType = "content", toType: NodeType = "campaign") {
  const { container } = render(
    <svg>
      <EdgePath id="ed_1" kind={kind} fromType={fromType} toType={toType} from={a} to={b} />
    </svg>,
  );
  return container.querySelector("[data-edge=ed_1]")!;
}

describe("EdgePath", () => {
  it("draws serves solid, with an arrowhead pointing at the target", () => {
    const edge = draw("serves");
    expect(edge.querySelector("[data-edge-path]")!.getAttribute("stroke-dasharray")).toBeNull();
    const arrow = edge.querySelector("[data-arrowhead]")!;
    // The arrow's tip is the line's end, on the target's border.
    const { end } = edgeGeometry(a, b);
    expect(arrow.getAttribute("d")!.startsWith(`M${end.x} ${end.y}`)).toBe(true);
  });

  it("draws relates-to dashed, with no arrowhead", () => {
    const edge = draw("relates-to");
    expect(edge.querySelector("[data-edge-path]")!.getAttribute("stroke-dasharray")).toBe("5 5");
    expect(edge.querySelector("[data-arrowhead]")).toBeNull();
  });

  it("takes its colors from the edge-kind token and each endpoint's type token only", () => {
    const serves = draw("serves", "content", "goal");
    expect(serves.getAttribute("class")).toContain("var(--edge-serves)");
    expect(serves.querySelector("[data-stop=from]")!.getAttribute("class")).toContain("var(--node-content)");
    expect(serves.querySelector("[data-stop=to]")!.getAttribute("class")).toContain("var(--node-goal)");
    cleanup();
    expect(draw("relates-to").getAttribute("class")).toContain("var(--edge-relates)");
  });

  it("has a hit area 12px wider than the stroke", () => {
    const edge = draw("serves");
    const stroke = Number(edge.querySelector("[data-edge-path]")!.getAttribute("stroke-width"));
    expect(Number(edge.querySelector("[data-edge-hit]")!.getAttribute("stroke-width"))).toBe(stroke + HIT_EXTRA);
  });
});

describe("edgeGeometry", () => {
  it("runs from the source's border to the target's, not centre to centre", () => {
    const { start, end } = edgeGeometry(a, b);
    expect(start.y).toBeCloseTo(a.y + a.height + 2);
    expect(end.y).toBeCloseTo(b.y - 2);
    expect(start.x).toBeCloseTo(a.width / 2);
  });
});

describe("toFlowEdges", () => {
  it("carries each endpoint's type, and skips an edge whose endpoint is gone", () => {
    const nodes = byId([makeNode({ id: "n1", type: "content" }), makeNode({ id: "n2", type: "goal" })]);
    const edges = byId([
      { id: "e1", fromId: "n1", toId: "n2", kind: "serves" as const, label: null },
      { id: "e2", fromId: "n1", toId: "gone", kind: "relates-to" as const, label: null },
    ]);
    const flow = toFlowEdges(edges, nodes, new Set(["n2"]));
    expect(flow).toHaveLength(1);
    expect(flow[0]).toMatchObject({ id: "e1", source: "n1", target: "n2", type: "line" });
    expect(flow[0]!.data).toEqual({ kind: "serves", fromType: "content", toType: "goal", emphasized: true });
  });
});
