import { ApiError } from "../api/client";
import type { Comment, Pin } from "../types";
import { mutate, notFound, toApiError } from "./mutation";
import { omit, reinsert, type ById } from "./records";
import type { AppStore, SliceCreator, StoreContext } from "./state";

/** A pin that is not (yet) in step with the API: dropped but never sent, being sent, or failed to send. */
export type PinSync = "draft" | "saving" | "failed";
/** A comment that is in the thread but not (yet) on the board: being sent, or failed to send. */
export type CommentSync = "sending" | "failed";

export interface PinsSlice {
  pins: ById<Pin>;
  pinSync: Record<string, PinSync>;
  commentSync: Record<string, CommentSync>;
  /** A draft pin's temporary id → the server's, once the pin has been made. Lets an open thread follow its pin. */
  pinAlias: Record<string, string>;
  /** Drops an empty pin on the board, in this tab only: nothing is sent until there is a comment to post. Returns its temporary id. */
  draftPin: (input: { x: number; y: number }) => string;
  /** Takes away a draft pin nobody said anything on. Anything else is left alone. */
  discardPin: (id: string) => void;
  /**
   * Adds your comment to the thread at once, attributed to you, and sends it. If the pin is only a draft it
   * is made first. A failure keeps the comment in the thread, marked failed, and rejects; `pin_not_found`
   * drops the pin and rejects with that code. Blank text is ignored (resolves null).
   */
  postComment: (pinId: string, body: string) => Promise<Comment | null>;
  retryComment: (pinId: string, commentId: string) => Promise<Comment>;
  /** Flips resolved at once; puts it back if the API refuses. A thread with nothing in it can't be resolved. */
  setResolved: (id: string, resolved: boolean) => Promise<Pin>;
  /** Removes the pin and its thread at once; they come back if the API refuses. Confirmed by the caller, not undoable. */
  deletePin: (id: string) => Promise<void>;
  deleteComment: (pinId: string, commentId: string) => Promise<void>;
}

let nextPin = 1;
let nextComment = 1;
/** Pins that exist only in this tab carry a temporary id until the API has them. */
export const isLocalPin = (id: string) => id.startsWith("tmp_pin_");
const isLocalComment = (id: string) => id.startsWith("tmp_cmt_");
const gone = (error: unknown, code: string) => error instanceof ApiError && error.code === code;

export const createPinsSlice: SliceCreator<PinsSlice> = (ctx) => (_set, _get, store) => ({
  pins: {},
  pinSync: {},
  commentSync: {},
  pinAlias: {},
  draftPin: (input) => draftPin(store, input),
  discardPin: (id) => discardPin(store, id),
  postComment: (pinId, body) => postComment(ctx, store, pinId, body),
  retryComment: (pinId, commentId) => sendComment(ctx, store, ctx.ids.resolve(pinId), commentId),
  setResolved: (id, resolved) => setResolved(ctx, store, id, resolved),
  deletePin: (id) => deletePin(ctx, store, id),
  deleteComment: (pinId, commentId) => deleteComment(ctx, store, ctx.ids.resolve(pinId), commentId),
});

function draftPin(store: AppStore, { x, y }: { x: number; y: number }) {
  const id = `tmp_pin_${nextPin++}`;
  const pin: Pin = { id, x, y, resolved: false, createdAt: new Date().toISOString(), comments: [] };
  store.setState((s) => ({ pins: { ...s.pins, [id]: pin }, pinSync: { ...s.pinSync, [id]: "draft" } }));
  return id;
}

function discardPin(store: AppStore, id: string) {
  const { pins, pinSync } = store.getState();
  const pin = pins[id];
  if (!pin || !isLocalPin(id) || pinSync[id] !== "draft" || pin.comments.length > 0) return;
  store.setState((s) => ({ pins: omit(s.pins, [id]), pinSync: omit(s.pinSync, [id]) }));
}

/** Drops a pin from the cache along with everything pending on it. */
function forget(store: AppStore, id: string) {
  store.setState((s) => {
    const comments = s.pins[id]?.comments.map((c) => c.id) ?? [];
    return { pins: omit(s.pins, [id]), pinSync: omit(s.pinSync, [id]), commentSync: omit(s.commentSync, comments) };
  });
}

function changePin(store: AppStore, id: string, change: (pin: Pin) => Pin) {
  store.setState((s) => (s.pins[id] ? { pins: { ...s.pins, [id]: change(s.pins[id]!) } } : {}));
}

async function postComment(ctx: StoreContext, store: AppStore, pinId: string, body: string): Promise<Comment | null> {
  const text = body.trim();
  if (!text) return null;
  if (!store.getState().pins[pinId]) throw notFound("pin");

  const me = store.getState().user;
  const comment: Comment = {
    id: `tmp_cmt_${nextComment++}`,
    body: text,
    createdAt: new Date().toISOString(),
    // The API attributes a comment to whoever is signed in; so does what is shown while it travels.
    author: { id: me?.id ?? "", name: me?.name ?? "You", avatarUrl: me?.avatarUrl ?? null },
  };
  changePin(store, pinId, (pin) => ({ ...pin, comments: [...pin.comments, comment] }));
  store.setState((s) => ({ commentSync: { ...s.commentSync, [comment.id]: "sending" } }));
  return sendComment(ctx, store, pinId, comment.id);
}

