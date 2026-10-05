import { plural } from "../lib/format";
import { motionMs } from "../lib/motion";
import { appStore } from "../store";
import type { CanvasNode } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { autoArrange, layoutBounds } from "./autoArrange";
import type { Bounds } from "./useFitToBounds";
import { ARRANGE_MS } from "./useArrangeTween";

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

/** Moves a node and stores where it landed. A move by hand always wins over a glide still running. */
export function moveNode(id: string, x: number, y: number) {
  uiStore.getState().endArrangement();
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

/**
 * Auto-arrange: lays every node out by lineage, saves the ones that moved as a single
 * undo step, and says so. `fit` brings the camera to the box the layout fills; it runs
 * again on Retry. Does nothing on an empty board, and runs only when asked.
 */
export function arrangeBoard(fit: (bounds: Bounds) => void) {
  const { nodes, edges, updateNodes } = appStore.getState();
  const all = Object.values(nodes);
  if (all.length === 0) return;

  const layout = autoArrange(all, Object.values(edges));
  fit(layoutBounds(layout));
  const moving = all.filter((n) => layout[n.id]!.x !== n.x || layout[n.id]!.y !== n.y);
  if (moving.length === 0) return;

  // The glide starts from where the cards are now; under reduced motion there is none.
  const duration = motionMs(ARRANGE_MS);
  if (duration > 0)
    uiStore.getState().startArrangement(Object.fromEntries(moving.map((n) => [n.id, { x: n.x, y: n.y }])), duration);

  updateNodes(
    moving.map((n) => ({ id: n.id, patch: { x: layout[n.id]!.x, y: layout[n.id]!.y } })),
    "Arrange nodes",
  )
    .then(() =>
      uiStore.getState().toast({
        message: `Arranged ${plural(all.length, "node")}.`,
        tone: "success",
        actionLabel: "Undo",
        onAction: () => undoLast(),
        durationMs: 8000,
      }),
    )
    .catch(() => reportSaveFailure(() => arrangeBoard(fit)));
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
