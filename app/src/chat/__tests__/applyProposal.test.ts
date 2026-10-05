import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import { deferred, loadedStore, seededRoutes, type Handler } from "../../store/__tests__/fakeBackend";
import { isProposalApplied } from "../../store/chat";
import type { ChatMessage, Edge, Proposal } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { applyProposal } from "../applyProposal";

// Board: goal (0,0) · campaign (100,0) · reel (200,0); reel → campaign → goal are connected.
const AT = { x: 600, y: 400 };

function reply(proposal: Proposal, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "r1",
    role: "assistant",
    content: "Here you go.",
    status: "done",
    citedNodeIds: [],
    createdAt: "2026-09-02T00:00:00.000Z",
    proposal,
    ...extra,
  };
}
const node = (payload: Record<string, unknown>) => reply({ kind: "create-node", payload } as Proposal);
const edge = (payload: Record<string, unknown>, extra: Partial<ChatMessage> = {}) =>
  reply({ kind: "create-edge", payload } as Proposal, extra);

/** A backend that behaves like the server for the two creates and their undo. */
function backendRoutes(): Record<string, Handler> {
  let seq = 0;
  return {
    ...seededRoutes(),
    "POST /nodes": (c) =>
      json(201, { fileIds: [], body: "", ...(c.body as object), id: `nd_new${++seq}`, createdAt: "t", updatedAt: "t" }),
    "POST /edges": (c) => json(201, { label: null, ...(c.body as object), id: `ed_new${++seq}` }),
    "DELETE /nodes/:id": () => json(204),
    "DELETE /edges/:id": () => json(204),
  };
}

async function setup(routes = backendRoutes()) {
  const made = await loadedStore(routes);
  const apply = (message: ChatMessage, at = AT) => applyProposal(message, { store: made.store, ui: uiStore, at });
  return { ...made, apply, posts: (route: string) => made.backend.callsTo(route) };
}
const toasts = () => uiStore.getState().toasts;
const lastToast = () => toasts().at(-1)!;

beforeEach(() => uiStore.getState().reset());
afterEach(() => uiStore.getState().reset());

describe("applyProposal: create-node", () => {
  it("creates the node the reply proposed, where it is told, through the store's own createNode", async () => {
    const { apply, posts, store } = await setup();

    const outcome = await apply(node({ type: "content", title: "Reel: linen care", body: "Hook at 0:02." }));

    expect(posts("POST /nodes")[0]!.body).toEqual({
      type: "content",
      title: "Reel: linen care",
      body: "Hook at 0:02.",
      x: 600,
      y: 400,
    });
    expect(outcome).toMatchObject({ status: "applied", kind: "node" });
    expect(Object.values(store.getState().nodes).map((n) => n.title)).toContain("Reel: linen care");
  });

  it("steps off a node that already sits exactly there, as every new node does", async () => {
    const { apply, posts } = await setup();

    await apply(node({ type: "note", title: "T" }), { x: 0, y: 0 }); // nd_goal is at (0, 0)

    expect(posts("POST /nodes")[0]!.body).toMatchObject({ x: 24, y: 24 });
  });

  it("falls back to a content node called Untitled when the proposal leaves the type or title out", async () => {
    const { apply, posts } = await setup();

    await apply(node({ type: "banana" }));

    expect(posts("POST /nodes")[0]!.body).toMatchObject({ type: "content", title: "Untitled", body: "" });
  });

  it("marks the reply as applied, says so, and offers one Undo that removes the node and frees the button", async () => {
    const { apply, store } = await setup();
    const message = node({ type: "content", title: "Reel: linen care" });
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);

    await apply(message);

    expect(isProposalApplied(store.getState(), message.id)).toBe(true);
    expect(lastToast()).toMatchObject({ actionLabel: "Undo", tone: "success" });
    expect(lastToast().message).toContain("Reel: linen care");
    expect(store.getState().undoStack).toHaveLength(1);

    await store.getState().undo();

    expect(isProposalApplied(store.getState(), message.id)).toBe(false);
  });

  it("will not create a second node from a reply that is already applied", async () => {
    const { apply, posts } = await setup();
    const message = node({ type: "content", title: "Once" });

    await apply(message);
    const again = await apply(message);

    expect(posts("POST /nodes")).toHaveLength(1);
    expect(again).toEqual({ status: "refused" });
  });

  it("will not create two nodes when it is asked twice at once", async () => {
    const gate = deferred<Response>();
    const routes = { ...backendRoutes(), "POST /nodes": () => gate.promise };
    const { apply, posts } = await setup(routes);
    const message = node({ type: "content", title: "Once" });

    const first = apply(message);
    const second = await apply(message);
    gate.resolve(
      json(201, {
        id: "nd_x",
        type: "content",
        title: "Once",
        body: "",
        fileIds: [],
        x: 600,
        y: 400,
        createdAt: "t",
        updatedAt: "t",
      }),
    );
    await first;

    expect(second).toEqual({ status: "refused" });
    expect(posts("POST /nodes")).toHaveLength(1);
  });

  it("can be asked again after it is undone, and creates a fresh node", async () => {
    const { apply, posts, store } = await setup();
    const message = node({ type: "content", title: "Again" });
    await apply(message);
    await store.getState().undo();

    await apply(message);

    expect(posts("POST /nodes")).toHaveLength(2);
    expect(isProposalApplied(store.getState(), message.id)).toBe(true);
  });

  it("asks you to check your connection, creates nothing and stays actionable when the API fails", async () => {
    const routes = { ...backendRoutes(), "POST /nodes": () => apiError(503, "forced_failure", "Down.") };
    const { apply, store, backend } = await setup(routes);
    const message = node({ type: "content", title: "Nope" });

    const outcome = await apply(message);

    expect(outcome).toEqual({ status: "failed" });
    expect(lastToast()).toMatchObject({ tone: "danger" });
    expect(lastToast().message).toBe("Couldn't add that to the canvas. Check your connection and try again.");
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);
    expect(Object.keys(store.getState().nodes)).toHaveLength(3);

    backend.on("POST /nodes", (c) =>
      json(201, { ...(c.body as object), id: "nd_ok", fileIds: [], createdAt: "t", updatedAt: "t" }),
    );
    await expect(apply(message)).resolves.toMatchObject({ status: "applied" });
  });
});

