// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import type { CanvasNode } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { emptyBoard, json, network, renderAt, resetApp, user } from "./harness";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, type: CanvasNode["type"], title: string, x: number): CanvasNode => ({
  id,
  type,
  title,
  body: "",
  fileIds: [],
  x,
  y: 0,
  createdAt: T,
  updatedAt: T,
});
const nodes = [
  node("nd_a", "campaign", "Ramadan push", 0),
  node("nd_b", "content", "Reel: linen", 400),
  node("nd_c", "goal", "500 orders", 800),
];

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, []));
  for (const p of ["/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
  network.on("DELETE /nodes/nd_b", () => json(204));
});
afterEach(cleanup);

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await waitFor(() => expect(document.querySelector('[data-node-card="nd_a"]')).toBeTruthy());
  return rendered;
}
const card = (id: string) => document.querySelector(`[data-node-card="${id}"]`) as HTMLElement;
const peek = () => screen.queryByRole("dialog", { name: /^Quick look/ });

describe("selecting a card from the keyboard", () => {
  it("selects the focused card on Space, which shows its quick-peek, and deselects it on a second Space", async () => {
    await openBoard();
    card("nd_b").focus();

    fireEvent.keyDown(card("nd_b"), { key: " " });

    expect(uiStore.getState().selectedIds).toEqual(["nd_b"]);
    expect(card("nd_b").getAttribute("aria-pressed")).toBe("true");
    expect(peek()?.getAttribute("aria-label")).toContain("Reel: linen");

    fireEvent.keyDown(card("nd_b"), { key: " " });
    expect(uiStore.getState().selectedIds).toEqual([]);
    expect(peek()).toBeNull();
  });

  it("does not scroll the page on Space", async () => {
    await openBoard();

    const consumed = !fireEvent.keyDown(card("nd_a"), { key: " " });

    expect(consumed).toBe(true);
  });

  it("dismisses the quick-peek, and clears the selection, on Escape", async () => {
    await openBoard();
    fireEvent.keyDown(card("nd_b"), { key: " " });
    expect(peek()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(peek()).toBeNull();
    expect(uiStore.getState().selectedIds).toEqual([]);
  });

  it("leaves Escape alone while the search overlay is the thing to close", async () => {
    await openBoard();
    fireEvent.keyDown(card("nd_b"), { key: " " });
    act(() => uiStore.getState().setSearchOpen(true));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(uiStore.getState().selectedIds).toEqual(["nd_b"]);
  });

  it("lets Delete remove a card that was selected with the keyboard, with an Undo to bring it back", async () => {
    await openBoard();
    card("nd_b").focus();
    fireEvent.keyDown(card("nd_b"), { key: " " });

    fireEvent.keyDown(card("nd_b"), { key: "Delete" });

    await waitFor(() => expect(network.callsTo("DELETE /nodes/nd_b")).toHaveLength(1));
    expect(await screen.findByText("Node deleted.")).toBeTruthy();
  });
});

describe("connect mode from the keyboard", () => {
  it("takes Enter on a card as picking it, source then target, and opens the kind picker without opening a panel", async () => {
    const { router } = await openBoard();
    act(() => uiStore.getState().setConnect({ active: true, sourceId: null, targetId: null }));

    fireEvent.keyDown(card("nd_a"), { key: "Enter" });
    expect(uiStore.getState().connect).toMatchObject({ active: true, sourceId: "nd_a", targetId: null });

    fireEvent.keyDown(card("nd_b"), { key: "Enter" });
    expect(uiStore.getState().connect).toMatchObject({ sourceId: "nd_a", targetId: "nd_b" });
    expect(await screen.findByRole("dialog", { name: "Connection kind" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
  });

  it("also takes Space as picking, so either key works on a button", async () => {
    await openBoard();
    act(() => uiStore.getState().setConnect({ active: true, sourceId: null, targetId: null }));

    fireEvent.keyDown(card("nd_a"), { key: " " });

    expect(uiStore.getState().connect.sourceId).toBe("nd_a");
    expect(uiStore.getState().selectedIds).toEqual([]);
  });

  it("still opens the detail panel on Enter when connect mode is off", async () => {
    const { router } = await openBoard();

    fireEvent.keyDown(card("nd_a"), { key: "Enter" });

    expect(router.state.location.pathname).toBe("/node/nd_a");
  });
});

describe("tab order", () => {
  it("puts the toolbar before the cards, so it is not behind every node on the way in", async () => {
    await openBoard();
    const toolbar = screen.getByRole("toolbar", { name: "Canvas tools" });

    expect(toolbar.compareDocumentPosition(card("nd_a")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the search dialog", () => {
  async function openSearchWithNoMatch() {
    await openBoard();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Search nodes by title or body" });
    fireEvent.change(input, { target: { value: "zzzz" } });
    const create = await screen.findByRole("button", { name: "Create a note with this title" });
    return { input, create };
  }

  it("keeps Tab inside itself, wrapping from the last control to the first", async () => {
    const { input, create } = await openSearchWithNoMatch();
    create.focus();

    const consumed = !fireEvent.keyDown(create, { key: "Tab" });

    expect(consumed).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    const { input, create } = await openSearchWithNoMatch();
    input.focus();

    const consumed = !fireEvent.keyDown(input, { key: "Tab", shiftKey: true });

    expect(consumed).toBe(true);
    expect(document.activeElement).toBe(create);
  });
});
