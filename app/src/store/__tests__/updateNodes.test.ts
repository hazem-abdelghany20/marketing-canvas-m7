import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { RecordedCall } from "../../api/__tests__/helpers";
import type { CanvasNode, NodePatch } from "../../types";
import { deferred, fixtures, loadedStore, seededRoutes, type Handler } from "./fakeBackend";

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

const serverNodes = (): Record<string, CanvasNode> => Object.fromEntries(fixtures.nodes.map((n) => [n.id, { ...n }]));

// Fixture positions: nd_goal (0, 0), nd_camp (100, 0), nd_reel (200, 0).
const MOVES = [
  { id: "nd_goal", patch: { x: 10, y: 20 } },
  { id: "nd_reel", patch: { x: 30, y: 40 } },
];

describe("updateNodes", () => {
  it("shows every move straight away, then sends one PATCH per node with only the fields it changes", async () => {
    const gate = deferred<void>();
    const nodes = serverNodes();
    const echo = echoPatch(nodes);
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": async (call, p) => (await gate.promise, echo(call, p)),
    });

    const pending = store.getState().updateNodes(MOVES);

    // Optimistic: nothing has answered yet.
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 10, y: 20 });
    expect(store.getState().nodes.nd_reel).toMatchObject({ x: 30, y: 40 });

    gate.resolve();
    await pending;

    expect(backend.callsTo("PATCH /nodes/nd_goal").map((c) => c.body)).toEqual([{ x: 10, y: 20 }]);
    expect(backend.callsTo("PATCH /nodes/nd_reel").map((c) => c.body)).toEqual([{ x: 30, y: 40 }]);
    expect(backend.callsTo("PATCH /nodes/nd_camp")).toHaveLength(0);
  });

  it("records its undo entry only once every save has landed", async () => {
    const gate = deferred<void>();
    const echo = echoPatch(serverNodes());
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": async (call, p) => (await gate.promise, echo(call, p)),
    });

    const pending = store.getState().updateNodes(MOVES);
    await Promise.resolve();
    expect(store.getState().undoStack).toHaveLength(0);

    gate.resolve();
    await pending;
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("holds what the server answered once every save has landed", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });

    const saved = await store.getState().updateNodes(MOVES);

    expect(saved.map((n) => [n.id, n.x, n.y])).toEqual([
      ["nd_goal", 10, 20],
      ["nd_reel", 30, 40],
    ]);
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 10, y: 20 });
    expect(store.getState().nodes.nd_camp).toMatchObject({ x: 100, y: 0 });
  });

  it("is one undo entry for the whole batch, not one per node", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });

    await store.getState().updateNodes(MOVES);

    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("puts every node back, through the API, with a single undo", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });
    await store.getState().updateNodes(MOVES);

    await store.getState().undo();

    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().nodes.nd_reel).toMatchObject({ x: 200, y: 0 });
    expect(backend.callsTo("PATCH /nodes/nd_goal").at(-1)?.body).toEqual({ x: 0, y: 0 });
    expect(backend.callsTo("PATCH /nodes/nd_reel").at(-1)?.body).toEqual({ x: 200, y: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("sends back only the fields a patch touched", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });
    await store.getState().updateNodes([{ id: "nd_camp", patch: { x: 555 } }]);

    await store.getState().undo();

    expect(backend.callsTo("PATCH /nodes/nd_camp").at(-1)?.body).toEqual({ x: 100 });
  });

  it("follows a node that was deleted and brought back under a new id before the undo", async () => {
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
      "POST /nodes/:id/annotations": (c, p) =>
        json(201, { ...(c.body as object), id: "an_x", nodeId: p.id, createdAt: "t" }),
    });

    await store.getState().updateNodes([
      { id: "nd_camp", patch: { x: 900, y: 900 } },
      { id: "nd_goal", patch: { x: 5, y: 5 } },
    ]);
    await store.getState().deleteNode("nd_camp");
    await store.getState().undo(); // re-creates the campaign as nd_back, at (900, 900)
    await store.getState().undo(); // must move nd_back, not the dead nd_camp

    expect(backend.callsTo("PATCH /nodes/nd_back").at(-1)?.body).toEqual({ x: 100, y: 0 });
    expect(store.getState().nodes.nd_back).toMatchObject({ x: 100, y: 0 });
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
  });

  it("when one save fails, puts every node back (the saved ones too), adds no history, and rejects", async () => {
    const nodes = serverNodes();
    const echo = echoPatch(nodes);
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      // Only the arrange write to nd_reel is refused; every other PATCH goes through.
      "PATCH /nodes/:id": (call, p) =>
        p.id === "nd_reel" && (call.body as NodePatch).x === 30
          ? apiError(503, "forced_failure", "Down.")
          : echo(call, p),
    });

    const error = await store
      .getState()
      .updateNodes(MOVES)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "forced_failure" });
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().nodes.nd_reel).toMatchObject({ x: 200, y: 0 });
    // nd_goal did save on the server; the batch undoes that rather than leave half an arrangement.
    expect(backend.callsTo("PATCH /nodes/nd_goal").at(-1)?.body).toEqual({ x: 0, y: 0 });
    expect(nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("still puts back a node whose save lands after another node's save has already failed", async () => {
    const slow = deferred<void>();
    const nodes = serverNodes();
    const echo = echoPatch(nodes);
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": async (call, p) => {
        // nd_reel is refused at once; nd_goal's arrange write is held until after that.
        if (p.id === "nd_reel" && (call.body as NodePatch).x === 30) return apiError(503, "forced_failure", "Down.");
        if (p.id === "nd_goal" && (call.body as NodePatch).x === 10) await slow.promise;
        return echo(call, p);
      },
    });

    const batch = store
      .getState()
      .updateNodes(MOVES)
      .catch((e: unknown) => e);
    await Promise.resolve();
    slow.resolve();
    const error = await batch;

    expect(error).toMatchObject({ code: "forced_failure" });
    expect(nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(backend.callsTo("PATCH /nodes/nd_goal").at(-1)?.body).toEqual({ x: 0, y: 0 });
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
  });

  it("keeps a node undoable when the save failed and putting it back failed too", async () => {
    const nodes = serverNodes();
    const echo = echoPatch(nodes);
    let revertsRefused = true;
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": async (call, p) => {
        const body = call.body as NodePatch;
        if (p.id === "nd_reel" && body.x === 30) return apiError(503, "forced_failure", "Down.");
        // nd_goal's write lands, but writing it back is refused.
        if (p.id === "nd_goal" && body.x === 0 && revertsRefused) return apiError(503, "forced_failure", "Down.");
        return echo(call, p);
      },
    });

    await store
      .getState()
      .updateNodes(MOVES)
      .catch(() => {});
    // Half done: nd_goal is moved on the server, and the user can see it.
    expect(nodes.nd_goal).toMatchObject({ x: 10, y: 20 });
    expect(store.getState().undoStack).toHaveLength(1);

    revertsRefused = false;
    await store.getState().undo();
    expect(nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("undoes the nodes that are still there when one of them has been deleted since", async () => {
    const nodes = serverNodes();
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /nodes/:id": echoPatch(nodes),
      "DELETE /nodes/:id": (_c, p) => (delete nodes[p.id!], json(204)),
    });
    await store.getState().updateNodes(MOVES);
    await store.getState().deleteNode("nd_reel"); // its own entry
    store.setState((s) => ({ undoStack: s.undoStack.slice(0, -1) })); // the delete is not what we are undoing

    await store.getState().undo();

    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("refuses a batch that names a node it doesn't have, before sending anything", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /nodes/:id": echoPatch(serverNodes()) });

    const error = await store
      .getState()
      .updateNodes([MOVES[0]!, { id: "nd_gone", patch: { x: 1, y: 1 } }])
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "node_not_found" });
    expect(backend.callsTo("PATCH /nodes/nd_goal")).toHaveLength(0);
    expect(store.getState().nodes.nd_goal).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("does nothing for an empty batch: no request, no history entry", async () => {
    const { store, backend } = await loadedStore();
    const before = backend.calls.length;

    await expect(store.getState().updateNodes([])).resolves.toEqual([]);

    expect(backend.calls.length).toBe(before);
    expect(store.getState().undoStack).toHaveLength(0);
  });
});
