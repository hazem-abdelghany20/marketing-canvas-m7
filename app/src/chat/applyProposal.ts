import { avoidOverlap, type Point } from "../canvas/actions";
import { CONNECT_COPY } from "../canvas/connect";
import { NODE_TYPES } from "../components/TypeChip";
import { isProposalApplied } from "../store/chat";
import { connectionBetween } from "../store/edges";
import type { AppStore } from "../store/state";
import type { CanvasNode, ChatMessage, Edge, NodeType } from "../types";
import { COPY, proposalAdded, proposalNodeGone } from "../ui/copy";
import type { uiStore } from "../ui/uiStore";

export interface ApplyDeps {
  store: AppStore;
  ui: typeof uiStore;
  /** Where a new node should land: the middle of what the person can see. */
  at: Point;
}

export type ApplyOutcome =
  | { status: "applied"; kind: "node"; node: CanvasNode }
  | { status: "applied"; kind: "edge"; edge: Edge }
  /** Nothing to do, or told why and left alone: no request was made. */
  | { status: "refused" }
  /** The request was made and did not work. */
  | { status: "failed" };

const REFUSED: ApplyOutcome = { status: "refused" };
const FAILED: ApplyOutcome = { status: "failed" };

/**
 * Applies what a reply proposed, through the store's own createNode and createEdge (the
 * ones the Add menu and connect mode use), so it is validated, reconciled and undoable
 * exactly as they are. Says what happened; the caller moves the camera.
 */
export async function applyProposal(message: ChatMessage, deps: ApplyDeps): Promise<ApplyOutcome> {
  const { proposal } = message;
  if (!proposal || message.status !== "done") return REFUSED;
  // Being applied right now (held in uiStore so a card remounted mid-request still knows), or already applied.
  if (deps.ui.getState().applyingProposals.includes(message.id)) return REFUSED;
  if (isProposalApplied(deps.store.getState(), message.id)) return REFUSED;

  deps.ui.getState().setProposalApplying(message.id, true);
  try {
    return proposal.kind === "create-node"
      ? await addNode(message, proposal.payload, deps)
      : await addEdge(message, proposal.payload, deps);
  } finally {
    deps.ui.getState().setProposalApplying(message.id, false);
  }
}

function toast(deps: ApplyDeps, message: string, tone: "warn" | "danger") {
  deps.ui.getState().toast({ message, tone });
}

function offerUndo(deps: ApplyDeps, message: string) {
  deps.ui.getState().toast({
    message,
    tone: "success",
    actionLabel: "Undo",
    durationMs: 8000,
    onAction: () => {
      deps.store
        .getState()
        .undo()
        .catch(() => toast(deps, COPY.undoFailed, "danger"));
    },
  });
}

async function addNode(message: ChatMessage, payload: Partial<CanvasNode>, deps: ApplyDeps): Promise<ApplyOutcome> {
  const { store, ui } = deps;
  const type: NodeType = NODE_TYPES.includes(payload.type as NodeType) ? (payload.type as NodeType) : "content";
  const title = payload.title?.trim() || "Untitled";
  const { x, y } = avoidOverlap(deps.at, Object.values(store.getState().nodes));
  try {
    const node = await store.getState().createNode({ type, title, body: payload.body ?? "", x, y });
    store.getState().markProposalApplied(message.id, { kind: "node", id: node.id });
    ui.getState().flash([node.id]);
    offerUndo(deps, proposalAdded(title));
    return { status: "applied", kind: "node", node };
  } catch {
    toast(deps, COPY.proposalFailed, "danger");
    return FAILED;
  }
}

async function addEdge(message: ChatMessage, payload: Partial<Edge>, deps: ApplyDeps): Promise<ApplyOutcome> {
  const { store, ui } = deps;
  const { fromId, toId } = payload;
  if (!fromId || !toId) {
    toast(deps, COPY.proposalFailed, "danger");
    return FAILED;
  }

  const { nodes, edges } = store.getState();
  const gone = [fromId, toId].find((id) => !nodes[id]);
  if (gone) {
    toast(deps, proposalNodeGone(message.proposalTitles?.[gone]), "warn");
    return REFUSED;
  }
  if (connectionBetween(edges, fromId, toId)) {
    toast(deps, CONNECT_COPY.duplicate, "warn");
    return REFUSED;
  }

  try {
    const edge = await store.getState().createEdge({ fromId, toId, kind: payload.kind ?? "serves" });
    store.getState().markProposalApplied(message.id, { kind: "edge", id: edge.id });
    ui.getState().flash([fromId, toId]);
    offerUndo(
      deps,
      proposalAdded(`${nodes[fromId]!.title.trim() || "Untitled"} → ${nodes[toId]!.title.trim() || "Untitled"}`),
    );
    return { status: "applied", kind: "edge", edge };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "node_not_found") {
      toast(deps, proposalNodeGone(undefined), "warn");
      return REFUSED;
    }
    if (code === "edge_exists") {
      toast(deps, CONNECT_COPY.duplicate, "warn");
      return REFUSED;
    }
    toast(deps, COPY.proposalFailed, "danger");
    return FAILED;
  }
}
