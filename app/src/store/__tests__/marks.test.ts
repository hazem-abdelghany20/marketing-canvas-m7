import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { Mark } from "../../types";
import { deferred, fixtures, loadedStore, seededRoutes, type Handler } from "./fakeBackend";

const T = "2026-09-02T00:00:00.000Z";
const saved = (id: string, extra: Partial<Mark> = {}): Mark => ({
  id,
  variant: "sticky",
  x: 40,
  y: 60,
  body: "Reshoot the hook",
  color: null,
  createdAt: T,
  updatedAt: T,
  ...extra,
});

/** The fixture board has one mark, mk_1 ("hi" at 1,2). */
const base = (extra: Record<string, Handler> = {}) => ({ ...seededRoutes(), ...extra });
const others = (marks: Record<string, Mark>) => Object.keys(marks).filter((id) => id !== "mk_1");

describe("draftMark", () => {
  it("puts a mark on the board at once, under a temporary id, without any request", async () => {
    const { store, backend } = await loadedStore(base());

    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });

    expect(store.getState().marks[id]).toMatchObject({ variant: "sticky", x: 40, y: 60, body: "", color: null });
    expect(store.getState().markSync[id]).toBe("draft");
    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });
});

describe("commitMark on a draft", () => {
  it("discards a draft with no text, and sends nothing", async () => {
    const { store, backend } = await loadedStore(base());
    const id = store.getState().draftMark({ variant: "sticky", x: 1, y: 1 });

    const result = await store.getState().commitMark(id, "");

    expect(result).toBeNull();
    expect(store.getState().marks[id]).toBeUndefined();
    expect(store.getState().markSync).toEqual({});
    expect(backend.callsTo("POST /marks")).toHaveLength(0);
  });

  it("treats whitespace as no text", async () => {
    const { store, backend } = await loadedStore(base());
    const id = store.getState().draftMark({ variant: "text", x: 1, y: 1 });

    await store.getState().commitMark(id, "  \n ");

    expect(store.getState().marks[id]).toBeUndefined();
    expect(backend.callsTo("POST /marks")).toHaveLength(0);
  });

  it("posts a draft that has text, and shows it as saving while the API thinks", async () => {
    const reply = deferred<Response>();
    const { store, backend } = await loadedStore(base({ "POST /marks": () => reply.promise }));
    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });

    const pending = store.getState().commitMark(id, "Reshoot the hook");

    expect(store.getState().marks[id]!.body).toBe("Reshoot the hook");
    expect(store.getState().markSync[id]).toBe("saving");
    reply.resolve(json(201, saved("mk_new")));
    await pending;
    expect(backend.callsTo("POST /marks")[0]!.body).toEqual({ variant: "sticky", x: 40, y: 60, body: "Reshoot the hook" });
  });

  it("swaps the draft for the server's mark in the same place and clears its sync mark", async () => {
    const { store } = await loadedStore(base({ "POST /marks": () => json(201, saved("mk_new")) }));
    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });

    const mark = await store.getState().commitMark(id, "Reshoot the hook");

    expect(mark!.id).toBe("mk_new");
    expect(Object.keys(store.getState().marks)).toEqual(["mk_1", "mk_new"]);
    expect(store.getState().markSync).toEqual({});
  });

  it("keeps the text on screen, marked failed, when the API refuses, and rejects", async () => {
    const { store } = await loadedStore(base({ "POST /marks": () => apiError(503, "forced_failure") }));
    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });

    await expect(store.getState().commitMark(id, "Reshoot the hook")).rejects.toMatchObject({ status: 503 });

    expect(store.getState().marks[id]!.body).toBe("Reshoot the hook");
    expect(store.getState().markSync[id]).toBe("failed");
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("sends the same mark again on retry, and only then replaces it", async () => {
    let attempts = 0;
    const { store, backend } = await loadedStore(
      base({ "POST /marks": () => (++attempts === 1 ? apiError(503, "forced_failure") : json(201, saved("mk_new"))) }),
    );
    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });
    await store.getState().commitMark(id, "Reshoot the hook").catch(() => {});

    const mark = await store.getState().retryMark(id);

    expect(backend.callsTo("POST /marks").map((c) => c.body)).toEqual([
      { variant: "sticky", x: 40, y: 60, body: "Reshoot the hook" },
      { variant: "sticky", x: 40, y: 60, body: "Reshoot the hook" },
    ]);
    expect(mark.id).toBe("mk_new");
    expect(others(store.getState().marks)).toEqual(["mk_new"]);
  });

  it("can be undone, which deletes the mark again", async () => {
    const { store, backend } = await loadedStore(
      base({ "POST /marks": () => json(201, saved("mk_new")), "DELETE /marks/:id": () => json(204) }),
    );
    const id = store.getState().draftMark({ variant: "sticky", x: 40, y: 60 });
    await store.getState().commitMark(id, "Reshoot the hook");

    await store.getState().undo();

    expect(backend.callsTo("DELETE /marks/mk_new")).toHaveLength(1);
    expect(store.getState().marks.mk_new).toBeUndefined();
  });
});

