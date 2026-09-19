import { useInternalNode, type Edge as FlowEdge, type EdgeProps, type InternalNode } from "@xyflow/react";
import type { ById } from "../store/records";
import type { CanvasNode, Edge, EdgeKind, NodeType } from "../types";
import { CARD_HEIGHT, CARD_WIDTH } from "./NodeCard";

export interface EdgeData extends Record<string, unknown> {
  kind: EdgeKind;
  fromType: NodeType;
  toType: NodeType;
  /** An endpoint is selected. */
  emphasized?: boolean;
}

export type LineEdge = FlowEdge<EdgeData, "line">;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const ARROW_LENGTH = 9;
const ARROW_SPREAD = 0.42;
/** The invisible hit area is this much wider than the stroke. */
export const HIT_EXTRA = 12;

/** Where the line from one card's centre to another's crosses the first card's border. */
function borderPoint(from: Point, to: Point, half: { w: number; h: number }): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!dx && !dy) return from;
  const scale = Math.min(
    Math.abs(dx) > 0.001 ? half.w / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.001 ? half.h / Math.abs(dy) : Infinity,
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/**
 * A curve from the edge of one card to the edge of the other, plus the
 * arrowhead that sits on the target end. From design/marketing-canvas.dc.html.
 */
export function edgeGeometry(a: Rect, b: Rect) {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const start = borderPoint(ac, bc, { w: a.width / 2 + 2, h: a.height / 2 + 2 });
  const end = borderPoint(bc, ac, { w: b.width / 2 + 2, h: b.height / 2 + 2 });
  const bend = (end.y - start.y) * 0.5;
  const d = `M${start.x} ${start.y} C${start.x} ${start.y + bend} ${end.x} ${end.y - bend} ${end.x} ${end.y}`;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const wing = (spread: number) =>
    `${end.x - ARROW_LENGTH * Math.cos(angle + spread)} ${end.y - ARROW_LENGTH * Math.sin(angle + spread)}`;
  const arrow = `M${end.x} ${end.y} L${wing(-ARROW_SPREAD)} L${wing(ARROW_SPREAD)} Z`;
  return { d, arrow, start, end };
}

// Each end of the line takes its node's type color, blended into the kind's own
// edge token. Written out in full so Tailwind can see every class.
const STOP: Record<NodeType, string> = {
  goal: "[stop-color:color-mix(in_srgb,var(--node-goal)_55%,var(--edge-base))]",
  strategy: "[stop-color:color-mix(in_srgb,var(--node-strategy)_55%,var(--edge-base))]",
  campaign: "[stop-color:color-mix(in_srgb,var(--node-campaign)_55%,var(--edge-base))]",
  content: "[stop-color:color-mix(in_srgb,var(--node-content)_55%,var(--edge-base))]",
  asset: "[stop-color:color-mix(in_srgb,var(--node-asset)_55%,var(--edge-base))]",
  note: "[stop-color:color-mix(in_srgb,var(--node-note)_55%,var(--edge-base))]",
};

const ARROW_FILL: Record<NodeType, string> = {
  goal: "[fill:color-mix(in_srgb,var(--node-goal)_55%,var(--edge-base))]",
  strategy: "[fill:color-mix(in_srgb,var(--node-strategy)_55%,var(--edge-base))]",
  campaign: "[fill:color-mix(in_srgb,var(--node-campaign)_55%,var(--edge-base))]",
  content: "[fill:color-mix(in_srgb,var(--node-content)_55%,var(--edge-base))]",
  asset: "[fill:color-mix(in_srgb,var(--node-asset)_55%,var(--edge-base))]",
  note: "[fill:color-mix(in_srgb,var(--node-note)_55%,var(--edge-base))]",
};

const BASE: Record<EdgeKind, string> = {
  serves: "[--edge-base:var(--edge-serves)]",
  "relates-to": "[--edge-base:var(--edge-relates)]",
};

interface EdgePathProps {
  id: string;
  kind: EdgeKind;
  fromType: NodeType;
  toType: NodeType;
  from: Rect;
  to: Rect;
  emphasized?: boolean;
}

/**
 * `serves` is directional: solid, with an arrowhead at the target. `relates-to`
 * has no direction: dashed, no arrowhead. Kind is never shown by color alone.
 */
export function EdgePath({ id, kind, fromType, toType, from, to, emphasized }: EdgePathProps) {
  const { d, arrow, start, end } = edgeGeometry(from, to);
  const gradient = `edge-gradient-${id}`;
  const width = emphasized ? 2.4 : 1.6;

  return (
    <g data-edge={id} data-kind={kind} data-from-type={fromType} data-to-type={toType} className={BASE[kind]}>
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
          <stop offset="0" data-stop="from" className={STOP[fromType]} />
          <stop offset="1" data-stop="to" className={STOP[toType]} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="transparent" strokeWidth={width + HIT_EXTRA} data-edge-hit />
      <path
        d={d}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={kind === "relates-to" ? "5 5" : undefined}
        data-edge-path
      />
      {kind === "serves" ? <path d={arrow} className={ARROW_FILL[toType]} data-arrowhead /> : null}
    </g>
  );
}

function rectOf(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? CARD_WIDTH,
    height: node.measured.height ?? node.height ?? CARD_HEIGHT,
  };
}

/** React Flow's custom edge: follows both cards as they move, from border to border. */
export function EdgeLine({ id, source, target, data }: EdgeProps<LineEdge>) {
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (!from || !to || !data) return null;
  return (
    <EdgePath
      id={id}
      kind={data.kind}
      fromType={data.fromType}
      toType={data.toType}
      from={rectOf(from)}
      to={rectOf(to)}
      emphasized={data.emphasized}
    />
  );
}

/** Store edges → React Flow edges. An edge whose endpoint is missing is skipped. */
export function toFlowEdges(edges: ById<Edge>, nodes: ById<CanvasNode>, selectedIds: ReadonlySet<string>): LineEdge[] {
  const out: LineEdge[] = [];
  for (const edge of Object.values(edges)) {
    const from = nodes[edge.fromId];
    const to = nodes[edge.toId];
    if (!from || !to) continue;
    out.push({
      id: edge.id,
      source: edge.fromId,
      target: edge.toId,
      type: "line",
      selectable: false,
      focusable: false,
      data: {
        kind: edge.kind,
        fromType: from.type,
        toType: to.type,
        emphasized: selectedIds.has(edge.fromId) || selectedIds.has(edge.toId),
      },
    });
  }
  return out;
}
