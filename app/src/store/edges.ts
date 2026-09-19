import type { Edge } from "../types";
import { record } from "./history";
import { mutate, notFound } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

export interface EdgesSlice {
  edges: ById<Edge>;
  deleteEdge: (id: string) => Promise<void>;
  // createEdge arrives with ticket 008.
}

export const createEdgesSlice: SliceCreator<EdgesSlice> = (ctx) => (_set, _get, store) => ({
  edges: {},
  deleteEdge: (id) => deleteEdge(ctx, store, id),
});

async function deleteEdge(ctx: StoreContext, store: AppStore, id: string) {
  const edge = store.getState().edges[id];
  if (!edge) throw notFound("edge");
  const order = Object.keys(store.getState().edges);

  await mutate(store, {
    apply: (s) => ({ edges: omit(s.edges, [id]) }),
    request: () => ctx.api.edges.remove(id),
    commit: () => ({}),
    rollback: (s) => ({ edges: reinsert(s.edges, { [id]: edge }, order) }),
  });

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
