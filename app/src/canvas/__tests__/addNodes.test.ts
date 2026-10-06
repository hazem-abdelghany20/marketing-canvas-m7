// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addServing, createNodeAt } from "../actions";
import { apiError, json, network, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import type { CanvasNode } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const made = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: "nd_new",
  type: "strategy",
  title: "",
  body: "",
  fileIds: [],
  x: 0,
  y: 0,
  createdAt: T,
  updatedAt: T,
  ...overrides,
});

beforeEach(async () => {
  resetApp();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard({ nodes: SEED_NODES, edges: SEED_EDGES });
  await appStore.getState().loadBoard();
});

const toasts = () => uiStore.getState().toasts;

describe("createNodeAt", () => {
  it("makes a node of the type asked for, where it is asked to, and says which it made", async () => {
    network.on("POST /nodes", (call) => json(201, made({ ...(call.body as object), id: "nd_goal_new" } as Partial<CanvasNode>)));
    let seen: CanvasNode | undefined;

    const node = await createNodeAt({ x: 700, y: 1200 }, { type: "goal", onCreated: (n) => (seen = n) });

    expect(network.callsTo("POST /nodes")[0]!.body).toEqual({ type: "goal", x: 700, y: 1200 });
    expect(node?.id).toBe("nd_goal_new");
    expect(seen?.id).toBe("nd_goal_new");
  });

  it("gives it a title when it is given one", async () => {
    network.on("POST /nodes", (call) => json(201, made(call.body as Partial<CanvasNode>)));

    await createNodeAt({ x: 700, y: 1200 }, { type: "content", title: "A reel" });

    expect(network.callsTo("POST /nodes")[0]!.body).toEqual({ type: "content", x: 700, y: 1200, title: "A reel" });
  });

  it("says it could not, and offers to try again, when the server refuses; nothing is left half made", async () => {
    network.on("POST /nodes", () => apiError(503, "forced_failure", "Down."));
    const before = Object.keys(appStore.getState().nodes).length;

    expect(await createNodeAt({ x: 0, y: 0 }, { type: "goal" })).toBeNull();

    expect(toasts().at(-1)).toMatchObject({ message: COPY.addNodeFailed, tone: "danger", actionLabel: "Retry" });
    expect(Object.keys(appStore.getState().nodes)).toHaveLength(before);
  });
});

describe("addServing", () => {
  const parent = "nd_goal_vayn";

  function serveWrites() {
    network.on("POST /nodes", (call) => json(201, made({ ...(call.body as object), id: "nd_new" } as Partial<CanvasNode>)));
    network.on("POST /edges", (call) => json(201, { id: "ed_new", label: null, ...(call.body as object) }));
    network.on("DELETE /nodes/nd_new", () => json(204));
  }

  it("makes a node of the type, below the one it serves, and connects it so that it serves that one", async () => {
    serveWrites();
    let seen: CanvasNode | undefined;

    const node = await addServing(parent, "strategy", { onCreated: (n) => (seen = n) });

    const body = network.callsTo("POST /nodes")[0]!.body as { type: string; x: number; y: number };
    const goal = SEED_NODES.find((n) => n.id === parent)!;
    expect(body.type).toBe("strategy");
    expect(body.y).toBeGreaterThan(goal.y); // under it, where the chain runs
    expect(network.callsTo("POST /edges")[0]!.body).toEqual({ fromId: "nd_new", toId: parent, kind: "serves" });
    expect(node?.id).toBe("nd_new");
    expect(seen?.id).toBe("nd_new");
    expect(appStore.getState().nodes.nd_new).toBeTruthy();
  });

  it("is undone in one step: the node and its connection go together", async () => {
    serveWrites();
    await addServing(parent, "strategy");

    await appStore.getState().undo();

    expect(network.callsTo("DELETE /nodes/nd_new")).toHaveLength(1);
    expect(appStore.getState().nodes.nd_new).toBeUndefined();
    expect(appStore.getState().undoStack).toHaveLength(0);
  });

  it("keeps the node and offers to connect it again when only the connection failed", async () => {
    serveWrites();
    network.on("POST /edges", () => apiError(503, "forced_failure", "Down."));

    const node = await addServing(parent, "strategy");

    expect(node?.id).toBe("nd_new"); // the node is there: the rest of the flow (naming it) carries on
    expect(appStore.getState().nodes.nd_new).toBeTruthy();
    const toast = toasts().at(-1)!;
    expect(toast).toMatchObject({ message: COPY.connectAfterAddFailed, tone: "danger", actionLabel: "Retry" });

    network.on("POST /edges", (call) => json(201, { id: "ed_retry", label: null, ...(call.body as object) }));
    toast.onAction?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(network.callsTo("POST /edges")).toHaveLength(2);
    expect(network.callsTo("POST /edges")[1]!.body).toEqual({ fromId: "nd_new", toId: parent, kind: "serves" });
  });

  it("makes nothing, and says so, when the node is refused", async () => {
    serveWrites();
    network.on("POST /nodes", () => apiError(503, "forced_failure", "Down."));

    expect(await addServing(parent, "strategy")).toBeNull();

    expect(network.callsTo("POST /edges")).toHaveLength(0);
    expect(toasts().at(-1)).toMatchObject({ message: COPY.addNodeFailed, actionLabel: "Retry" });
  });

  it("does nothing for a parent that is no longer there", async () => {
    serveWrites();

    expect(await addServing("nd_gone", "strategy")).toBeNull();

    expect(network.callsTo("POST /nodes")).toHaveLength(0);
  });
});
