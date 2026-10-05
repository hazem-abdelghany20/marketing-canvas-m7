import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { Comment, Pin } from "../../types";
import { deferred, loadedStore, seededRoutes, type Handler } from "./fakeBackend";

const T = "2026-09-02T00:00:00.000Z";
const RANIA = { id: "usr_rania", name: "Rania", avatarUrl: null };
const OMAR = { id: "usr_omar", name: "Omar", avatarUrl: null };
const ADA = { id: "usr_ada", name: "Ada", avatarUrl: null, email: "ada@example.com" };
const comment = (id: string, body: string, author = RANIA): Comment => ({ id, body, createdAt: T, author });
const pin = (id: string, extra: Partial<Pin> = {}): Pin => ({ id, x: 100, y: 120, resolved: false, createdAt: T, comments: [], ...extra });

const OPEN = pin("pin_open", { comments: [comment("c_1", "Carried the drop."), comment("c_2", "Shooting Thursday.", OMAR)] });
const DONE = pin("pin_done", { x: 300, y: 40, resolved: true, comments: [comment("c_3", "Closing this.")] });

const base = (extra: Record<string, Handler> = {}) => ({
  ...seededRoutes(),
  "GET /pins": () => json(200, [OPEN, DONE]),
  ...extra,
});

async function signedIn(extra: Record<string, Handler> = {}) {
  const made = await loadedStore(base(extra));
  made.store.getState().signIn({ token: "tok_1", user: ADA });
  return made;
}
const idsOf = (o: object) => Object.keys(o);

describe("loading", () => {
  it("fills the pins, each with its thread inlined, and starts with nothing unsent", async () => {
    const { store, backend } = await signedIn();

    expect(idsOf(store.getState().pins)).toEqual(["pin_open", "pin_done"]);
    expect(store.getState().pins.pin_open!.comments.map((c) => c.author.name)).toEqual(["Rania", "Omar"]);
    expect(store.getState().pinSync).toEqual({});
    expect(store.getState().commentSync).toEqual({});
    // A thread is never fetched on its own.
    expect(backend.calls.map((c) => new URL(c.url).pathname).filter((p) => p.startsWith("/pins/") || p.startsWith("/comments"))).toEqual([]);
  });
});

