import { ApiError } from "../api/client";
import type { Mark, MarkInput, MarkPatch, MarkVariant } from "../types";
import { record } from "./history";
import { mutate, notFound, toApiError } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

/**
 * A mark that is not (yet) in step with the API. `draft`: dropped and never sent, because nothing has
 * been typed. `saving`: a request is in flight. `failed`: the last request failed and the mark, text
 * and all, is still on screen. A mark in step with the API has no entry.
 */
export type MarkSync = "draft" | "saving" | "failed";

export interface MarksSlice {
  marks: ById<Mark>;
  markSync: Record<string, MarkSync>;
  /** Drops an empty mark on the board, in this tab only: nothing is sent until it has text. Returns its temporary id. */
  draftMark: (input: { variant: MarkVariant; x: number; y: number; color?: string | null }) => string;
  /**
   * The mark was left (blurred) holding `body`. A draft with no text is discarded and nothing is sent; a
   * draft with text is posted; a saved mark whose text changed is patched (and deleted, undoably, if the
   * text was emptied). A failed save keeps the text on screen, marks it failed, and rejects. Resolves
   * with the mark, or null when it was discarded or deleted.
   */
  commitMark: (id: string, body: string) => Promise<Mark | null>;
  /** The drag ended: one patch with the final position. A draft only moves here. A failure leaves it where it was dropped. */
  moveMark: (id: string, x: number, y: number) => Promise<Mark | null>;
  /** Sends a failed mark again, from what is on screen. */
  retryMark: (id: string) => Promise<Mark>;
  /** Removes the mark at once, then from the API; it comes back if that fails. Resolves with whether there is something to undo. */
  deleteMark: (id: string) => Promise<boolean>;
}

let nextLocal = 1;
/** Marks that exist only in this tab carry a temporary id until the API has them. */
export const isLocal = (id: string) => id.startsWith("tmp_mark_");
const tenth = (n: number) => Math.round(n * 10) / 10;

export const createMarksSlice: SliceCreator<MarksSlice> = (ctx) => (_set, _get, store) => ({
  marks: {},
  markSync: {},
  draftMark: (input) => draftMark(store, input),
  commitMark: (id, body) => commitMark(ctx, store, id, body),
  moveMark: (id, x, y) => moveMark(ctx, store, id, x, y),
  retryMark: (id) => retryMark(ctx, store, id),
  deleteMark: (id) => deleteMark(ctx, store, id, true),
});

const inputOf = (mark: Mark): MarkInput => ({
  variant: mark.variant,
  x: mark.x,
  y: mark.y,
  body: mark.body,
  ...(mark.color ? { color: mark.color } : {}),
});

function draftMark(store: AppStore, input: { variant: MarkVariant; x: number; y: number; color?: string | null }) {
  const id = `tmp_mark_${nextLocal++}`;
  const now = new Date().toISOString();
  const mark: Mark = { id, variant: input.variant, x: input.x, y: input.y, body: "", color: input.color ?? null, createdAt: now, updatedAt: now };
  store.setState((s) => ({ marks: { ...s.marks, [id]: mark }, markSync: { ...s.markSync, [id]: "draft" } }));
  return id;
}

function setLocal(store: AppStore, id: string, change: Partial<Mark>) {
  store.setState((s) => (s.marks[id] ? { marks: { ...s.marks, [id]: { ...s.marks[id]!, ...change } } } : {}));
}

function discard(store: AppStore, id: string) {
  store.setState((s) => ({ marks: omit(s.marks, [id]), markSync: omit(s.markSync, [id]) }));
}

async function commitMark(ctx: StoreContext, store: AppStore, id: string, body: string): Promise<Mark | null> {
  const mark = store.getState().marks[id];
  if (!mark) return null;

  if (isLocal(id)) {
    if (store.getState().markSync[id] === "saving") {
      // A first save is on its way; what is typed now follows it once it has landed.
      setLocal(store, id, { body });
      return mark;
    }
    // An empty sticky is an abandoned gesture, not content: it never reaches the API.
    if (body.trim() === "") {
      discard(store, id);
      return null;
    }
    setLocal(store, id, { body });
    return create(ctx, store, id);
  }

  if (body === mark.body) return mark;
  if (body.trim() === "") {
    await deleteMark(ctx, store, id, true);
    return null;
  }
  return patch(ctx, store, id, { body }, true);
}

async function moveMark(ctx: StoreContext, store: AppStore, id: string, x: number, y: number): Promise<Mark | null> {
  const mark = store.getState().marks[id];
  if (!mark) return null;
  const to = { x: tenth(x), y: tenth(y) };
  if (isLocal(id)) {
    setLocal(store, id, to);
    return store.getState().marks[id] ?? null;
  }
  if (mark.x === to.x && mark.y === to.y) return mark;
  return patch(ctx, store, id, to, true);
}