/** Sends a comment that is in the thread but not on the board, making its pin first if the pin is only a draft. */
async function sendComment(ctx: StoreContext, store: AppStore, pinId: string, commentId: string): Promise<Comment> {
  const start = store.getState().pins[pinId];
  const comment = start?.comments.find((c) => c.id === commentId);
  if (!start || !comment) throw notFound("comment");
  const markFailed = () => store.setState((s) => ({ commentSync: { ...s.commentSync, [commentId]: "failed" } }));

  let id = pinId;
  store.setState((s) => ({ commentSync: { ...s.commentSync, [commentId]: "sending" } }));
  if (isLocalPin(id)) {
    store.setState((s) => ({ pinSync: { ...s.pinSync, [id]: "saving" } }));
    let created: Pin;
    try {
      created = await ctx.api.pins.create({ x: start.x, y: start.y });
    } catch (error) {
      store.setState((s) => (id in s.pins ? { pinSync: { ...s.pinSync, [id]: "failed" } } : {}));
      markFailed();
      throw toApiError(error);
    }
    ctx.ids.alias(id, created.id);
    store.setState((s) => ({
      // The server's pin takes the draft's place, so the numbering does not change; the thread is still the local one.
      pins: Object.fromEntries(
        Object.entries(s.pins).map(([key, value]) => (key === id ? [created.id, { ...created, comments: value.comments }] : [key, value])),
      ),
      pinSync: omit(s.pinSync, [id]),
      pinAlias: { ...s.pinAlias, [id]: created.id },
    }));
    id = created.id;
  }

  let saved: Comment;
  try {
    saved = await ctx.api.pins.addComment(id, comment.body);
  } catch (error) {
    const failure = toApiError(error);
    if (gone(failure, "pin_not_found")) forget(store, id);
    else markFailed();
    throw failure;
  }
  changePin(store, id, (pin) => ({ ...pin, comments: pin.comments.map((c) => (c.id === commentId ? saved : c)) }));
  store.setState((s) => ({ commentSync: omit(s.commentSync, [commentId]) }));
  return saved;
}

async function setResolved(ctx: StoreContext, store: AppStore, id: string, resolved: boolean): Promise<Pin> {
  const pin = store.getState().pins[id];
  if (!pin) throw notFound("pin");
  if (isLocalPin(id) || pin.comments.length === 0) throw new ApiError(0, "nothing_to_resolve", "Nothing to resolve yet.");

  try {
    return await mutate(store, {
      apply: (s) => ({ pins: { ...s.pins, [id]: { ...s.pins[id]!, resolved } } }),
      request: () => ctx.api.pins.update(id, { resolved }),
      // The thread is the local one: it may hold a comment that has not been sent.
      commit: (s, updated) => (s.pins[id] ? { pins: { ...s.pins, [id]: { ...s.pins[id]!, resolved: updated.resolved } } } : {}),
      rollback: (s) => (s.pins[id] ? { pins: { ...s.pins, [id]: { ...s.pins[id]!, resolved: pin.resolved } } } : {}),
    });
  } catch (error) {
    if (gone(error, "pin_not_found")) forget(store, id);
    throw error;
  }
}

async function deletePin(ctx: StoreContext, store: AppStore, id: string): Promise<void> {
  const s0 = store.getState();
  const pin = s0.pins[id];
  if (!pin) return;
  if (isLocalPin(id)) return forget(store, id);

  const order = Object.keys(s0.pins);
  const comments = pin.comments.map((c) => c.id);
  const syncs = Object.fromEntries(comments.flatMap((c) => (s0.commentSync[c] ? [[c, s0.commentSync[c]!]] : [])));
  await mutate(store, {
    apply: (s) => ({ pins: omit(s.pins, [id]), commentSync: omit(s.commentSync, comments) }),
    request: () => ctx.api.pins.remove(id).catch((error) => (gone(error, "pin_not_found") ? undefined : Promise.reject(error))),
    commit: () => ({}),
    rollback: (s) => ({ pins: reinsert(s.pins, { [id]: pin }, order), commentSync: { ...s.commentSync, ...syncs } }),
  });
}

async function deleteComment(ctx: StoreContext, store: AppStore, pinId: string, commentId: string): Promise<void> {
  const pin = store.getState().pins[pinId];
  const at = pin?.comments.findIndex((c) => c.id === commentId) ?? -1;
  if (!pin || at === -1) return;
  const comment = pin.comments[at]!;
  const sync = store.getState().commentSync[commentId];

  const remove = (s: ReturnType<AppStore["getState"]>) => ({
    pins: s.pins[pinId] ? { ...s.pins, [pinId]: { ...s.pins[pinId]!, comments: s.pins[pinId]!.comments.filter((c) => c.id !== commentId) } } : s.pins,
    commentSync: omit(s.commentSync, [commentId]),
  });
  // Never reached the API (it is still being sent, or failed to be): nothing there to delete.
  if (isLocalComment(commentId)) return store.setState(remove);

  await mutate(store, {
    apply: remove,
    request: () => ctx.api.pins.removeComment(commentId).catch((error) => (gone(error, "comment_not_found") ? undefined : Promise.reject(error))),
    commit: () => ({}),
    rollback: (s) =>
      s.pins[pinId]
        ? {
            pins: {
              ...s.pins,
              [pinId]: {
                ...s.pins[pinId]!,
                comments: [...s.pins[pinId]!.comments.slice(0, at), comment, ...s.pins[pinId]!.comments.slice(at)],
              },
            },
            commentSync: sync ? { ...s.commentSync, [commentId]: sync } : s.commentSync,
          }
        : {},
  });
}
