import { ApiError } from "../api/client";
import type { Annotation } from "../types";
import { record } from "./history";
import { mutate, notFound } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

export interface AnnotationsSlice {
  annotations: ById<Annotation>;
  /** Rejects an empty or whitespace-only body before any request, as the API would. */
  createAnnotation: (nodeId: string, body: string) => Promise<Annotation>;
  deleteAnnotation: (id: string) => Promise<void>;
}

export const createAnnotationsSlice: SliceCreator<AnnotationsSlice> = (ctx) => (_set, _get, store) => ({
  annotations: {},
  createAnnotation: (nodeId, body) => createAnnotation(ctx, store, nodeId, body),
  deleteAnnotation: (id) => deleteAnnotation(ctx, store, id),
});

async function createAnnotation(ctx: StoreContext, store: AppStore, nodeId: string, body: string) {
  if (!body.trim()) throw new ApiError(422, "invalid_field", "Write something before adding the note.", "body");
  const annotation = await mutate(store, {
    request: () => ctx.api.annotations.create(nodeId, body),
    commit: (s, created) => ({ annotations: { ...s.annotations, [created.id]: created } }),
    rollback: () => ({}),
  });
  record(store, {
    label: "Add annotation",
    undo: async () => {
      const id = ctx.ids.resolve(annotation.id);
      await ctx.api.annotations.remove(id);
      store.setState((s) => ({ annotations: omit(s.annotations, [id]) }));
    },
  });
  return annotation;
}

async function deleteAnnotation(ctx: StoreContext, store: AppStore, id: string) {
  const annotation = store.getState().annotations[id];
  if (!annotation) throw notFound("annotation");
  const order = Object.keys(store.getState().annotations);

  await mutate(store, {
    apply: (s) => ({ annotations: omit(s.annotations, [id]) }),
    request: () => ctx.api.annotations.remove(id),
    commit: () => ({}),
    rollback: (s) => ({ annotations: reinsert(s.annotations, { [id]: annotation }, order) }),
  });

  record(store, {
    label: "Delete annotation",
    undo: async () => {
      const nodeId = ctx.ids.resolve(annotation.nodeId);
      // Its node was deleted since; there is nothing to put it back on.
      if (!store.getState().nodes[nodeId]) return;
      const created = await ctx.api.annotations.create(nodeId, annotation.body);
      ctx.ids.alias(annotation.id, created.id);
      store.setState((s) => ({ annotations: { ...s.annotations, [created.id]: created } }));
    },
  });
}
