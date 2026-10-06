import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { CanvasNode, Edge } from "../../types";
import { loadedStore, seededRoutes } from "./fakeBackend";

const T = "2026-09-02T00:00:00.000Z";
const created: CanvasNode = {
  id: "nd_new",
  type: "strategy",
  title: "Untitled",
  body: "",
  fileIds: [],
  x: 0,
  y: 220,
  createdAt: T,
  updatedAt: T,
};
const joined: Edge = { id: "ed_new", fromId: "nd_new", toId: "nd_goal", kind: "serves", label: null };

const routes = () => ({
  ...seededRoutes(),
  "POST /nodes": () => json(201, created),
  "POST /edges": () => json(201, joined),
  "DELETE /nodes/:id": () => json(204),
});

describe("createServingNode", () => {
  it("makes the node, then the edge that has it serve the one it was made under", async () => {
    const { store, backend } = await loadedStore(routes());

    const result = await store.getState().createServingNode({ type: "strategy", x: 0, y: 220 }, "nd_goal");

    expect(backend.callsTo("POST /nodes")[0]!.body).toEqual({ type: "strategy", x: 0, y: 220 });
    expect(backend.callsTo("POST /edges")[0]!.body).toEqual({ fromId: "nd_new", toId: "nd_goal", kind: "serves" });
    expect(result).toEqual({ node: created, edge: joined, edgeError: null });
    expect(store.getState().nodes.nd_new).toEqual(created);
    expect(store.getState().edges.ed_new).toEqual(joined);
  });

  it("is one step to undo, and undoing it takes the node, with its edge, and leaves nothing to undo twice", async () => {
    const { store, backend } = await loadedStore(routes());
    await store.getState().createServingNode({ type: "strategy", x: 0, y: 220 }, "nd_goal");
    expect(store.getState().undoStack).toHaveLength(1);

    await store.getState().undo();

    expect(backend.callsTo("DELETE /nodes/nd_new")).toHaveLength(1);
    expect(backend.callsTo("DELETE /edges/ed_new")).toHaveLength(0); // the server drops the edge with the node
    expect(store.getState().nodes.nd_new).toBeUndefined();
    expect(store.getState().edges.ed_new).toBeUndefined();
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("leaves nothing behind, and nothing to undo, when the node is refused", async () => {
    const { store, backend } = await loadedStore({ ...routes(), "POST /nodes": () => apiError(503, "forced_failure") });

    await expect(store.getState().createServingNode({ type: "strategy", x: 0, y: 220 }, "nd_goal")).rejects.toMatchObject({
      status: 503,
    });

    expect(backend.callsTo("POST /edges")).toHaveLength(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("keeps the node, and says only the connection failed, when the edge is refused", async () => {
    const { store } = await loadedStore({ ...routes(), "POST /edges": () => apiError(503, "forced_failure") });

    const result = await store.getState().createServingNode({ type: "strategy", x: 0, y: 220 }, "nd_goal");

    expect(result.node).toEqual(created);
    expect(result.edge).toBeNull();
    expect(result.edgeError).toMatchObject({ status: 503 });
    expect(store.getState().nodes.nd_new).toEqual(created);
    expect(Object.values(store.getState().edges).some((e) => e.fromId === "nd_new")).toBe(false);
    // The node is still undoable on its own.
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
