import type { Annotation, CanvasNode, Edge, NodePatch } from "../types";
import { record } from "./history";
import { mutate, notFound } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

export interface NodesSlice {
  nodes: ById<CanvasNode>;
  updateNode: (id: string, patch: NodePatch) => Promise<CanvasNode>;
  /** The API cascades to the node's edges and annotations; so does the cache. */
  deleteNode: (id: string) => Promise<void>;
  // createNode arrives with ticket 006.
}

export const createNodesSlice: SliceCreator<NodesSlice> = (ctx) => (_set, _get, store) => ({
  nodes: {},
  updateNode: (id, patch) => updateNode(ctx, store, id, patch, true),
  deleteNode: (id) => deleteNode(ctx, store, id, true),
});

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
    // Only the fields this edit touched go back.
    const inverse = Object.fromEntries(
      Object.keys(patch).map((key) => [key, before[key as keyof NodePatch]]),
    ) as NodePatch;
    record(store, {
      label: "Edit node",
      undo: async () => void (await updateNode(ctx, store, ctx.ids.resolve(id), inverse, false)),
    });
  }
  return result;
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