function retryMark(ctx: StoreContext, store: AppStore, id: string): Promise<Mark> {
  const mark = store.getState().marks[id];
  if (!mark || store.getState().markSync[id] !== "failed") return Promise.reject(notFound("mark"));
  if (isLocal(id)) return create(ctx, store, id);
  // What is on screen is what was meant, so all of it goes.
  return patch(ctx, store, id, { x: mark.x, y: mark.y, body: mark.body, color: mark.color }, false);
}

/** Posts a mark that exists only here, and settles what is on screen with the answer. */
async function create(ctx: StoreContext, store: AppStore, id: string): Promise<Mark> {
  const sent = store.getState().marks[id]!;
  store.setState((s) => ({ markSync: { ...s.markSync, [id]: "saving" } }));
  let created: Mark;
  try {
    created = await ctx.api.marks.create(inputOf(sent));
  } catch (error) {
    // Still there, text intact: only its mark changes.
    store.setState((s) => (id in s.marks ? { markSync: { ...s.markSync, [id]: "failed" } } : {}));
    throw toApiError(error);
  }

  const latest = store.getState().marks[id];
  if (!latest) {
    // Deleted while it was on its way: it must not be on the board either.
    void ctx.api.marks.remove(created.id).catch(() => {});
    return created;
  }
  ctx.ids.alias(id, created.id);
  store.setState((s) => ({
    // The server's mark takes the draft's place, so the stacking order does not change.
    marks: Object.fromEntries(Object.entries(s.marks).map(([key, value]) => (key === id ? [created.id, created] : [key, value]))),
    markSync: omit(s.markSync, [id]),
  }));
  record(store, { label: "Add note", undo: async () => void (await deleteMark(ctx, store, ctx.ids.resolve(created.id), false)) });

  // Typed or moved while the first save was in flight: send that on now.
  const later: MarkPatch = {};
  if (latest.body !== sent.body) later.body = latest.body;
  if (latest.x !== sent.x) later.x = latest.x;
  if (latest.y !== sent.y) later.y = latest.y;
  if (Object.keys(later).length > 0) await patch(ctx, store, created.id, later, false).catch(() => {});
  return store.getState().marks[created.id] ?? created;
}

/** Shows the change at once and patches it. On failure the change stays on screen, marked failed. */
async function patch(ctx: StoreContext, store: AppStore, id: string, change: MarkPatch, track: boolean): Promise<Mark> {
  const before = store.getState().marks[id];
  if (!before) throw notFound("mark");
  store.setState((s) => ({
    marks: { ...s.marks, [id]: { ...s.marks[id]!, ...change } },
    markSync: { ...s.markSync, [id]: "saving" },
  }));
  let updated: Mark;
  try {
    updated = await ctx.api.marks.update(id, change);
  } catch (error) {
    store.setState((s) => (id in s.marks ? { markSync: { ...s.markSync, [id]: "failed" } } : {}));
    throw toApiError(error);
  }
  store.setState((s) => (id in s.marks ? { marks: { ...s.marks, [id]: updated }, markSync: omit(s.markSync, [id]) } : {}));

  if (track) {
    const inverse = Object.fromEntries(Object.keys(change).map((key) => [key, before[key as keyof Mark]])) as MarkPatch;
    record(store, {
      label: "x" in change ? "Move note" : "Edit note",
      undo: async () => void (await patch(ctx, store, ctx.ids.resolve(id), inverse, false)),
    });
  }
  return updated;
}

const alreadyGone = (error: unknown) => error instanceof ApiError && error.code === "mark_not_found";

async function deleteMark(ctx: StoreContext, store: AppStore, id: string, track: boolean): Promise<boolean> {
  const s0 = store.getState();
  const mark = s0.marks[id];
  if (!mark) return false;
  // Never reached the API (a draft, or a first save that failed): there is nothing there to delete.
  if (isLocal(id)) {
    discard(store, id);
    return false;
  }
  const sync = s0.markSync[id];
  const order = Object.keys(s0.marks);

  await mutate(store, {
    apply: (s) => ({ marks: omit(s.marks, [id]), markSync: omit(s.markSync, [id]) }),
    request: () => ctx.api.marks.remove(id).catch((error) => (alreadyGone(error) ? undefined : Promise.reject(error))),
    commit: () => ({}),
    rollback: (s) => ({
      marks: reinsert(s.marks, { [id]: mark }, order),
      markSync: sync ? { ...s.markSync, [id]: sync } : s.markSync,
    }),
  });

  if (track) record(store, { label: "Delete note", undo: restoreMark(ctx, store, mark) });
  return true;
}

/** The API has no undelete: the mark is written out again and gets a new id. A retried undo does not write it twice. */
function restoreMark(ctx: StoreContext, store: AppStore, mark: Mark): () => Promise<void> {
  let restored: Mark | null = null;
  return async () => {
    if (restored) return;
    const created = await ctx.api.marks.create(inputOf(mark));
    restored = created;
    ctx.ids.alias(mark.id, created.id);
    store.setState((s) => ({ marks: { ...s.marks, [created.id]: created } }));
  };
}
