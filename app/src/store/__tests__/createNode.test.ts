import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { CanvasNode } from "../../types";
import { loadedStore, seededRoutes } from "./fakeBackend";

const T = "2026-09-02T00:00:00.000Z";
const created: CanvasNode = {
  id: "nd_new",
  type: "note",
  title: "Untitled",
  body: "",
  fileIds: [],
  x: 40,
  y: 60,
  createdAt: T,
  updatedAt: T,
};

describe("createNode", () => {
  it("posts the node and caches what the server returned", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "POST /nodes": () => json(201, created) });

    const node = await store.getState().createNode({ type: "note", x: 40, y: 60 });

    expect(backend.callsTo("POST /nodes")[0]!.body).toEqual({ type: "note", x: 40, y: 60 });
    expect(node).toEqual(created);
    expect(store.getState().nodes.nd_new).toEqual(created);
  });

  it("leaves nothing behind when the server refuses", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "POST /nodes": () => apiError(503, "forced_failure") });
    const before = store.getState().nodes;

    await expect(store.getState().createNode({ type: "note", x: 0, y: 0 })).rejects.toMatchObject({ status: 503 });

    expect(store.getState().nodes).toEqual(before);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("can be undone, which deletes the node again", async () => {
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "POST /nodes": () => json(201, created),
      "DELETE /nodes/:id": () => json(204),
    });
    await store.getState().createNode({ type: "note", x: 40, y: 60 });

    await store.getState().undo();

    expect(backend.callsTo("DELETE /nodes/nd_new")).toHaveLength(1);
    expect(store.getState().nodes.nd_new).toBeUndefined();
  });
});