describe("applyProposal: create-edge", () => {
  const nodeEdge = { fromId: "nd_reel", toId: "nd_goal", kind: "serves" };

  it("creates the connection through the store's own createEdge, and flashes both ends", async () => {
    const { apply, posts, store } = await setup();
    const message = edge(nodeEdge);

    const outcome = await apply(message);

    expect(posts("POST /edges")[0]!.body).toEqual({ fromId: "nd_reel", toId: "nd_goal", kind: "serves" });
    expect(outcome).toMatchObject({ status: "applied", kind: "edge" });
    expect(
      Object.values(store.getState().edges).some((e: Edge) => e.fromId === "nd_reel" && e.toId === "nd_goal"),
    ).toBe(true);
    expect(uiStore.getState().flashIds.sort()).toEqual(["nd_goal", "nd_reel"]);
    expect(isProposalApplied(store.getState(), message.id)).toBe(true);
    expect(lastToast()).toMatchObject({ actionLabel: "Undo" });
  });

  it("keeps the kind it was given", async () => {
    const { apply, posts } = await setup();

    await apply(edge({ ...nodeEdge, kind: "relates-to" }));

    expect(posts("POST /edges")[0]!.body).toMatchObject({ kind: "relates-to" });
  });

  it("is undone with the edge, and the reply can be applied again", async () => {
    const { apply, store, posts } = await setup();
    const message = edge(nodeEdge);
    await apply(message);

    await store.getState().undo();
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);

    await apply(message);
    expect(posts("POST /edges")).toHaveLength(2);
  });

  it("creates nothing and names the node that has gone, when an end of the connection is missing", async () => {
    const { apply, posts, store } = await setup();
    const message = edge(
      { fromId: "nd_reel", toId: "nd_deleted", kind: "serves" },
      { proposalTitles: { nd_reel: "Reel", nd_deleted: "Vayn Ramadan push" } },
    );

    const outcome = await apply(message);

    expect(outcome).toEqual({ status: "refused" });
    expect(posts("POST /edges")).toHaveLength(0);
    expect(lastToast().message).toContain("Vayn Ramadan push");
    expect(lastToast().message).toContain("no longer on the canvas");
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);
  });

  it("still says a node is missing when the reply never recorded its title", async () => {
    const { apply, posts } = await setup();

    await apply(edge({ fromId: "nd_gone", toId: "nd_goal", kind: "serves" }));

    expect(posts("POST /edges")).toHaveLength(0);
    expect(lastToast().message).toContain("no longer on the canvas");
  });

  it("says so when the API reports a node missing that the cache still had", async () => {
    const routes = { ...backendRoutes(), "POST /edges": () => apiError(404, "node_not_found", "Gone.") };
    const { apply, store } = await setup(routes);
    const message = edge(nodeEdge, { proposalTitles: { nd_reel: "Reel", nd_goal: "500 orders" } });

    const outcome = await apply(message);

    expect(outcome).toEqual({ status: "refused" });
    expect(lastToast().message).toContain("no longer on the canvas");
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);
  });

  it("creates nothing when the two nodes are already connected, and says so", async () => {
    const { apply, posts } = await setup();

    const outcome = await apply(edge({ fromId: "nd_camp", toId: "nd_goal", kind: "serves" })); // ed_1

    expect(outcome).toEqual({ status: "refused" });
    expect(posts("POST /edges")).toHaveLength(0);
    expect(lastToast().message).toBe("These nodes are already connected.");
  });

  it("asks you to check your connection and stays actionable when the API fails", async () => {
    const routes = { ...backendRoutes(), "POST /edges": () => apiError(503, "forced_failure", "Down.") };
    const { apply, store } = await setup(routes);
    const message = edge(nodeEdge);

    await expect(apply(message)).resolves.toEqual({ status: "failed" });

    expect(lastToast().message).toBe("Couldn't add that to the canvas. Check your connection and try again.");
    expect(isProposalApplied(store.getState(), message.id)).toBe(false);
  });

  it("fails cleanly on a proposal with no ends at all", async () => {
    const { apply, posts } = await setup();

    await expect(apply(edge({ kind: "serves" }))).resolves.toEqual({ status: "failed" });

    expect(posts("POST /edges")).toHaveLength(0);
  });
});

describe("applyProposal: what is not a proposal", () => {
  it("does nothing for a reply without one", async () => {
    const { apply, posts } = await setup();
    const plain: ChatMessage = { ...node({ type: "note" }), proposal: undefined };

    await expect(apply(plain)).resolves.toEqual({ status: "refused" });

    expect(posts("POST /nodes")).toHaveLength(0);
    expect(toasts()).toHaveLength(0);
  });

  it("does nothing for a reply that did not finish", async () => {
    const { apply, posts } = await setup();

    await expect(apply({ ...node({ type: "note" }), status: "error" })).resolves.toEqual({ status: "refused" });

    expect(posts("POST /nodes")).toHaveLength(0);
  });
});
