// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, json, network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { CanvasNode } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const GOAL = SEED_NODES[0]!; // nd_goal_vayn

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  stubViewport(375);
});
afterEach(() => {
  cleanup();
  unstubViewport();
});

function serveWrites() {
  network.on("POST /nodes", (call) =>
    json(201, { id: "nd_new", title: "", body: "", fileIds: [], createdAt: T, updatedAt: T, ...(call.body as object) } satisfies Partial<CanvasNode>),
  );
  network.on("POST /edges", (call) => json(201, { id: "ed_new", label: null, ...(call.body as object) }));
  network.on("DELETE /nodes/nd_new", () => json(204));
}

async function openTrace(nodes: CanvasNode[] = [GOAL], edges = [] as typeof SEED_EDGES) {
  serveBoard({ nodes, edges });
  serveWrites();
  const rendered = renderAt("/");
  await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return rendered;
}

const trace = () => within(screen.getByRole("region", { name: "Trace" }));
const empty = (label: string) => trace().getByRole("group", { name: `${label}, empty` });

describe("the empty row's button", () => {
  it("offers to add what is missing, in the words of the layer that would go there", async () => {
    await openTrace();
    expect(within(empty("Strategy")).getByRole("button", { name: "Add a strategy" })).toBeTruthy();
    cleanup();

    const withStrategy = [GOAL, SEED_NODES[2]!];
    await openTrace(withStrategy, [SEED_EDGES.find((e) => e.id === "edg_8")!]);
    expect(within(empty("Campaign")).getByRole("button", { name: "Add a campaign" })).toBeTruthy();
    cleanup();

    const withCampaign = [GOAL, SEED_NODES[2]!, SEED_NODES[6]!];
    await openTrace(withCampaign, [SEED_EDGES.find((e) => e.id === "edg_8")!, SEED_EDGES.find((e) => e.id === "edg_6")!]);
    expect(within(empty("Content")).getByRole("button", { name: "Add a piece of content" })).toBeTruthy();
  });

  it("makes the node, connects it so that it serves the goal above, shows it in its row, and opens it to be named", async () => {
    const { router } = await openTrace();

    fireEvent.click(within(empty("Strategy")).getByRole("button", { name: "Add a strategy" }));

    await waitFor(() => expect(network.callsTo("POST /edges")).toHaveLength(1));
    expect((network.callsTo("POST /nodes")[0]!.body as { type: string }).type).toBe("strategy");
    expect(network.callsTo("POST /edges")[0]!.body).toEqual({ fromId: "nd_new", toId: GOAL.id, kind: "serves" });
    // In its row, on screen, with the row no longer empty.
    expect(await trace().findByRole("group", { name: "Strategy, 1 of 1" })).toBeTruthy();
    expect(trace().getByRole("button", { name: "Untitled, Strategy" }).getAttribute("aria-current")).toBe("true");
    // And open, with its title ready to be typed.
    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
    expect(router.state.location.state).toMatchObject({ focusTitle: true });
  });

  it("is undone in one step: the node and its connection go, and the row is empty again", async () => {
    await openTrace();
    fireEvent.click(within(empty("Strategy")).getByRole("button", { name: "Add a strategy" }));
    await trace().findByRole("group", { name: "Strategy, 1 of 1" });

    fireEvent.click(trace().getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(network.callsTo("DELETE /nodes/nd_new")).toHaveLength(1));
    expect(await trace().findByRole("group", { name: "Strategy, empty" })).toBeTruthy();
  });

  it("keeps the node, and offers to try the connection again, when only the connection failed", async () => {
    const { router } = await openTrace();
    network.on("POST /edges", () => apiError(503, "forced_failure", "Down."));

    fireEvent.click(within(empty("Strategy")).getByRole("button", { name: "Add a strategy" }));

    await waitFor(() => expect(uiStore.getState().toasts.at(-1)?.message).toBe(COPY.connectAfterAddFailed));
    expect(appStore.getState().nodes.nd_new).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
    // It is not under the goal, so the row is still waiting for one.
    expect(trace().getByRole("group", { name: "Strategy, empty" })).toBeTruthy();
  });

  it("says it could not make the node, and nothing is connected, when the server refuses it", async () => {
    await openTrace();
    network.on("POST /nodes", () => apiError(503, "forced_failure", "Down."));

    fireEvent.click(within(empty("Strategy")).getByRole("button", { name: "Add a strategy" }));

    await waitFor(() => expect(uiStore.getState().toasts.at(-1)?.message).toBe(COPY.addNodeFailed));
    expect(network.callsTo("POST /edges")).toHaveLength(0);
  });

  it("is not offered twice at once: a second tap while the first is working does nothing more", async () => {
    await openTrace();
    const button = within(empty("Strategy")).getByRole("button", { name: "Add a strategy" });

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(network.callsTo("POST /edges")).toHaveLength(1));
    expect(network.callsTo("POST /nodes")).toHaveLength(1);
  });
});
