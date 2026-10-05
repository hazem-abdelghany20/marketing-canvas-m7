// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { controlledSse, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { NARROW_QUERY } from "../../lib/useMediaQuery";
import { emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { omit } from "../../store/records";
import type { CanvasNode, ChatMessage } from "../../types";
import { uiStore } from "../../ui/uiStore";

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
  node("nd_a", "campaign", "Vayn Ramadan push", 0),
  node("nd_b", "content", "Email: Ramadan lookbook drop", 600),
  node("nd_c", "goal", "500 orders", 1200),
];

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  for (const p of ["/edges", "/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
});
afterEach(() => {
  cleanup();
  // @ts-expect-error jsdom ships no matchMedia; the stub is removed to match.
  delete window.matchMedia;
});

function stubReducedMotion() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

async function openBoard() {
  renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await waitFor(() => expect(document.querySelector('[data-node-card="nd_a"]')).toBeTruthy());
}

const card = (id: string) => document.querySelector(`[data-node-card="${id}"]`) as HTMLElement;
const camera = () => (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;

/** A finished reply that cites `ids`, put straight into the chat. */
function replyCiting(ids: string[]): ChatMessage[] {
  return [
    { id: "q1", role: "user", content: "what serves Ramadan?", status: "done", citedNodeIds: [], createdAt: T },
    {
      id: "r1",
      role: "assistant",
      content: "Three nodes.",
      status: "done",
      citedNodeIds: ids,
      createdAt: T,
      mode: "librarian",
    },
  ];
}
const show = (messages: ChatMessage[]) => act(() => appStore.setState({ chatMessages: messages }));
const chips = () => within(screen.getByRole("list", { name: "Cited nodes" })).getAllByRole("button");

describe("citation chips", () => {
  it("show one button per cited node, named by the node's title", async () => {
    await openBoard();

    show(replyCiting(["nd_a", "nd_b"]));

    expect(chips().map((c) => c.textContent)).toEqual(["Vayn Ramadan push", "Email: Ramadan lookbook drop"]);
    expect(screen.getByRole("button", { name: "Vayn Ramadan push" })).toBe(chips()[0]);
    expect(chips()[0]!.tagName).toBe("BUTTON");
  });

  it("leave out a node that no longer exists and still show the rest", async () => {
    await openBoard();

    show(replyCiting(["nd_a", "nd_gone", "nd_c"]));

    expect(chips().map((c) => c.textContent)).toEqual(["Vayn Ramadan push", "500 orders"]);
  });

  it("are not shown at all for a reply that cites nothing, or only nodes that are gone", async () => {
    await openBoard();

    show(replyCiting([]));
    expect(screen.queryByRole("list", { name: "Cited nodes" })).toBeNull();
    show(replyCiting(["nd_gone"]));
    expect(screen.queryByRole("list", { name: "Cited nodes" })).toBeNull();
  });

  it("drop a node's chip, and only that one, when the node is deleted afterwards", async () => {
    await openBoard();
    show(replyCiting(["nd_a", "nd_b"]));

    act(() => appStore.setState((s) => ({ nodes: omit(s.nodes, ["nd_a"]) })));

    expect(chips().map((c) => c.textContent)).toEqual(["Email: Ramadan lookbook drop"]);
  });

  it("select the node and pan the canvas to it, leaving keyboard focus on the chip", async () => {
    stubReducedMotion();
    await openBoard();
    show(replyCiting(["nd_a", "nd_c"]));
    const before = camera();
    const chip = screen.getByRole("button", { name: "500 orders" });
    chip.focus();

    fireEvent.click(chip);

    expect(uiStore.getState().selectedIds).toEqual(["nd_c"]);
    await waitFor(() => expect(camera()).not.toBe(before));
    expect(document.activeElement).toBe(chip);
  });
});

describe("citation chips on a narrow screen", () => {
  it("close the sheet that covers the canvas, so the pan can be seen", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === NARROW_QUERY,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    renderAt("/");
    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
    fireEvent.click(await screen.findByRole("button", { name: "Open assistant" }));
    show(replyCiting(["nd_a"]));

    fireEvent.click(screen.getByRole("button", { name: "Vayn Ramadan push" }));

    expect(uiStore.getState().selectedIds).toEqual(["nd_a"]);
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });
});

describe("a finished reply on the canvas", () => {
  async function ask(citing: string[]) {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openBoard();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "what serves Ramadan?" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));
    return {
      finish: () => {
        stream.push("token", { token: "Two nodes." });
        stream.push("done", { citedNodeIds: citing, proposal: null });
        stream.close();
      },
    };
  }

  it("marks the cited cards, and only those, once it completes", async () => {
    const reply = await ask(["nd_a", "nd_b"]);
    expect(card("nd_a").hasAttribute("data-cited")).toBe(false);

    reply.finish();

    await waitFor(() => expect(card("nd_a").hasAttribute("data-cited")).toBe(true));
    expect(card("nd_b").hasAttribute("data-cited")).toBe(true);
    expect(card("nd_c").hasAttribute("data-cited")).toBe(false);
    expect(chips().map((c) => c.textContent)).toEqual(["Vayn Ramadan push", "Email: Ramadan lookbook drop"]);
  });

  it("stops marking them when a different node is selected", async () => {
    const reply = await ask(["nd_a", "nd_b"]);
    reply.finish();
    await waitFor(() => expect(card("nd_a").hasAttribute("data-cited")).toBe(true));

    act(() => uiStore.getState().select(["nd_c"]));

    await waitFor(() => expect(card("nd_a").hasAttribute("data-cited")).toBe(false));
    expect(card("nd_b").hasAttribute("data-cited")).toBe(false);
  });

  it("keeps marking them while a cited node is the selected one", async () => {
    const reply = await ask(["nd_a", "nd_b"]);
    reply.finish();
    await waitFor(() => expect(card("nd_a").hasAttribute("data-cited")).toBe(true));

    act(() => uiStore.getState().select(["nd_b"]));

    expect(card("nd_a").hasAttribute("data-cited")).toBe(true);
    expect(card("nd_b").hasAttribute("data-cited")).toBe(true);
  });

  it("is not marked again by a different screen of the app that remounts the canvas", async () => {
    network.on("POST /chat", () => sseResponse([sseFrame("done", { citedNodeIds: ["nd_a"], proposal: null })]));
    await openBoard();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "hello" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
    await waitFor(() => expect(card("nd_a").hasAttribute("data-cited")).toBe(true));

    act(() => uiStore.getState().select(["nd_c"]));
    cleanup();
    await openBoard(); // the workspace mounts again with the finished reply already in the chat

    expect(card("nd_a").hasAttribute("data-cited")).toBe(false);
  });
});