describe("draftPin and discardPin", () => {
  it("drops an empty pin on the board at once, in this tab only", async () => {
    const { store, backend } = await signedIn();

    const id = store.getState().draftPin({ x: 40, y: 60 });

    expect(store.getState().pins[id]).toMatchObject({ x: 40, y: 60, resolved: false, comments: [] });
    expect(store.getState().pinSync[id]).toBe("draft");
    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("takes an empty draft away again, without a request", async () => {
    const { store, backend } = await signedIn();
    const id = store.getState().draftPin({ x: 40, y: 60 });

    store.getState().discardPin(id);

    expect(store.getState().pins[id]).toBeUndefined();
    expect(store.getState().pinSync).toEqual({});
    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("will not discard a pin that has a thread, or one that is saved", async () => {
    const { store } = await signedIn();

    store.getState().discardPin("pin_open");
    expect(store.getState().pins.pin_open).toBeDefined();
  });
});

describe("postComment on a saved pin", () => {
  it("shows the comment at once, attributed to the signed-in user, as sending", async () => {
    const reply = deferred<Response>();
    const { store } = await signedIn({ "POST /pins/:id/comments": () => reply.promise });

    const pending = store.getState().postComment("pin_open", "  Can we cut three more?  ");

    const thread = store.getState().pins.pin_open!.comments;
    expect(thread.map((c) => c.body)).toEqual(["Carried the drop.", "Shooting Thursday.", "Can we cut three more?"]);
    const mine = thread.at(-1)!;
    expect(mine.author).toMatchObject({ id: "usr_ada", name: "Ada" });
    expect(store.getState().commentSync[mine.id]).toBe("sending");
    reply.resolve(json(201, comment("c_new", "Can we cut three more?", ADA)));
    await pending;
  });

  it("posts the trimmed text, and swaps the comment for the server's in the same place", async () => {
    const { store, backend } = await signedIn({
      "POST /pins/:id/comments": () => json(201, comment("c_new", "Can we cut three more?", ADA)),
    });

    const posted = await store.getState().postComment("pin_open", "  Can we cut three more? ");

    expect(backend.callsTo("POST /pins/pin_open/comments")[0]!.body).toEqual({ body: "Can we cut three more?" });
    expect(posted!.id).toBe("c_new");
    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_1", "c_2", "c_new"]);
    expect(store.getState().commentSync).toEqual({});
  });

  it("ignores text that is only whitespace, and sends nothing", async () => {
    const { store, backend } = await signedIn();

    expect(await store.getState().postComment("pin_open", "  \n ")).toBeNull();

    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(store.getState().pins.pin_open!.comments).toHaveLength(2);
  });

  it("keeps the comment in the thread, marked failed, when the API refuses, and rejects", async () => {
    const { store } = await signedIn({ "POST /pins/:id/comments": () => apiError(503, "forced_failure") });

    await expect(store.getState().postComment("pin_open", "Hello")).rejects.toMatchObject({ status: 503 });

    const mine = store.getState().pins.pin_open!.comments.at(-1)!;
    expect(mine.body).toBe("Hello");
    expect(store.getState().commentSync[mine.id]).toBe("failed");
  });

  it("sends a failed comment again on retry, and only then replaces it", async () => {
    let attempts = 0;
    const { store, backend } = await signedIn({
      "POST /pins/:id/comments": () => (++attempts === 1 ? apiError(503, "forced_failure") : json(201, comment("c_new", "Hello", ADA))),
    });
    await store.getState().postComment("pin_open", "Hello").catch(() => {});
    const failedId = store.getState().pins.pin_open!.comments.at(-1)!.id;

    const sent = await store.getState().retryComment("pin_open", failedId);

    expect(backend.callsTo("POST /pins/pin_open/comments").map((c) => c.body)).toEqual([{ body: "Hello" }, { body: "Hello" }]);
    expect(sent.id).toBe("c_new");
    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_1", "c_2", "c_new"]);
    expect(store.getState().commentSync).toEqual({});
  });

  it("drops the pin, and rejects with pin_not_found, when the API says the pin is gone", async () => {
    const { store } = await signedIn({ "POST /pins/:id/comments": () => apiError(404, "pin_not_found") });

    await expect(store.getState().postComment("pin_open", "Hello")).rejects.toMatchObject({ code: "pin_not_found" });

    expect(store.getState().pins.pin_open).toBeUndefined();
    expect(store.getState().pins.pin_done).toBeDefined();
  });
});

describe("postComment on a draft pin", () => {
  it("makes the pin first, then posts the comment to it, and swaps both for the server's", async () => {
    const { store, backend } = await signedIn({
      "POST /pins": () => json(201, pin("pin_new", { x: 40, y: 60 })),
      "POST /pins/:id/comments": () => json(201, comment("c_new", "First!", ADA)),
    });
    const draft = store.getState().draftPin({ x: 40, y: 60 });

    const posted = await store.getState().postComment(draft, "First!");

    expect(backend.callsTo("POST /pins")[0]!.body).toEqual({ x: 40, y: 60 });
    expect(backend.callsTo("POST /pins/pin_new/comments")[0]!.body).toEqual({ body: "First!" });
    expect(posted!.id).toBe("c_new");
    expect(store.getState().pins[draft]).toBeUndefined();
    expect(store.getState().pins.pin_new!.comments.map((c) => c.id)).toEqual(["c_new"]);
    expect(idsOf(store.getState().pins)).toEqual(["pin_open", "pin_done", "pin_new"]);
    expect(store.getState().pinSync).toEqual({});
    expect(store.getState().pinAlias[draft]).toBe("pin_new");
  });

  it("keeps the pin and the comment on screen, both marked failed, when the pin cannot be made", async () => {
    const { store, backend } = await signedIn({ "POST /pins": () => apiError(503, "forced_failure") });
    const draft = store.getState().draftPin({ x: 40, y: 60 });

    await expect(store.getState().postComment(draft, "First!")).rejects.toMatchObject({ status: 503 });

    expect(store.getState().pins[draft]!.comments.map((c) => c.body)).toEqual(["First!"]);
    expect(store.getState().pinSync[draft]).toBe("failed");
    const cid = store.getState().pins[draft]!.comments[0]!.id;
    expect(store.getState().commentSync[cid]).toBe("failed");
    expect(backend.callsTo("POST /pins/pin_new/comments")).toHaveLength(0);
  });

  it("retries the pin and then the comment", async () => {
    let attempts = 0;
    const { store } = await signedIn({
      "POST /pins": () => (++attempts === 1 ? apiError(503, "forced_failure") : json(201, pin("pin_new", { x: 40, y: 60 }))),
      "POST /pins/:id/comments": () => json(201, comment("c_new", "First!", ADA)),
    });
    const draft = store.getState().draftPin({ x: 40, y: 60 });
    await store.getState().postComment(draft, "First!").catch(() => {});
    const cid = store.getState().pins[draft]!.comments[0]!.id;

    await store.getState().retryComment(draft, cid);

    expect(store.getState().pins.pin_new!.comments.map((c) => c.id)).toEqual(["c_new"]);
    expect(store.getState().pins[draft]).toBeUndefined();
  });

  it("keeps the pin, saved, when only the comment fails, so a retry posts just the comment", async () => {
    let attempts = 0;
    const { store, backend } = await signedIn({
      "POST /pins": () => json(201, pin("pin_new", { x: 40, y: 60 })),
      "POST /pins/:id/comments": () => (++attempts === 1 ? apiError(503, "forced_failure") : json(201, comment("c_new", "First!", ADA))),
    });
    const draft = store.getState().draftPin({ x: 40, y: 60 });
    await store.getState().postComment(draft, "First!").catch(() => {});
    expect(store.getState().pins.pin_new).toBeDefined();
    const cid = store.getState().pins.pin_new!.comments[0]!.id;

    await store.getState().retryComment("pin_new", cid);

    expect(backend.callsTo("POST /pins")).toHaveLength(1);
    expect(store.getState().pins.pin_new!.comments.map((c) => c.id)).toEqual(["c_new"]);
  });
});

describe("setResolved", () => {
  it("flips the pin at once and patches it", async () => {
    const reply = deferred<Response>();
    const { store, backend } = await signedIn({ "PATCH /pins/:id": () => reply.promise });

    const pending = store.getState().setResolved("pin_open", true);

    expect(store.getState().pins.pin_open!.resolved).toBe(true);
    reply.resolve(json(200, { ...OPEN, resolved: true }));
    await pending;
    expect(backend.callsTo("PATCH /pins/pin_open")[0]!.body).toEqual({ resolved: true });
  });

  it("reopens a resolved pin", async () => {
    const { store, backend } = await signedIn({ "PATCH /pins/:id": () => json(200, { ...DONE, resolved: false }) });

    await store.getState().setResolved("pin_done", false);

    expect(backend.callsTo("PATCH /pins/pin_done")[0]!.body).toEqual({ resolved: false });
    expect(store.getState().pins.pin_done!.resolved).toBe(false);
  });

  it("puts the thread back to open, and rejects, when the API refuses", async () => {
    const { store } = await signedIn({ "PATCH /pins/:id": () => apiError(503, "forced_failure") });

    await expect(store.getState().setResolved("pin_open", true)).rejects.toMatchObject({ status: 503 });

    expect(store.getState().pins.pin_open!.resolved).toBe(false);
  });

  it("drops the pin, and rejects with pin_not_found, when it is gone", async () => {
    const { store } = await signedIn({ "PATCH /pins/:id": () => apiError(404, "pin_not_found") });

    await expect(store.getState().setResolved("pin_open", true)).rejects.toMatchObject({ code: "pin_not_found" });

    expect(store.getState().pins.pin_open).toBeUndefined();
  });

  it("refuses to resolve a thread with nothing in it", async () => {
    const { store, backend } = await signedIn();
    const id = store.getState().draftPin({ x: 1, y: 1 });

    await expect(store.getState().setResolved(id, true)).rejects.toBeTruthy();

    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("deletePin", () => {
  it("removes the pin, with its thread, at once, and asks the API to delete it", async () => {
    const { store, backend } = await signedIn({ "DELETE /pins/:id": () => json(204) });

    await store.getState().deletePin("pin_open");

    expect(idsOf(store.getState().pins)).toEqual(["pin_done"]);
    expect(backend.callsTo("DELETE /pins/pin_open")).toHaveLength(1);
  });

  it("brings the pin back, thread and all, where it was, and rejects, when the API refuses", async () => {
    const { store } = await signedIn({ "DELETE /pins/:id": () => apiError(503, "forced_failure") });

    await expect(store.getState().deletePin("pin_open")).rejects.toMatchObject({ status: 503 });

    expect(idsOf(store.getState().pins)).toEqual(["pin_open", "pin_done"]);
    expect(store.getState().pins.pin_open!.comments).toHaveLength(2);
  });

  it("takes a pin already gone on the server as deleted", async () => {
    const { store } = await signedIn({ "DELETE /pins/:id": () => apiError(404, "pin_not_found") });

    await store.getState().deletePin("pin_open");

    expect(store.getState().pins.pin_open).toBeUndefined();
  });

  it("removes a draft without a request", async () => {
    const { store, backend } = await signedIn();
    const id = store.getState().draftPin({ x: 1, y: 1 });

    await store.getState().deletePin(id);

    expect(store.getState().pins[id]).toBeUndefined();
    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("deleteComment", () => {
  it("removes the comment at once, whoever wrote it, and asks the API to delete it", async () => {
    const { store, backend } = await signedIn({ "DELETE /comments/:id": () => json(204) });

    await store.getState().deleteComment("pin_open", "c_2");

    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_1"]);
    expect(backend.callsTo("DELETE /comments/c_2")).toHaveLength(1);
  });

  it("puts it back in place, and rejects, when the API refuses", async () => {
    const { store } = await signedIn({ "DELETE /comments/:id": () => apiError(503, "forced_failure") });

    await expect(store.getState().deleteComment("pin_open", "c_1")).rejects.toMatchObject({ status: 503 });

    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_1", "c_2"]);
  });

  it("takes a comment already gone as deleted", async () => {
    const { store } = await signedIn({ "DELETE /comments/:id": () => apiError(404, "comment_not_found") });

    await store.getState().deleteComment("pin_open", "c_1");

    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_2"]);
  });

  it("removes an unsent comment without a request", async () => {
    const { store, backend } = await signedIn({ "POST /pins/:id/comments": () => apiError(503, "forced_failure") });
    await store.getState().postComment("pin_open", "Hello").catch(() => {});
    const failedId = store.getState().pins.pin_open!.comments.at(-1)!.id;

    await store.getState().deleteComment("pin_open", failedId);

    expect(store.getState().pins.pin_open!.comments.map((c) => c.id)).toEqual(["c_1", "c_2"]);
    expect(store.getState().commentSync).toEqual({});
    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("dropping the board", () => {
  it("forgets drafts, unsent comments and aliases", async () => {
    const { store } = await signedIn();
    store.getState().draftPin({ x: 1, y: 1 });

    store.getState().resetBoard();

    expect(store.getState().pins).toEqual({});
    expect(store.getState().pinSync).toEqual({});
    expect(store.getState().commentSync).toEqual({});
    expect(store.getState().pinAlias).toEqual({});
  });
});
