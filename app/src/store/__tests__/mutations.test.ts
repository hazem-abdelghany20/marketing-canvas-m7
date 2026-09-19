import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { apiError, json } from "../../api/__tests__/helpers";
import { deferred, fixtures, loadedStore, seededRoutes } from "./fakeBackend";

const snapshot = (s: object) => structuredClone(JSON.parse(JSON.stringify(s)));

describe("updateNode", () => {
  it("shows the optimistic change, then holds the server's object once settled", async () => {
    const gate = deferred<Response>();
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": () => gate.promise });
    const server = { ...fixtures.nodes[0]!, title: "600 orders", updatedAt: "2026-09-02T00:00:00.000Z" };

    const pending = store.getState().updateNode("nd_goal", { title: "  600 orders  " });
    expect(store.getState().nodes.nd_goal?.title).toBe("  600 orders  ");

    gate.resolve(json(200, server));
    await expect(pending).resolves.toEqual(server);
    expect(store.getState().nodes.nd_goal).toEqual(server);
    expect(backend.callsTo("PATCH /nodes/nd_goal")[0]?.body).toEqual({ title: "  600 orders  " });
  });

  it("leaves the cache exactly as it was and rejects with the ApiError on failure", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": () => apiError(503, "forced_failure", "Down.") });
    const before = snapshot(store.getState());

    const error = await store.getState().updateNode("nd_goal", { title: "nope" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("forced_failure");
    expect(snapshot(store.getState())).toEqual(before);
  });

  it("rolls back only its own node when another mutation lands meanwhile", async () => {
    const failing = deferred<Response>();
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": (_c, p) =>
        p.id === "nd_goal" ? failing.promise : json(200, { ...fixtures.nodes[2]!, title: "Reel v2" }),
    });

    const doomed = store.getState().updateNode("nd_goal", { title: "x" }).catch(() => {});
    await store.getState().updateNode("nd_reel", { title: "Reel v2" });
    failing.resolve(apiError(500, "server_error"));
    await doomed;

    expect(store.getState().nodes.nd_goal?.title).toBe("500 orders");
    expect(store.getState().nodes.nd_reel?.title).toBe("Reel v2");
  });
});

describe("deleteNode", () => {
  it("removes the node with its edges and annotations, as the API cascades", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "DELETE /nodes/:id": () => json(204) });

    await store.getState().deleteNode("nd_camp");

    const s = store.getState();
    expect(s.nodes.nd_camp).toBeUndefined();
    expect(Object.keys(s.edges)).toEqual([]);
    expect(Object.keys(s.annotations)).toEqual([]);
    expect(backend.callsTo("DELETE /nodes/nd_camp")).toHaveLength(1);
  });

  it("restores everything it removed when the delete fails", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "DELETE /nodes/:id": () => apiError(503, "forced_failure") });
    const before = snapshot(store.getState());

    await expect(store.getState().deleteNode("nd_camp")).rejects.toBeInstanceOf(ApiError);

    expect(snapshot(store.getState())).toEqual(before);
  });
});

describe("deleteEdge", () => {
  it("removes the edge, or restores it when the API refuses", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "DELETE /edges/:id": () => json(204) });
    await store.getState().deleteEdge("ed_1");
    expect(store.getState().edges.ed_1).toBeUndefined();

    backend.on("DELETE /edges/:id", () => apiError(404, "edge_not_found"));
    await expect(store.getState().deleteEdge("ed_2")).rejects.toMatchObject({ code: "edge_not_found" });
    expect(store.getState().edges.ed_2).toEqual(fixtures.edges[1]);
  });
});

describe("renameBoard", () => {
  it("reconciles to the server's board", async () => {
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /board": () => json(200, { ...fixtures.board, name: "Q4 planning" }),
    });

    await store.getState().renameBoard("Q4 planning ");

    expect(store.getState().board?.name).toBe("Q4 planning");
  });
});
