// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { avoidOverlap, OVERLAP_STEP } from "../../canvas/actions";
import {
  apiError,
  emptyBoard,
  json,
  network,
  renderAt,
  resetApp,
  serveEmptyBoard,
  user,
} from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode } from "../../types";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const note = (over: Partial<CanvasNode> = {}): CanvasNode => ({
  id: "nd_new",
  type: "note",
  title: "Untitled",
  body: "",
  fileIds: [],
  x: 0,
  y: 0,
  createdAt: T,
  updatedAt: T,
  ...over,
});

beforeEach(() => {
  resetApp();
  appStore.getState().signIn({ token: "tok", user });
  serveEmptyBoard();
});
afterEach(cleanup);

async function openMenuFromFirstRun() {
  const rendered = renderAt("/");
  const trigger = await screen.findByRole("button", { name: "Add your first node" });
  trigger.focus(); // as a real click would
  fireEvent.click(trigger);
  const menu = await screen.findByRole("menu", { name: "Add node" });
  return { ...rendered, menu };
}

describe("AddNodeMenu", () => {
  it("opens from the first-run affordance with its first option focused", async () => {
    const { menu } = await openMenuFromFirstRun();
    const options = Array.from(menu.querySelectorAll("[role=menuitem]")).map((el) => el.firstChild?.textContent);
    expect(options).toEqual(["Note", "File", "From chat"]);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /^Note/ }));
  });

  it("creates an untitled note at the viewport centre and opens its detail panel", async () => {
    network.on("POST /nodes", (call) => json(201, note(call.body as Partial<CanvasNode>)));
    const { router } = await openMenuFromFirstRun();

    fireEvent.click(screen.getByRole("menuitem", { name: /^Note/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
    const body = network.callsTo("POST /nodes")[0]!.body as Record<string, unknown>;
    expect(body.type).toBe("note");
    expect(body.title).toBeUndefined();
    expect(router.state.location.state).toEqual({ focusTitle: true });
    expect(appStore.getState().nodes.nd_new).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and creates nothing", async () => {
    const { menu } = await openMenuFromFirstRun();
    fireEvent.keyDown(menu, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(network.callsTo("POST /nodes")).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add your first node" }));
  });

  it("says the node couldn't be added, offers Retry, and leaves no node behind", async () => {
    network.on("POST /nodes", () => apiError(503, "forced_failure"));
    const { router } = await openMenuFromFirstRun();

    fireEvent.click(screen.getByRole("menuitem", { name: /^Note/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't add the node. Check your connection and try again.");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(Object.keys(appStore.getState().nodes)).toHaveLength(0);
    expect(router.state.location.pathname).toBe("/");

    network.on("POST /nodes", (call) => json(201, note(call.body as Partial<CanvasNode>)));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(appStore.getState().nodes.nd_new).toBeTruthy());
    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
  });

  it("makes 'From chat' non-interactive while a reply is streaming, and says why", async () => {
    await openMenuFromFirstRun();
    act(() => appStore.setState({ chatStreaming: true }));

    const fromChat = screen.getByRole("menuitem", { name: /^From chat/ });
    expect(fromChat.getAttribute("aria-disabled")).toBe("true");
    expect(fromChat.title).toBe("Wait for the current reply to finish.");
    fireEvent.click(fromChat);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("opens from the N key", async () => {
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");
    fireEvent.keyDown(window, { key: "n" });
    expect(await screen.findByRole("menu", { name: "Add node" })).toBeTruthy();
  });
});

describe("avoidOverlap", () => {
  it("keeps a free spot as it is", () => {
    expect(avoidOverlap({ x: 100, y: 80 }, [note({ x: 0, y: 0 })])).toEqual({ x: 100, y: 80 });
  });

  it("steps off a node sitting exactly where the new one would land", () => {
    const taken = [note({ id: "a", x: 100, y: 80 }), note({ id: "b", x: 100 + OVERLAP_STEP, y: 80 + OVERLAP_STEP })];
    expect(avoidOverlap({ x: 100, y: 80 }, taken)).toEqual({ x: 100 + 2 * OVERLAP_STEP, y: 80 + 2 * OVERLAP_STEP });
  });
});

describe("Toolbar", () => {
  it("renders while the board loads, with every control waiting for it", async () => {
    network.on("GET /board", () => new Promise<Response>(() => {}));
    renderAt("/");
    const add = await screen.findByRole("button", { name: "Add node" });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(add.title).toBe("Waiting for the board.");
  });

  it("disables Fit on an empty board and Undo with no history, saying why", async () => {
    network.on("GET /board", () => json(200, emptyBoard));
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");

    expect(screen.getByRole("button", { name: "Fit to screen" }).title).toBe("Nothing to fit yet.");
    expect(screen.getByRole("button", { name: "Undo" }).title).toBe("Nothing to undo yet.");
    expect(screen.getByRole("button", { name: "Add node" }).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("Delete key", () => {
  it("never deletes the canvas selection from a control outside the canvas", async () => {
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");
    appStore.setState({ nodes: { nd_1: note({ id: "nd_1" }) } });
    uiStore.getState().select(["nd_1"]);

    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.keyDown(undo, { key: "Backspace" });
    expect(network.callsTo("DELETE /nodes/nd_1")).toHaveLength(0);

    network.on("DELETE /nodes/nd_1", () => json(204));
    fireEvent.keyDown(document.body, { key: "Backspace" });
    await waitFor(() => expect(network.callsTo("DELETE /nodes/nd_1")).toHaveLength(1));
  });
});
