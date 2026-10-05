import { ApiError } from "../api/client";
import type { Stroke, StrokeInput } from "../types";
import { record } from "./history";
import { mutate, notFound, toApiError } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

/** A stroke that exists only in this tab: its save is in flight, or it failed. Saved strokes have no entry. */
export type StrokeSync = "saving" | "failed";

export interface StrokesSlice {
  strokes: ById<Stroke>;
  strokeSync: Record<string, StrokeSync>;
  /**
   * Optimistic: the stroke is drawn at once under a temporary id, and swapped for the server's when
   * the API answers. If the save fails the stroke is NOT removed (nothing the user drew goes because a
   * request failed): it stays, marked failed, for `retryStroke`; this still rejects. `onLocalId` hears
   * the temporary id synchronously, so the caller can offer Retry for that stroke.
   */
  createStroke: (input: StrokeInput, onLocalId?: (id: string) => void) => Promise<Stroke>;
  /** Sends a stroke that failed to save again, in the same place. */
  retryStroke: (id: string) => Promise<Stroke>;
  /**
   * Removes whole strokes: at once, then from the API. One undo step for the lot. Resolves with whether
   * there is something to undo (strokes that never reached the API have nothing to bring back). A stroke
   * whose save is still in flight is left alone. If a delete fails its stroke comes back and this rejects.
   */
  deleteStrokes: (ids: string[]) => Promise<boolean>;
  /** Every stroke on the board, in one request. Brings the ink back if the request fails. */
  clearStrokes: () => Promise<void>;
}

let nextLocal = 1;

export const createStrokesSlice: SliceCreator<StrokesSlice> = (ctx) => (_set, _get, store) => ({
  strokes: {},
  strokeSync: {},
  createStroke: (input, onLocalId) => createStroke(ctx, store, input, onLocalId),
  retryStroke: (id) => retryStroke(ctx, store, id),
  deleteStrokes: (ids) => deleteStrokes(ctx, store, ids, true),
  clearStrokes: () => clearStrokes(ctx, store),
});

const inputOf = ({ tool, color, width, points }: Stroke): StrokeInput => ({ tool, color, width, points });

function createStroke(ctx: StoreContext, store: AppStore, input: StrokeInput, onLocalId?: (id: string) => void) {
  const id = `tmp_stroke_${nextLocal++}`;
  const local: Stroke = { id, ...input, createdAt: new Date().toISOString() };
  store.setState((s) => ({
    strokes: { ...s.strokes, [id]: local },
    strokeSync: { ...s.strokeSync, [id]: "saving" },
  }));
  onLocalId?.(id);
  return send(ctx, store, id, input);
}

function retryStroke(ctx: StoreContext, store: AppStore, id: string) {
  const stroke = store.getState().strokes[id];
  if (!stroke || store.getState().strokeSync[id] !== "failed") return Promise.reject(notFound("stroke"));
  return send(ctx, store, id, inputOf(stroke));
}

/** Posts a stroke that is already drawn under `id`, and settles what is drawn with the answer. */
async function send(ctx: StoreContext, store: AppStore, id: string, input: StrokeInput): Promise<Stroke> {
  store.setState((s) => ({ strokeSync: { ...s.strokeSync, [id]: "saving" } }));
  let created: Stroke;
  try {
    created = await ctx.api.strokes.create(input);
  } catch (error) {
    // Still there, still drawn: only its mark changes.
    store.setState((s) => (id in s.strokes ? { strokeSync: { ...s.strokeSync, [id]: "failed" } } : {}));
    throw toApiError(error);
  }

  if (!(id in store.getState().strokes)) {
    // Cleared while it was on its way. It is not on the canvas, so it must not be on the board either.
    void ctx.api.strokes.remove(created.id).catch(() => {});
    return created;
  }
  ctx.ids.alias(id, created.id);
  store.setState((s) => ({
    // The server's stroke takes the temporary one's place, so the stacking order does not change.
    strokes: Object.fromEntries(Object.entries(s.strokes).map(([key, value]) => (key === id ? [created.id, created] : [key, value]))),
    strokeSync: omit(s.strokeSync, [id]),
  }));
  record(store, {
    label: "Draw",
    undo: async () => void (await deleteStrokes(ctx, store, ctx.ids.resolve(created.id), false)),
  });
  return created;
}

async function deleteStrokes(ctx: StoreContext, store: AppStore, ids: string[] | string, track: boolean): Promise<boolean> {
  const wanted = Array.isArray(ids) ? ids : [ids];
  const s0 = store.getState();
  // A stroke still being saved can't be deleted yet: it has no id the API knows.
  const present = wanted.filter((id) => s0.strokes[id] && s0.strokeSync[id] !== "saving");
  if (present.length === 0) return false;
  const removed: ById<Stroke> = Object.fromEntries(present.map((id) => [id, s0.strokes[id]!]));
  const syncOf = Object.fromEntries(present.flatMap((id) => (s0.strokeSync[id] ? [[id, s0.strokeSync[id]!]] : [])));
  const order = Object.keys(s0.strokes);
  const remote = present.filter((id) => !s0.strokeSync[id]);

  store.setState((s) => ({ strokes: omit(s.strokes, present), strokeSync: omit(s.strokeSync, present) }));

  const results = await Promise.allSettled(remote.map((id) => ctx.api.strokes.remove(id)));
  // Already gone on the server counts as deleted: that is what was asked for.
  const refused = remote.filter((_, i) => {
    const result = results[i]!;
    return result.status === "rejected" && !(result.reason instanceof ApiError && result.reason.code === "stroke_not_found");
  });
  if (refused.length > 0) {
    store.setState((s) => ({
      strokes: reinsert(s.strokes, Object.fromEntries(refused.map((id) => [id, removed[id]!])), order),
      strokeSync: { ...s.strokeSync, ...Object.fromEntries(refused.flatMap((id) => (syncOf[id] ? [[id, syncOf[id]]] : []))) },
    }));
  }

  const gone = remote.filter((id) => !refused.includes(id));
  if (track && gone.length > 0) {
    record(store, { label: gone.length === 1 ? "Erase stroke" : "Erase strokes", undo: restoreStrokes(ctx, store, gone.map((id) => removed[id]!)) });
  }
  if (refused.length > 0) {
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    throw toApiError(failure.reason);
  }
  return gone.length > 0;
}

/**
 * The API has no undelete: each stroke is drawn again and gets a new id. Progress is kept, so a retry
 * after a partial failure carries on rather than drawing the first ones twice.
 */
function restoreStrokes(ctx: StoreContext, store: AppStore, strokes: Stroke[]): () => Promise<void> {
  const pending = [...strokes];
  return async () => {
    while (pending.length > 0) {
      const stroke = pending[0]!;
      const created = await ctx.api.strokes.create(inputOf(stroke));
      ctx.ids.alias(stroke.id, created.id);
      store.setState((s) => ({ strokes: { ...s.strokes, [created.id]: created } }));
      pending.shift();
    }
  };
}

async function clearStrokes(ctx: StoreContext, store: AppStore): Promise<void> {
  const s0 = store.getState();
  if (Object.keys(s0.strokes).length === 0) return;
  const snapshot = s0.strokes;
  const syncSnapshot = s0.strokeSync;
  const order = Object.keys(snapshot);
  await mutate(store, {
    apply: () => ({ strokes: {}, strokeSync: {} }),
    request: () => ctx.api.strokes.clear(),
    commit: () => ({}),
    rollback: (s) => ({ strokes: reinsert(s.strokes, snapshot, order), strokeSync: { ...syncSnapshot, ...s.strokeSync } }),
  });
}
