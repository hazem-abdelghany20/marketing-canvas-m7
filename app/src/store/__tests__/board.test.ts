import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { apiError, json } from "../../api/__tests__/helpers";
import { deferred, fixtures, makeStore, seededRoutes } from "./fakeBackend";

describe("loadBoard", () => {
  it("populates the board and every collection, annotations included", async () => {
    const { store } = makeStore();

    await store.getState().loadBoard();

    const s = store.getState();
    expect(s.boardStatus).toBe("ready");
    expect(s.board).toEqual(fixtures.board);
    expect(s.board?.viewport).toEqual({ x: 10, y: 20, zoom: 1 });
    expect(Object.keys(s.nodes)).toEqual(["nd_goal", "nd_camp", "nd_reel"]);
    expect(Object.keys(s.edges)).toEqual(["ed_1", "ed_2"]);
    expect(Object.keys(s.annotations)).toEqual(["an_1"]);
    expect(Object.keys(s.files)).toEqual(["fl_1"]);
    expect(Object.keys(s.strokes)).toEqual(["st_1"]);
    expect(Object.keys(s.marks)).toEqual(["mk_1"]);
    expect(Object.keys(s.pins)).toEqual(["pn_1"]);
  });

  it("reports loading while the requests are in flight", async () => {
    const gate = deferred<Response>();
    const { store } = makeStore({ ...seededRoutes(), "GET /board": () => gate.promise });

    const load = store.getState().loadBoard();
    expect(store.getState().boardStatus).toBe("loading");

    gate.resolve(json(200, fixtures.board));
    await load;
    expect(store.getState().boardStatus).toBe("ready");
  });

  it("records an ApiError and leaves the cache empty when any part fails", async () => {
    const { store } = makeStore({ ...seededRoutes(), "GET /edges": () => apiError(503, "forced_failure") });

    await store.getState().loadBoard();

    const s = store.getState();
    expect(s.boardStatus).toBe("error");
    expect(s.boardError).toBeInstanceOf(ApiError);
    expect(s.boardError?.code).toBe("forced_failure");
    expect(s.nodes).toEqual({});
  });

  it("lets the newest load win when two overlap", async () => {
    const slow = deferred<Response>();
    let calls = 0;
    const { store } = makeStore({
      ...seededRoutes(),
      "GET /board": () => (++calls === 1 ? slow.promise : json(200, { ...fixtures.board, name: "fresh" })),
    });

    const first = store.getState().loadBoard();
    await store.getState().loadBoard();
    slow.resolve(json(200, { ...fixtures.board, name: "stale" }));
    await first;

    expect(store.getState().board?.name).toBe("fresh");
  });
});
