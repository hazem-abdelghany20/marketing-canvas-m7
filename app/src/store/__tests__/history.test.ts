import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { RecordedCall } from "../../api/__tests__/helpers";
import type { Annotation, CanvasNode, Edge, NodePatch } from "../../types";
import { fixtures, loadedStore, seededRoutes, type Handler } from "./fakeBackend";

/** A PATCH /nodes handler that behaves like the server: merge and echo. */
function echoPatch(nodes: Record<string, CanvasNode>): Handler {
  return (call: RecordedCall, p) => {
    const current = nodes[p.id!];
    if (!current) return apiError(404, "node_not_found");
    const next = { ...current, ...(call.body as NodePatch) };
    nodes[p.id!] = next;
    return json(200, next);
  };
}

function serverNodes(): Record<string, CanvasNode> {
  return Object.fromEntries(fixtures.nodes.map((n) => [n.id, { ...n }]));
}

describe("undo", () => {
  it("is empty until a mutation succeeds, and a failed mutation adds nothing", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": () => apiError(500, "server_error") });
    expect(store.getState().undoStack).toHaveLength(0);

    await store.getState().updateNode("nd_goal", { title: "x" }).catch(() => {});
    expect(store.getState().undoStack).toHaveLength(0);

    backend.on("PATCH /nodes/:id", echoPatch(serverNodes()));
    await store.getState().updateNode("nd_goal", { title: "x" });
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("restores the prior fields of an update, through the API", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });

    await store.getState().updateNode("nd_goal", { title: "600 orders", x: 50 });
    await store.getState().undo();

    expect(store.getState().nodes.nd_goal).toMatchObject({ title: "500 orders", x: 0 });
    expect(backend.callsTo("PATCH /nodes/nd_goal").at(-1)?.body).toEqual({ title: "500 orders", x: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("brings a deleted node back with its edges and annotations", async () => {
    let seq = 0;
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "DELETE /nodes/:id": () => json(204),
      "POST /nodes": (c) => json(201, { ...(c.body as object), id: `nd_new${++seq}`, createdAt: "t", updatedAt: "t" }),
      "POST /edges": (c) => json(201, { label: null, ...(c.body as object), id: `ed_new${++seq}` }),
      "POST /nodes/:id/annotations": (c, p) =>
        json(201, { ...(c.body as object), id: `an_new${++seq}`, nodeId: p.id, createdAt: "t" }),
    });

    await store.getState().deleteNode("nd_camp");
    await store.getState().undo();

    const s = store.getState();
    const restored = Object.values(s.nodes).find((n) => n.title === "Ramadan push");
    expect(restored).toMatchObject({ type: "campaign", body: "b", fileIds: ["fl_1"], x: 100, y: 0 });
    expect(backend.callsTo("POST /nodes")[0]?.body).toEqual({
      type: "campaign", title: "Ramadan push", body: "b", fileIds: ["fl_1"], x: 100, y: 0,
    });
    const edges = Object.values(s.edges) as Edge[];
    expect(edges.map((e) => [e.fromId, e.toId, e.kind, e.label])).toEqual([
      [restored!.id, "nd_goal", "serves", null],
      ["nd_reel", restored!.id, "serves", "hook"],
    ]);
    const annotations = Object.values(s.annotations) as Annotation[];
    expect(annotations).toEqual([expect.objectContaining({ nodeId: restored!.id, body: "Check stock" })]);
  });

  it("follows a re-created node's new id when undoing further back", async () => {
    const nodes = serverNodes();
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": echoPatch(nodes),
      "DELETE /nodes/:id": (_c, p) => (delete nodes[p.id!], json(204)),
      "POST /nodes": (c) => {
        const node = { ...(c.body as CanvasNode), id: "nd_back", createdAt: "t", updatedAt: "t" };
        nodes.nd_back = node;
        return json(201, node);
      },
      "POST /edges": (c) => json(201, { label: null, ...(c.body as object), id: `ed_${Math.random()}` }),
      "POST /nodes/:id/annotations": (c, p) => json(201, { ...(c.body as object), id: "an_x", nodeId: p.id, createdAt: "t" }),
    });

    await store.getState().updateNode("nd_camp", { title: "Renamed" });
    await store.getState().deleteNode("nd_camp");
    await store.getState().undo(); // re-creates as nd_back, titled "Renamed"
    await store.getState().undo(); // must patch nd_back, not the dead nd_camp

    expect(backend.callsTo("PATCH /nodes/nd_back").at(-1)?.body).toEqual({ title: "Ramadan push" });
    expect(store.getState().nodes.nd_back?.title).toBe("Ramadan push");
  });

  it("keeps the entry when undo itself fails, so it can be retried", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });
    await store.getState().updateNode("nd_goal", { title: "600" });

    backend.on("PATCH /nodes/:id", () => apiError(503, "forced_failure"));
    await expect(store.getState().undo()).rejects.toMatchObject({ code: "forced_failure" });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().nodes.nd_goal?.title).toBe("600");

    backend.on("PATCH /nodes/:id", echoPatch(serverNodes()));
    await store.getState().undo();
    expect(store.getState().nodes.nd_goal?.title).toBe("500 orders");
  });

  it("holds at least 50 entries and unwinds them in order", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });

    for (let i = 1; i <= 60; i++) await store.getState().updateNode("nd_goal", { x: i });
    expect(store.getState().undoStack.length).toBeGreaterThanOrEqual(50);

    for (let i = 0; i < 50; i++) await store.getState().undo();
    expect(store.getState().nodes.nd_goal?.x).toBe(10);
  });

  it("is a no-op with an empty history", async () => {
    const { store, backend } = await loadedStore();
    const before = backend.calls.length;

    await store.getState().undo();

    expect(backend.calls.length).toBe(before);
  });
});
