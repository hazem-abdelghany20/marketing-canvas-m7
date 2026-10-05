import type { Annotation, CanvasNode, Edge, NodeInput, NodePatch } from "../types";
import { record } from "./history";
import { mutate, notFound } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

/** One node's share of a batch: the fields to change on it. */
export interface NodeUpdate {
  id: string;
  patch: NodePatch;
}

export interface NodesSlice {
  nodes: ById<CanvasNode>;
  /**
   * Not optimistic: the node appears once the API has it, so a failed create
   * never leaves a half-made node on the canvas.
   */
  createNode: (input: NodeInput) => Promise<CanvasNode>;
  updateNode: (id: string, patch: NodePatch) => Promise<CanvasNode>;
  /**
   * Several nodes at once, as ONE undo step. Each goes through the same optimistic
   * update as `updateNode`. All or nothing: if any save fails, the ones that did
   * save are put back and the failure is rethrown, so no half-finished batch is
   * left behind and no history entry is added.
   */
  updateNodes: (updates: NodeUpdate[], label?: string) => Promise<CanvasNode[]>;
  /** The API cascades to the node's edges and annotations; so does the cache. */
  deleteNode: (id: string) => Promise<void>;
}

export const createNodesSlice: SliceCreator<NodesSlice> = (ctx) => (_set, _get, store) => ({
  nodes: {},
  createNode: (input) => createNode(ctx, store, input),
  updateNode: (id, patch) => updateNode(ctx, store, id, patch, true),
  updateNodes: (updates, label) => updateNodes(ctx, store, updates, label),
  deleteNode: (id) => deleteNode(ctx, store, id, true),
});

async function createNode(ctx: StoreContext, store: AppStore, input: NodeInput) {
  const node = await mutate(store, {
    request: () => ctx.api.nodes.create(input),
    commit: (s, created) => ({ nodes: { ...s.nodes, [created.id]: created } }),
    rollback: () => ({}),
  });
  record(store, {
    label: "Add node",
    undo: () => deleteNode(ctx, store, ctx.ids.resolve(node.id), false),
  });
  return node;
}

async function updateNode(ctx: StoreContext, store: AppStore, id: string, patch: NodePatch, track: boolean) {
  const before = store.getState().nodes[id];
  if (!before) throw notFound("node");

  const result = await mutate(store, {
    apply: (s) => ({ nodes: { ...s.nodes, [id]: { ...(s.nodes[id] ?? before), ...patch } } }),
    request: () => ctx.api.nodes.update(id, patch),
    commit: (s, node) => (s.nodes[id] ? { nodes: { ...s.nodes, [id]: node } } : {}),
    rollback: (s) => (s.nodes[id] ? { nodes: { ...s.nodes, [id]: before } } : {}),
  });

  if (track) {
    const inverse = inverseOf(before, patch);
    record(store, {
      label: "Edit node",
      undo: async () => void (await updateNode(ctx, store, ctx.ids.resolve(id), inverse, false)),
    });
  }
  return result;
}

/** Only the fields an edit touched go back. */
function inverseOf(before: CanvasNode, patch: NodePatch): NodePatch {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, before[key as keyof NodePatch]])) as NodePatch;
}

async function updateNodes(ctx: StoreContext, store: AppStore, updates: NodeUpdate[], label = "Edit nodes") {
  if (updates.length === 0) return [];
  const before = new Map<string, CanvasNode>();
  for (const { id } of updates) {
    const node = store.getState().nodes[id];
    if (!node) throw notFound("node");
    before.set(id, node);
  }

  // Puts the given nodes back, skipping any that have been deleted since.
  const putBack = async (subset: NodeUpdate[]) =>
    Promise.allSettled(
      subset.map(({ id, patch }) => {
        const current = ctx.ids.resolve(id);
        if (!store.getState().nodes[current]) return Promise.resolve();
        return updateNode(ctx, store, current, inverseOf(before.get(id)!, patch), false);
      }),
    );

  // Every call applies its change before its first await, so the whole batch shows at once.
  const results = await Promise.allSettled(updates.map(({ id, patch }) => updateNode(ctx, store, id, patch, false)));
  const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failure) {
    const saved = updates.filter((_, i) => results[i]?.status === "fulfilled");
    const reverts = await putBack(saved);
    // A node that could not be put back is still moved on the server; keep it undoable.
    const stuck = saved.filter((_, i) => reverts[i]?.status === "rejected");
    if (stuck.length > 0) {
      record(store, {
        label,
        undo: async () => {
          const retried = await putBack(stuck);
          const failed = retried.find((r): r is PromiseRejectedResult => r.status === "rejected");
          if (failed) throw failed.reason;
        },
      });
    }
    throw failure.reason;
  }

  record(store, {
    label,
    undo: async () => {
      const reverts = await putBack(updates);
      const failed = reverts.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
    },
  });
  return results.map((r) => (r as PromiseFulfilledResult<CanvasNode>).value);
}

