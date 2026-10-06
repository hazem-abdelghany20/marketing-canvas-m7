import type { CanvasNode } from "../types";

/** How many nodes the empty query lists. */
export const RECENT_COUNT = 5;

const byRecency = (a: CanvasNode, b: CanvasNode) => b.updatedAt.localeCompare(a.updatedAt);

/** The nodes touched most recently, newest first. */
export function recentNodes(nodes: CanvasNode[], count = RECENT_COUNT): CanvasNode[] {
  return [...nodes].sort(byRecency).slice(0, count);
}

/**
 * Case-insensitive match on title or body, in memory. Title matches come
 * first, then body-only ones; each group newest first.
 */
export function searchNodes(nodes: CanvasNode[], query: string): CanvasNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const inTitle: CanvasNode[] = [];
  const inBody: CanvasNode[] = [];
  for (const node of nodes) {
    if (node.title.toLowerCase().includes(q)) inTitle.push(node);
    else if (node.body.toLowerCase().includes(q)) inBody.push(node);
  }
  return [...inTitle.sort(byRecency), ...inBody.sort(byRecency)];
}
