import { plural } from "../lib/format";
import { appStore } from "../store";
import type { CanvasNode } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/**
 * Canvas commands that span the API cache and the UI: they mutate through the
 * store, then report through a toast. Components call these; tests drive them
 * through the same singletons the app uses.
 */

/** Offers Retry for a write that failed. The canvas is never rolled back under the user without saying so. */
export function reportSaveFailure(retry: () => void) {
  uiStore.getState().toast({ message: COPY.saveFailed, tone: "danger", actionLabel: "Retry", onAction: retry });
}

export function undoLast(times = 1) {
  void (async () => {
    try {
      for (let i = 0; i < times; i++) await appStore.getState().undo();
    } catch {
      uiStore.getState().toast({ message: COPY.undoFailed, tone: "danger" });
    }
  })();
}

/** Moves a node and stores where it landed. */
export function moveNode(id: string, x: number, y: number) {
  appStore
    .getState()
    .updateNode(id, { x, y })
    .catch(() => reportSaveFailure(() => moveNode(id, x, y)));
}

export function nudgeNode(id: string, dx: number, dy: number) {
  const node = appStore.getState().nodes[id];
  if (node) moveNode(id, node.x + dx, node.y + dy);
}

/** Deletes nodes with their edges, then offers a single undo that restores them all. */
export async function deleteNodes(ids: string[]) {
  const { nodes, deleteNode } = appStore.getState();
  const present = ids.filter((id) => nodes[id]);
  if (present.length === 0) return;
  uiStore.getState().select([]);

  let deleted = 0;
  for (const id of present) {
    try {
      await deleteNode(id);
      deleted++;
    } catch {
      reportSaveFailure(() => void deleteNodes([id]));
    }
  }
  if (deleted === 0) return;
  uiStore.getState().toast({
    message: deleted === 1 ? "Node deleted." : `${plural(deleted, "node")} deleted.`,
    tone: "success",
    actionLabel: "Undo",
    onAction: () => undoLast(deleted),
    durationMs: 8000,
  });
}

export interface Point {
  x: number;
  y: number;
}

/** How far a new node steps diagonally off one already sitting exactly where it would land. */
export const OVERLAP_STEP = 24;

/** Nudges a position until no node sits exactly on it. */
export function avoidOverlap(at: Point, nodes: CanvasNode[]): Point {
  let x = Math.round(at.x);
  let y = Math.round(at.y);
  while (nodes.some((n) => n.x === x && n.y === y)) {
    x += OVERLAP_STEP;
    y += OVERLAP_STEP;
  }
  return { x, y };
}

/** O1 — creates a note, or says it couldn't and offers to try again. Nothing half-made stays behind. */
export async function createNote(
  at: Point,
  options: { title?: string; onCreated?: (node: CanvasNode) => void } = {},
): Promise<CanvasNode | null> {
  const { nodes, createNode } = appStore.getState();
  const { x, y } = avoidOverlap(at, Object.values(nodes));
  try {
    const node = await createNode({ type: "note", x, y, ...(options.title ? { title: options.title } : {}) });
    options.onCreated?.(node);
    return node;
  } catch {
    uiStore.getState().toast({
      message: COPY.addNodeFailed,
      tone: "danger",
      actionLabel: "Retry",
      onAction: () => void createNote(at, options),
    });
    return null;
  }
}