async function deleteNode(ctx: StoreContext, store: AppStore, id: string, track: boolean) {
  const s0 = store.getState();
  const node = s0.nodes[id];
  if (!node) throw notFound("node");
  const edges = Object.values(s0.edges).filter((e) => e.fromId === id || e.toId === id);
  const annotations = Object.values(s0.annotations).filter((a) => a.nodeId === id);
  const order = {
    nodes: Object.keys(s0.nodes),
    edges: Object.keys(s0.edges),
    annotations: Object.keys(s0.annotations),
  };

  await mutate(store, {
    apply: (s) => ({
      nodes: omit(s.nodes, [id]),
      edges: omit(s.edges, edges.map((e) => e.id)),
      annotations: omit(s.annotations, annotations.map((a) => a.id)),
    }),
    request: () => ctx.api.nodes.remove(id),
    commit: () => ({}),
    rollback: (s) => ({
      nodes: reinsert(s.nodes, { [id]: node }, order.nodes),
      edges: reinsert(s.edges, Object.fromEntries(edges.map((e) => [e.id, e])), order.edges),
      annotations: reinsert(s.annotations, Object.fromEntries(annotations.map((a) => [a.id, a])), order.annotations),
    }),
  });

  if (track) record(store, { label: "Delete node", undo: restoreNode(ctx, store, node, edges, annotations) });
}

/**
 * The API has no undelete: the node, its edges and its annotations are posted
 * back and get new ids. Progress is kept, so a retry after a partial failure
 * resumes rather than creating the node twice.
 */
function restoreNode(
  ctx: StoreContext,
  store: AppStore,
  node: CanvasNode,
  edges: Edge[],
  annotations: Annotation[],
): () => Promise<void> {
  let restoredId: string | null = null;
  const pendingEdges = [...edges];
  const pendingAnnotations = [...annotations];

  return async () => {
    if (!restoredId) {
      const { type, title, body, fileIds, x, y } = node;
      const created = await ctx.api.nodes.create({ type, title, body, fileIds, x, y });
      restoredId = created.id;
      ctx.ids.alias(node.id, created.id);
      store.setState((s) => ({ nodes: { ...s.nodes, [created.id]: created } }));
    }

    while (pendingEdges.length > 0) {
      const edge = pendingEdges[0]!;
      const fromId = ctx.ids.resolve(edge.fromId);
      const toId = ctx.ids.resolve(edge.toId);
      const { nodes } = store.getState();
      // The other end has gone too; there is nothing left to connect to.
      if (nodes[fromId] && nodes[toId]) {
        const created = await ctx.api.edges.create({ fromId, toId, kind: edge.kind, label: edge.label });
        ctx.ids.alias(edge.id, created.id);
        store.setState((s) => ({ edges: { ...s.edges, [created.id]: created } }));
      }
      pendingEdges.shift();
    }

    while (pendingAnnotations.length > 0) {
      const annotation = pendingAnnotations[0]!;
      const created = await ctx.api.annotations.create(restoredId, annotation.body);
      ctx.ids.alias(annotation.id, created.id);
      store.setState((s) => ({ annotations: { ...s.annotations, [created.id]: created } }));
      pendingAnnotations.shift();
    }
  };
}