describe("commitMark on a saved mark", () => {
  it("patches only the text, and shows it at once", async () => {
    const reply = deferred<Response>();
    const { store, backend } = await loadedStore(base({ "PATCH /marks/:id": () => reply.promise }));

    const pending = store.getState().commitMark("mk_1", "hello");

    expect(store.getState().marks.mk_1!.body).toBe("hello");
    expect(store.getState().markSync.mk_1).toBe("saving");
    reply.resolve(json(200, saved("mk_1", { x: 1, y: 2, body: "hello" })));
    await pending;
    expect(backend.callsTo("PATCH /marks/mk_1")[0]!.body).toEqual({ body: "hello" });
    expect(store.getState().markSync).toEqual({});
  });

  it("sends nothing when the text has not changed", async () => {
    const { store, backend } = await loadedStore(base());

    await store.getState().commitMark("mk_1", "hi");

    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("keeps the new text on screen, marked failed, when the API refuses, and rejects", async () => {
    const { store } = await loadedStore(base({ "PATCH /marks/:id": () => apiError(503, "forced_failure") }));

    await expect(store.getState().commitMark("mk_1", "hello")).rejects.toMatchObject({ status: 503 });

    expect(store.getState().marks.mk_1!.body).toBe("hello");
    expect(store.getState().markSync.mk_1).toBe("failed");
  });

  it("retries a failed edit with what is on screen", async () => {
    let attempts = 0;
    const { store, backend } = await loadedStore(
      base({
        "PATCH /marks/:id": () =>
          ++attempts === 1 ? apiError(503, "forced_failure") : json(200, saved("mk_1", { x: 1, y: 2, body: "hello" })),
      }),
    );
    await store.getState().commitMark("mk_1", "hello").catch(() => {});

    await store.getState().retryMark("mk_1");

    expect(backend.callsTo("PATCH /marks/mk_1")[1]!.body).toMatchObject({ body: "hello", x: 1, y: 2 });
    expect(store.getState().markSync).toEqual({});
  });

  it("deletes a saved mark whose text has been emptied, as an undoable delete", async () => {
    const { store, backend } = await loadedStore(base({ "DELETE /marks/:id": () => json(204) }));

    await store.getState().commitMark("mk_1", "  ");

    expect(backend.callsTo("DELETE /marks/mk_1")).toHaveLength(1);
    expect(store.getState().marks.mk_1).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("can be undone, which puts the old text back", async () => {
    const { store, backend } = await loadedStore(
      base({ "PATCH /marks/:id": (call) => json(200, saved("mk_1", { x: 1, y: 2, ...(call.body as object) })) }),
    );
    await store.getState().commitMark("mk_1", "hello");

    await store.getState().undo();

    expect(backend.callsTo("PATCH /marks/mk_1")[1]!.body).toEqual({ body: "hi" });
    expect(store.getState().marks.mk_1!.body).toBe("hi");
  });
});

describe("moveMark", () => {
  it("moves the mark at once and sends one patch with the final position", async () => {
    const { store, backend } = await loadedStore(
      base({ "PATCH /marks/:id": (call) => json(200, saved("mk_1", { body: "hi", ...(call.body as object) })) }),
    );

    const pending = store.getState().moveMark("mk_1", 120, 80);

    expect(store.getState().marks.mk_1).toMatchObject({ x: 120, y: 80 });
    await pending;
    expect(backend.callsTo("PATCH /marks/mk_1")).toHaveLength(1);
    expect(backend.callsTo("PATCH /marks/mk_1")[0]!.body).toEqual({ x: 120, y: 80 });
  });

  it("leaves the mark where it was dropped, marked failed, when the API refuses", async () => {
    const { store } = await loadedStore(base({ "PATCH /marks/:id": () => apiError(503, "forced_failure") }));

    await expect(store.getState().moveMark("mk_1", 120, 80)).rejects.toMatchObject({ status: 503 });

    expect(store.getState().marks.mk_1).toMatchObject({ x: 120, y: 80 });
    expect(store.getState().markSync.mk_1).toBe("failed");
  });

  it("can be undone, which moves it back", async () => {
    const { store, backend } = await loadedStore(
      base({ "PATCH /marks/:id": (call) => json(200, saved("mk_1", { body: "hi", ...(call.body as object) })) }),
    );
    await store.getState().moveMark("mk_1", 120, 80);

    await store.getState().undo();

    expect(backend.callsTo("PATCH /marks/mk_1")[1]!.body).toEqual({ x: 1, y: 2 });
  });

  it("moves a draft without telling the API anything", async () => {
    const { store, backend } = await loadedStore(base());
    const id = store.getState().draftMark({ variant: "text", x: 1, y: 1 });

    await store.getState().moveMark(id, 50, 60);

    expect(store.getState().marks[id]).toMatchObject({ x: 50, y: 60 });
    expect(backend.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("deleteMark", () => {
  it("removes the mark at once and asks the API to delete it", async () => {
    const reply = deferred<Response>();
    const { store, backend } = await loadedStore(base({ "DELETE /marks/:id": () => reply.promise }));

    const pending = store.getState().deleteMark("mk_1");

    expect(store.getState().marks.mk_1).toBeUndefined();
    reply.resolve(json(204));
    await pending;
    expect(backend.callsTo("DELETE /marks/mk_1")).toHaveLength(1);
  });

  it("brings the mark back, where it was, and rejects, when the API refuses", async () => {
    const { store } = await loadedStore(
      base({
        "GET /marks": () => json(200, [saved("a"), saved("b"), saved("c")]),
        "DELETE /marks/:id": () => apiError(503, "forced_failure"),
      }),
    );

    await expect(store.getState().deleteMark("b")).rejects.toMatchObject({ status: 503 });

    expect(Object.keys(store.getState().marks)).toEqual(["a", "b", "c"]);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("takes a mark already gone on the server as deleted", async () => {
    const { store } = await loadedStore(base({ "DELETE /marks/:id": () => apiError(404, "mark_not_found") }));

    await store.getState().deleteMark("mk_1");

    expect(store.getState().marks.mk_1).toBeUndefined();
  });

  it("can be undone, which writes it out again, new id and all", async () => {
    const { store, backend } = await loadedStore(
      base({ "DELETE /marks/:id": () => json(204), "POST /marks": () => json(201, saved("mk_back", { x: 1, y: 2, body: "hi" })) }),
    );
    await store.getState().deleteMark("mk_1");

    await store.getState().undo();

    expect(backend.callsTo("POST /marks")[0]!.body).toEqual({ variant: "sticky", x: 1, y: 2, body: "hi" });
    expect(Object.keys(store.getState().marks)).toEqual(["mk_back"]);
  });

  it("removes a mark that never reached the API without asking it anything", async () => {
    const { store, backend } = await loadedStore(base({ "POST /marks": () => apiError(503, "forced_failure") }));
    const id = store.getState().draftMark({ variant: "sticky", x: 1, y: 1 });
    await store.getState().commitMark(id, "text").catch(() => {});

    await store.getState().deleteMark(id);

    expect(store.getState().marks[id]).toBeUndefined();
    expect(store.getState().markSync).toEqual({});
    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("loading a board", () => {
  it("fills the marks from the API and starts with nothing unsaved", async () => {
    const { store } = await loadedStore(base());

    expect(store.getState().marks).toEqual({ mk_1: fixtures.marks[0] });
    expect(store.getState().markSync).toEqual({});
  });

  it("forgets drafts when the board is dropped", async () => {
    const { store } = await loadedStore(base());
    store.getState().draftMark({ variant: "sticky", x: 1, y: 1 });

    store.getState().resetBoard();

    expect(store.getState().marks).toEqual({});
    expect(store.getState().markSync).toEqual({});
  });
});
