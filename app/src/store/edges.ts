import type { Edge, EdgeInput } from "../types";
import { record } from "./history";
import { mutate, notFound } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

export interface EdgesSlice {
  edges: ById<Edge>;
  /**
   * One stored edge per connection, never a mirrored pair. Not optimistic: the
   * line draws once the API has accepted it.
   */
  createEdge: (input: EdgeInput) => Promise<Edge>;
  deleteEdge: (id: string) => Promise<void>;
}

export const createEdgesSlice: SliceCreator<EdgesSlice> = (ctx) => (_set, _get, store) => ({
  edges: {},
  createEdge: (input) => createEdge(ctx, store, input),
  deleteEdge: (id) => deleteEdge(ctx, store, id, true),
});

async function createEdge(ctx: StoreContext, store: AppStore, input: EdgeInput) {
  const edge = await mutate(store, {
    request: () => ctx.api.edges.create(input),
    commit: (s, created) => ({ edges: { ...s.edges, [created.id]: created } }),
    rollback: () => ({}),
  });
  record(store, {
    label: "Connect",
    undo: () => deleteEdge(ctx, store, ctx.ids.resolve(edge.id), false),
  });
  return edge;
}

async function deleteEdge(ctx: StoreContext, store: AppStore, id: string, track: boolean) {
  const edge = store.getState().edges[id];
  if (!edge) throw notFound("edge");
  const order = Object.keys(store.getState().edges);

  await mutate(store, {
    apply: (s) => ({ edges: omit(s.edges, [id]) }),
    request: () => ctx.api.edges.remove(id),
    commit: () => ({}),
    rollback: (s) => ({ edges: reinsert(s.edges, { [id]: edge }, order) }),
  });

  if (!track) return;
  record(store, {
    label: "Delete connection",
    undo: async () => {
      const fromId = ctx.ids.resolve(edge.fromId);
      const toId = ctx.ids.resolve(edge.toId);
      const { nodes } = store.getState();
      // An endpoint was deleted since; the connection has nothing to come back to.
      if (!nodes[fromId] || !nodes[toId]) return;
      const created = await ctx.api.edges.create({ fromId, toId, kind: edge.kind, label: edge.label });
      ctx.ids.alias(edge.id, created.id);
      store.setState((s) => ({ edges: { ...s.edges, [created.id]: created } }));
    },
  });
}

// ------------------------------------------------------------- reading edges

/** Any edge joining the two nodes, in either direction and of either kind. */
export function connectionBetween(edges: ById<Edge>, a: string, b: string): Edge | undefined {
  return Object.values(edges).find((e) => (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a));
}

export interface ConnectionGroups {
  /** `serves` edges leaving this node: it serves them. */
  serves: Edge[];
  /** `serves` edges arriving at this node: they serve it. */
  servedBy: Edge[];
  /** `relates-to` edges, which have no direction. */
  related: Edge[];
}

/**
 * The bidirectional display rule: each edge is stored once and appears on both
 * of its endpoints, under Serves on one side and Served by on the other.
 */
export function groupConnections(edges: ById<Edge>, nodeId: string): ConnectionGroups {
  const groups: ConnectionGroups = { serves: [], servedBy: [], related: [] };
  for (const edge of Object.values(edges)) {
    if (edge.fromId !== nodeId && edge.toId !== nodeId) continue;
    if (edge.kind === "relates-to") groups.related.push(edge);
    else if (edge.fromId === nodeId) groups.serves.push(edge);
    else groups.servedBy.push(edge);
  }
  return groups;
}

/** The node at the far end of an edge, seen from `nodeId`. */
export function otherEnd(edge: Edge, nodeId: string): string {
  return edge.fromId === nodeId ? edge.toId : edge.fromId;
}
