import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { Stroke, StrokeInput } from "../../types";
import { deferred, fixtures, loadedStore, seededRoutes } from "./fakeBackend";

const T = "2026-09-02T00:00:00.000Z";
const input: StrokeInput = { tool: "pen", color: "var(--ink-1)", width: 3, points: [10, 10, 20, 24] };
const saved = (id: string, extra: Partial<Stroke> = {}): Stroke => ({ id, ...input, createdAt: T, ...extra });

/** The fixture board has one stroke, st_1, already saved. */
const base = (extra: Record<string, import("./fakeBackend").Handler> = {}) => ({ ...seededRoutes(), ...extra });

describe("createStroke", () => {
  it("shows the stroke at once, as saving, before the API has answered", async () => {
    const reply = deferred<Response>();
    const { store } = await loadedStore(base({ "POST /strokes": () => reply.promise }));

    const pending = store.getState().createStroke(input);

    const [tempId] = Object.keys(store.getState().strokes).filter((id) => id !== "st_1");
    expect(tempId).toBeTruthy();
    expect(store.getState().strokes[tempId!]).toMatchObject(input);
    expect(store.getState().strokeSync[tempId!]).toBe("saving");

    reply.resolve(json(201, saved("stk_new")));
    await pending;
  });

  it("posts exactly what was drawn, and nothing about the temporary id", async () => {
    const { store, backend } = await loadedStore(base({ "POST /strokes": () => json(201, saved("stk_new")) }));

    await store.getState().createStroke(input);

    expect(backend.callsTo("POST /strokes")).toHaveLength(1);
    expect(backend.callsTo("POST /strokes")[0]!.body).toEqual(input);
  });

  it("swaps the temporary stroke for the server's, in the same place, and clears its sync mark", async () => {
    const { store } = await loadedStore(base({ "POST /strokes": () => json(201, saved("stk_new")) }));

    const stroke = await store.getState().createStroke(input);

    expect(stroke.id).toBe("stk_new");
    expect(Object.keys(store.getState().strokes)).toEqual(["st_1", "stk_new"]);
    expect(store.getState().strokes.stk_new).toEqual(saved("stk_new"));
    expect(store.getState().strokeSync).toEqual({});
  });

  it("keeps the stroke on screen, marked failed, when the API refuses, and rejects", async () => {
    const { store } = await loadedStore(base({ "POST /strokes": () => apiError(503, "forced_failure") }));

    await expect(store.getState().createStroke(input)).rejects.toMatchObject({ status: 503 });

    const [failedId] = Object.keys(store.getState().strokes).filter((id) => id !== "st_1");
    expect(store.getState().strokes[failedId!]).toMatchObject(input);
    expect(store.getState().strokeSync[failedId!]).toBe("failed");
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("is sent again by retryStroke, and only then replaced", async () => {
    let attempts = 0;
    const { store, backend } = await loadedStore(
      base({ "POST /strokes": () => (++attempts === 1 ? apiError(503, "forced_failure") : json(201, saved("stk_new"))) }),
    );
    await store.getState().createStroke(input).catch(() => {});
    const [failedId] = Object.keys(store.getState().strokes).filter((id) => id !== "st_1");

    const stroke = await store.getState().retryStroke(failedId!);

    expect(backend.callsTo("POST /strokes").map((c) => c.body)).toEqual([input, input]);
    expect(stroke.id).toBe("stk_new");
    expect(Object.keys(store.getState().strokes)).toEqual(["st_1", "stk_new"]);
    expect(store.getState().strokeSync).toEqual({});
  });

  it("can be undone, which deletes it again", async () => {
    const { store, backend } = await loadedStore(
      base({ "POST /strokes": () => json(201, saved("stk_new")), "DELETE /strokes/:id": () => json(204) }),
    );
    await store.getState().createStroke(input);

    await store.getState().undo();

    expect(backend.callsTo("DELETE /strokes/stk_new")).toHaveLength(1);
    expect(store.getState().strokes.stk_new).toBeUndefined();
  });
});

describe("deleteStrokes", () => {
  it("removes the strokes at once and asks the API to delete each", async () => {
    const reply = deferred<Response>();
    const { store, backend } = await loadedStore(
      base({
        "GET /strokes": () => json(200, [saved("a"), saved("b"), saved("c")]),
        "DELETE /strokes/:id": () => reply.promise,
      }),
    );

    const pending = store.getState().deleteStrokes(["a", "c"]);

    expect(Object.keys(store.getState().strokes)).toEqual(["b"]);
    reply.resolve(json(204));
    await pending;
    expect(backend.callsTo("DELETE /strokes/a")).toHaveLength(1);
    expect(backend.callsTo("DELETE /strokes/c")).toHaveLength(1);
    expect(backend.callsTo("DELETE /strokes/b")).toHaveLength(0);
  });

  it("puts a stroke back where it was, and rejects, when the API refuses", async () => {
    const { store } = await loadedStore(
      base({
        "GET /strokes": () => json(200, [saved("a"), saved("b"), saved("c")]),
        "DELETE /strokes/:id": () => apiError(503, "forced_failure"),
      }),
    );

    await expect(store.getState().deleteStrokes(["b"])).rejects.toMatchObject({ status: 503 });

    expect(Object.keys(store.getState().strokes)).toEqual(["a", "b", "c"]);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("takes a stroke that is already gone on the server as deleted", async () => {
    const { store } = await loadedStore(
      base({ "DELETE /strokes/:id": () => apiError(404, "stroke_not_found") }),
    );

    await store.getState().deleteStrokes(["st_1"]);

    expect(store.getState().strokes.st_1).toBeUndefined();
  });

  it("deletes a stroke that never reached the API without asking it anything", async () => {
    const { store, backend } = await loadedStore(base({ "POST /strokes": () => apiError(503, "forced_failure") }));
    await store.getState().createStroke(input).catch(() => {});
    const [failedId] = Object.keys(store.getState().strokes).filter((id) => id !== "st_1");

    await store.getState().deleteStrokes([failedId!]);

    expect(store.getState().strokes[failedId!]).toBeUndefined();
    expect(store.getState().strokeSync).toEqual({});
    expect(backend.callsTo("DELETE /strokes/st_1")).toHaveLength(0);
    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });

  it("is one undo step for the lot, which draws them all again", async () => {
    let n = 0;
    const { store, backend } = await loadedStore(
      base({
        "GET /strokes": () => json(200, [saved("a"), saved("b")]),
        "DELETE /strokes/:id": () => json(204),
        "POST /strokes": () => json(201, saved(`re_${++n}`)),
      }),
    );
    await store.getState().deleteStrokes(["a", "b"]);
    expect(store.getState().undoStack).toHaveLength(1);

    await store.getState().undo();

    expect(backend.callsTo("POST /strokes")).toHaveLength(2);
    expect(Object.keys(store.getState().strokes).sort()).toEqual(["re_1", "re_2"]);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("does nothing, and records nothing, for strokes that are not there", async () => {
    const { store, backend } = await loadedStore(base());

    await store.getState().deleteStrokes(["nope"]);

    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });
});

describe("clearStrokes", () => {
  it("removes every stroke at once, with one request", async () => {
    const { store, backend } = await loadedStore(
      base({ "GET /strokes": () => json(200, [saved("a"), saved("b"), saved("c")]), "DELETE /strokes": () => json(204) }),
    );

    await store.getState().clearStrokes();

    expect(store.getState().strokes).toEqual({});
    expect(backend.callsTo("DELETE /strokes")).toHaveLength(1);
    expect(backend.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("brings the ink back, in order, and rejects, when the API refuses", async () => {
    const { store } = await loadedStore(
      base({
        "GET /strokes": () => json(200, [saved("a"), saved("b")]),
        "DELETE /strokes": () => apiError(503, "forced_failure"),
      }),
    );

    await expect(store.getState().clearStrokes()).rejects.toMatchObject({ status: 503 });

    expect(Object.keys(store.getState().strokes)).toEqual(["a", "b"]);
  });

  it("takes ink that was never saved away with the rest", async () => {
    const { store } = await loadedStore(
      base({ "POST /strokes": () => apiError(503, "forced_failure"), "DELETE /strokes": () => json(204) }),
    );
    await store.getState().createStroke(input).catch(() => {});

    await store.getState().clearStrokes();

    expect(store.getState().strokes).toEqual({});
    expect(store.getState().strokeSync).toEqual({});
  });
});

describe("loading a board", () => {
  it("fills the strokes from the API in order and starts with nothing unsaved", async () => {
    const { store } = await loadedStore(base());

    expect(store.getState().strokes).toEqual({ st_1: fixtures.strokes[0] });
    expect(store.getState().strokeSync).toEqual({});
  });

  it("forgets unsaved ink when the board is dropped", async () => {
    const { store } = await loadedStore(base({ "POST /strokes": () => apiError(503, "forced_failure") }));
    await store.getState().createStroke(input).catch(() => {});

    store.getState().resetBoard();

    expect(store.getState().strokes).toEqual({});
    expect(store.getState().strokeSync).toEqual({});
  });
});
