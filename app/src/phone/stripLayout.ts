import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import type { CanvasNode, Edge, EdgeKind } from "../types";

/**
 * Where the Chat screen's strip draws the board (docs/spec.md § P4): pure arithmetic over nodes and edges. Positions are
 * the board's own, scaled to fit, and sizes are not: a chip stays as large as a title needs, and chips that would land on
 * each other are nudged apart.
 */

export interface StripSize {
  width: number;
  height: number;
}

/** A node in the strip when a reply has cited some: wide enough for a title. */
export const STRIP_CHIP: StripSize = { width: 112, height: 30 };
/** A node in the outline of the whole board: a mark, with no title. */
export const STRIP_DOT: StripSize = { width: 14, height: 8 };

export type StripMode = "empty" | "overview" | "cited";

export interface StripItem {
  node: CanvasNode;
  /** The centre of the chip, or of the dot, in the strip's own pixels. */
  x: number;
  y: number;
  cited: boolean;
}

export interface StripLine {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: EdgeKind;
}

export interface StripScene {
  mode: StripMode;
  items: StripItem[];
  lines: StripLine[];
  /** How many of the nodes a reply cited are still on the board. */
  cited: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Space kept between what is drawn and the strip's border, so nothing sits against its rounded corner. */
const INSET = 6;

/** The board's positions, scaled on each axis to fill the strip, never larger than the board's own, and centred. */
function place(nodes: CanvasNode[], box: StripSize, size: StripSize): Array<{ x: number; y: number }> {
  const centres = nodes.map((node) => ({ x: node.x + CARD_WIDTH / 2, y: node.y + CARD_HEIGHT / 2 }));
  const xs = centres.map((c) => c.x);
  const ys = centres.map((c) => c.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const room = {
    width: Math.max(0, size.width - box.width - 2 * INSET),
    height: Math.max(0, size.height - box.height - 2 * INSET),
  };
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // A span of nothing has nothing to scale: everything is at the same coordinate, which is the middle.
  const scaleX = spanX > 0 ? Math.min(1, room.width / spanX) : 0;
  const scaleY = spanY > 0 ? Math.min(1, room.height / spanY) : 0;
  const offsetX = INSET + box.width / 2 + (room.width - spanX * scaleX) / 2;
  const offsetY = INSET + box.height / 2 + (room.height - spanY * scaleY) / 2;
  return centres.map((c) => ({ x: offsetX + (c.x - minX) * scaleX, y: offsetY + (c.y - minY) * scaleY }));
}

/**
 * Pushes chips that overlap apart, along whichever way they overlap least, and keeps them inside the strip. A few passes
 * are enough for the handful a reply cites; where there is no room for them all, some still overlap, and that is accepted.
 */
function separate(points: Array<{ x: number; y: number }>, box: StripSize, size: StripSize) {
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        const overlapX = box.width - Math.abs(a.x - b.x);
        const overlapY = box.height - Math.abs(a.y - b.y);
        if (overlapX <= 0.01 || overlapY <= 0.01) continue;
        moved = true;
        if (overlapY <= overlapX) {
          const shift = overlapY / 2 + 0.01;
          if (a.y <= b.y) [a.y, b.y] = [a.y - shift, b.y + shift];
          else [a.y, b.y] = [a.y + shift, b.y - shift];
        } else {
          const shift = overlapX / 2 + 0.01;
          if (a.x <= b.x) [a.x, b.x] = [a.x - shift, b.x + shift];
          else [a.x, b.x] = [a.x + shift, b.x - shift];
        }
      }
    }
    for (const point of points) {
      point.x = clamp(point.x, halfW, size.width - halfW);
      point.y = clamp(point.y, halfH, size.height - halfH);
    }
    if (!moved) break;
  }
}

/**
 * What the strip shows. Nothing on the board: nothing to draw. Nothing cited (or what was cited is gone): the whole board
 * as an outline, so it is always a picture of the board. Something cited: those nodes, and every node joined to one of them,
 * the cited ones marked.
 */
export function stripScene(
  nodes: CanvasNode[],
  edges: Edge[],
  citedIds: string[],
  size: StripSize,
  chip: StripSize = STRIP_CHIP,
): StripScene {
  if (nodes.length === 0) return { mode: "empty", items: [], lines: [], cited: 0 };

  const present = new Set(nodes.map((node) => node.id));
  const cited = new Set(citedIds.filter((id) => present.has(id)));
  const mode: StripMode = cited.size > 0 ? "cited" : "overview";

  let shown = nodes;
  if (mode === "cited") {
    const keep = new Set(cited);
    for (const edge of edges) {
      if (cited.has(edge.fromId) && present.has(edge.toId)) keep.add(edge.toId);
      if (cited.has(edge.toId) && present.has(edge.fromId)) keep.add(edge.fromId);
    }
    shown = nodes.filter((node) => keep.has(node.id));
  }

  const box = mode === "cited" ? chip : STRIP_DOT;
  const points = place(shown, box, size);
  if (mode === "cited") separate(points, box, size);

  const items = shown.map((node, index) => ({ node, x: points[index]!.x, y: points[index]!.y, cited: cited.has(node.id) }));
  const at = new Map(items.map((item) => [item.node.id, item]));
  const lines = edges
    .filter((edge) => at.has(edge.fromId) && at.has(edge.toId) && edge.fromId !== edge.toId)
    .map((edge) => {
      const from = at.get(edge.fromId)!;
      const to = at.get(edge.toId)!;
      return { id: edge.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, kind: edge.kind };
    });

  return { mode, items, lines, cited: cited.size };
}
