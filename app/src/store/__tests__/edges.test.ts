import { describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import type { Edge } from "../../types";
import { connectionBetween, groupConnections, otherEnd } from "../edges";
import { byId } from "../records";
import { fixtures, loadedStore, seededRoutes } from "./fakeBackend";

const created: Edge = { id: "ed_new", fromId: "nd_reel", toId: "nd_goal", kind: "serves", label: null };

describe("createEdge", () => {
  it("stores one edge per connection — a single POST, never a mirrored pair", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "POST /edges": () => json(201, created) });

    await store.getState().createEdge({ fromId: "nd_reel", toId: "nd_goal", kind: "serves" });

    expect(backend.callsTo("POST /edges")).toHaveLength(1);
    expect(backend.callsTo("POST /edges")[0]!.body).toEqual({ fromId: "nd_reel", toId: "nd_goal", kind: "serves" });
    const between = Object.values(store.getState().edges).filter(
      (e) => [e.fromId, e.toId].sort().join() === ["nd_goal", "nd_reel"].sort().join(),
    );
    expect(between).toEqual([created]);
  });

  it("adds nothing when the API refuses", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "POST /edges": () => apiError(409, "edge_exists") });
    const before = store.getState().edges;

    await expect(store.getState().createEdge({ fromId: "nd_camp", toId: "nd_goal", kind: "serves" })).rejects.toMatchObject({
      code: "edge_exists",
    });
    expect(store.getState().edges).toEqual(before);
  });

  it("can be undone, which deletes the edge", async () => {
    const { store, backend } = await loadedStore({
      ...seededRoutes(),
      "POST /edges": () => json(201, created),
      "DELETE /edges/:id": () => json(204),
    });
    await store.getState().createEdge({ fromId: "nd_reel", toId: "nd_goal", kind: "serves" });

    await store.getState().undo();

    expect(backend.callsTo("DELETE /edges/ed_new")).toHaveLength(1);
    expect(store.getState().edges.ed_new).toBeUndefined();
  });
});

describe("reading edges", () => {
  const edges = byId<Edge>([
    ...fixtures.edges, // camp → goal (serves), reel → camp (serves)
    { id: "ed_rel", fromId: "nd_goal", toId: "nd_reel", kind: "relates-to", label: null },
  ]);

  it("shows one stored serves edge on both endpoints: Serves on one, Served by on the other", () => {
    expect(groupConnections(edges, "nd_camp")).toEqual({
      serves: [edges.ed_1],
      servedBy: [edges.ed_2],
      related: [],
    });
    expect(groupConnections(edges, "nd_goal").servedBy).toEqual([edges.ed_1]);
    expect(groupConnections(edges, "nd_goal").related).toEqual([edges.ed_rel]);
    expect(groupConnections(edges, "nd_reel").related).toEqual([edges.ed_rel]);
  });

  it("finds a connection between two nodes in either direction", () => {
    expect(connectionBetween(edges, "nd_camp", "nd_goal")?.id).toBe("ed_1");
    expect(connectionBetween(edges, "nd_goal", "nd_camp")?.id).toBe("ed_1");
    expect(connectionBetween(edges, "nd_goal", "nd_nope")).toBeUndefined();
  });

  it("names the node at the other end", () => {
    expect(otherEnd(edges.ed_1!, "nd_camp")).toBe("nd_goal");
    expect(otherEnd(edges.ed_1!, "nd_goal")).toBe("nd_camp");
  });
});
