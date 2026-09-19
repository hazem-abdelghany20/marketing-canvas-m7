import type { ApiError } from "../api/client";
import { appStore } from "../store";
import { connectionBetween } from "../store/edges";
import type { Edge, EdgeKind } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/** From docs/state-matrix.md § O3. */
export const CONNECT_COPY = {
  needsTwo: "Add another node first — connections need two.",
  self: "A node can't connect to itself.",
  duplicate: "These nodes are already connected.",
  targetRemoved: "That node was removed. Pick another target.",
} as const;

function say(message: string) {
  uiStore.getState().toast({ message, tone: "warn" });
}

/**
 * O3 — enters connect mode, optionally with the source already picked. Refuses,
 * and says why, when there are fewer than two nodes to connect.
 */
export function startConnect(sourceId: string | null = null): boolean {
  if (Object.keys(appStore.getState().nodes).length < 2) {
    say(CONNECT_COPY.needsTwo);
    return false;
  }
  uiStore.getState().select([]);
  uiStore.getState().setConnect({ active: true, sourceId, targetId: null });
  return true;
}

export function exitConnect() {
  uiStore.getState().exitConnect();
}

/**
 * A pair is proposed: open the kind picker, or refuse with the reason. A node
 * can't connect to itself, and two nodes are connected at most once.
 */
function proposePair(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) {
    say(CONNECT_COPY.self);
    return false;
  }
  if (connectionBetween(appStore.getState().edges, sourceId, targetId)) {
    say(CONNECT_COPY.duplicate);
    return false;
  }
  uiStore.getState().setConnect({ active: true, sourceId, targetId });
  return true;
}

/** A node was clicked while connect mode is on. */
export function pickNode(id: string) {
  const { sourceId, targetId } = uiStore.getState().connect;
  if (targetId) return; // the kind picker is open; it has to be answered or escaped
  if (!sourceId) {
    uiStore.getState().setConnect({ sourceId: id });
    return;
  }
  // Clicking the source again explains why it can't be the target, and lets it go.
  if (id === sourceId) {
    say(CONNECT_COPY.self);
    uiStore.getState().setConnect({ sourceId: null });
    return;
  }
  proposePair(sourceId, id);
}

/** Dragged from one card's handle to another's: the same flow, without entering the mode first. */
export function connectByDrag(sourceId: string, targetId: string) {
  if (Object.keys(appStore.getState().nodes).length < 2) return;
  proposePair(sourceId, targetId);
}

/** The kind picker answered: create the edge, leave the mode, flash both ends. */
export async function chooseKind(kind: EdgeKind): Promise<Edge | null> {
  const { sourceId, targetId } = uiStore.getState().connect;
  if (!sourceId || !targetId) return null;
  exitConnect();
  return connect(sourceId, targetId, kind);
}

async function connect(fromId: string, toId: string, kind: EdgeKind): Promise<Edge | null> {
  try {
    const edge = await appStore.getState().createEdge({ fromId, toId, kind });
    uiStore.getState().flash([fromId, toId]);
    return edge;
  } catch (error) {
    const code = (error as ApiError).code;
    if (code === "edge_exists") say(CONNECT_COPY.duplicate);
    else if (code === "self_edge") say(CONNECT_COPY.self);
    else if (code === "node_not_found") say(CONNECT_COPY.targetRemoved);
    else {
      uiStore.getState().toast({
        message: COPY.saveFailed,
        tone: "danger",
        actionLabel: "Retry",
        onAction: () => void connect(fromId, toId, kind),
      });
    }
    return null;
  }
}
