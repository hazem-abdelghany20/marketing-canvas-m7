import { plural } from "../lib/format";
import { motionMs } from "../lib/motion";
import { appStore } from "../store";
import { CARD_HEIGHT } from "../components/NodeCard";
import type { CanvasNode, NodeType } from "../types";
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

/**
 * O1 — creates a node of a type, or says it couldn't and offers to try again. Nothing half-made stays behind. The desktop's
 * menu makes notes (the type is chosen afterwards, in the panel); the phone's Add sheet chooses it first.
 */
export async function createNodeAt(
  at: Point,
  options: { type: NodeType; title?: string; onCreated?: (node: CanvasNode) => void },
): Promise<CanvasNode | null> {
  const { nodes, createNode } = appStore.getState();
  const { x, y } = avoidOverlap(at, Object.values(nodes));
  try {
    const node = await createNode({ type: options.type, x, y, ...(options.title ? { title: options.title } : {}) });
    options.onCreated?.(node);
    return node;
  } catch {
    uiStore.getState().toast({
      message: COPY.addNodeFailed,
      tone: "danger",
      actionLabel: "Retry",
      onAction: () => void createNodeAt(at, options),
    });
    return null;
  }
}

/** O1 — creates a note: a node of the one type that says nothing about what it is for. */
export function createNote(
  at: Point,
  options: { title?: string; onCreated?: (node: CanvasNode) => void } = {},
): Promise<CanvasNode | null> {
  return createNodeAt(at, { ...options, type: "note" });
}

/** How far under the node it serves a new one is put: clear of its card, where the chain runs down the board. */
export const SERVING_GAP = 80;

/** Serves that are being made right now, so a second tap on the same button waits for the first. */
const adding = new Set<string>();

/** Joins a node to the one it serves, or says it couldn't and offers to try again. */
function connectServing(nodeId: string, parentId: string) {
  appStore
    .getState()
    .createEdge({ fromId: nodeId, toId: parentId, kind: "serves" })
    .catch(() => reportConnectAfterAdd(nodeId, parentId));
}

function reportConnectAfterAdd(nodeId: string, parentId: string) {
  uiStore.getState().toast({
    message: COPY.connectAfterAddFailed,
    tone: "danger",
    actionLabel: "Retry",
    onAction: () => connectServing(nodeId, parentId),
  });
}

/**
 * Adds a node of `type` that serves `parentId`: made under it, joined to it, as one step to undo. It is what an empty row in
 * Trace offers. If the node can't be made nothing is, and it says so; if only the joining fails the node stays and it offers
 * the joining again, and the node is still reported as made, since there is a node to name.
 */
export async function addServing(
  parentId: string,
  type: NodeType,
  options: { onCreated?: (node: CanvasNode) => void } = {},
): Promise<CanvasNode | null> {
  const { nodes, createServingNode } = appStore.getState();
  const parent = nodes[parentId];
  const key = `${parentId}:${type}`;
  if (!parent || adding.has(key)) return null;
  adding.add(key);
  try {
    const at = avoidOverlap({ x: parent.x, y: parent.y + CARD_HEIGHT + SERVING_GAP }, Object.values(nodes));
    const { node, edgeError } = await createServingNode({ type, x: at.x, y: at.y }, parentId);
    if (edgeError) reportConnectAfterAdd(node.id, parentId);
    options.onCreated?.(node);
    return node;
  } catch {
    uiStore.getState().toast({
      message: COPY.addNodeFailed,
      tone: "danger",
      actionLabel: "Retry",
      onAction: () => void addServing(parentId, type, options),
    });
    return null;
  } finally {
    adding.delete(key);
  }
}
