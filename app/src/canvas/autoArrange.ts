import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import type { CanvasNode, Edge, NodeType } from "../types";

/** Space between neighbouring cards in a row. */
export const CARD_GAP = 48;
/** Space between one row and the next: room for the lines that join them. */
export const LAYER_GAP = 110;

/**
 * Where a type sits on the page, top to bottom (docs/spec.md § Auto-arrange).
 * Content and assets share a row; notes get the one beneath.
 */
const LAYER: Record<NodeType, number> = { goal: 0, strategy: 1, campaign: 2, content: 3, asset: 3, note: 4 };

export interface Point {
  x: number;
  y: number;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const byTitle = (a: CanvasNode, b: CanvasNode) =>
  collator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lays the board out by lineage. A node that has a `serves` edge to another node
 * on the board goes in its type's row; every other node goes in one row beneath
 * them all. A row is ordered so each node sits under the nodes it serves, and the
 * whole layout is centred where the nodes already were, so the graph stays in view.
 *
 * Pure: it reads nodes and edges and returns a position for every node. It does not
 * touch the store, and nothing calls it except an explicit Auto-arrange.
 */
export function autoArrange(nodes: readonly CanvasNode[], edges: readonly Edge[]): Record<string, Point> {
  if (nodes.length === 0) return {};

  // Serves edges between two nodes that are both here; anything else says nothing about layout.
  const present = new Set(nodes.map((n) => n.id));
  const links = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "serves" || edge.fromId === edge.toId) continue;
    if (!present.has(edge.fromId) || !present.has(edge.toId)) continue;
    links.set(edge.fromId, [...(links.get(edge.fromId) ?? []), edge.toId]);
    links.set(edge.toId, [...(links.get(edge.toId) ?? []), edge.fromId]);
  }

  const layered = new Map<number, CanvasNode[]>();
  const loose: CanvasNode[] = [];
  for (const node of nodes) {
    if (!links.has(node.id)) loose.push(node);
    else layered.set(LAYER[node.type], [...(layered.get(LAYER[node.type]) ?? []), node]);
  }

  // Rows are built top-down on a shared axis through x = 0. A row after the first is ordered
  // by the mean position of the nodes it is linked to that are already placed above it.
  const placed = new Map<string, Point>();
  const rows: CanvasNode[][] = [];
  const place = (row: CanvasNode[]) => {
    const width = row.length * CARD_WIDTH + (row.length - 1) * CARD_GAP;
    const left = -Math.floor(width / 2);
    const y = rows.length * (CARD_HEIGHT + LAYER_GAP);
    row.forEach((node, i) => placed.set(node.id, { x: left + i * (CARD_WIDTH + CARD_GAP), y }));
    rows.push(row);
  };

  for (const layer of [...layered.keys()].sort((a, b) => a - b)) {
    const row = layered.get(layer)!;
    const above = (node: CanvasNode) =>
      (links.get(node.id) ?? []).map((id) => placed.get(id)).filter((p): p is Point => p !== undefined);
    const key = new Map(
      row.map((node) => {
        const parents = above(node);
        return [
          node.id,
          parents.length === 0 ? Infinity : parents.reduce((sum, p) => sum + p.x + CARD_WIDTH / 2, 0) / parents.length,
        ] as const;
      }),
    );
    row.sort((a, b) => {
      const ka = key.get(a.id)!;
      const kb = key.get(b.id)!;
      return ka === kb ? byTitle(a, b) : ka < kb ? -1 : 1;
    });
    place(row);
  }
  if (loose.length > 0) place(loose.sort((a, b) => LAYER[a.type] - LAYER[b.type] || byTitle(a, b)));

  // Centre the result on the middle of the nodes' current bounding box.
  const centre = (points: Point[]): Point => ({
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x + CARD_WIDTH))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y + CARD_HEIGHT))) / 2,
  });
  const from = centre(nodes.map((n) => ({ x: n.x, y: n.y })));
  const to = centre([...placed.values()]);
  const dx = Math.round(from.x - to.x);
  const dy = Math.round(from.y - to.y);

  return Object.fromEntries([...placed].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
}

/** The box a layout fills, for fitting the camera to it. */
export function layoutBounds(layout: Record<string, Point>) {
  const points = Object.values(layout);
  const x = Math.min(...points.map((p) => p.x));
  const y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x + CARD_WIDTH)) - x,
    height: Math.max(...points.map((p) => p.y + CARD_HEIGHT)) - y,
  };
}
