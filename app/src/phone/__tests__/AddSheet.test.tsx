// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlledSse } from "../../api/__tests__/helpers";
import { apiError, json, network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { CanvasNode } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const made = (body: Partial<CanvasNode>): CanvasNode => ({
  id: "nd_new",
  type: "note",
  title: "",
  body: "",
  fileIds: [],
  x: 0,
  y: 0,
  createdAt: T,
  updatedAt: T,
  ...body,
});

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard({ nodes: SEED_NODES, edges: SEED_EDGES });
  stubViewport(375);
});
afterEach(() => {
  cleanup();
  unstubViewport();
  vi.restoreAllMocks();
});

async function openApp() {
  const rendered = renderAt("/");
  const nav = await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return { ...rendered, nav };
}

const addTab = () => within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Add" });
const sheet = () => screen.getByRole("dialog", { name: "Add to the board" });
const pick = (name: string | RegExp) => within(sheet()).getByRole("button", { name });
const openSheet = async () => {
  const app = await openApp();
  fireEvent.click(addTab());
  await screen.findByRole("dialog", { name: "Add to the board" });
  return app;
};

describe("the Add sheet", () => {
  it("offers a node of each type to make, a file to bring in, and a draft to ask the assistant for", async () => {
    await openSheet();

    const buttons = within(sheet()).getAllByRole("button");
    const names = ["Close", "Goal", "Strategy", "Campaign", "Content", "Note", "Import a file", "Draft in chat"];
    expect(buttons).toHaveLength(names.length);
    names.forEach((name, i) => {
      const button = buttons[i]!;
      expect(button.getAttribute("aria-label") === name || (button.textContent ?? "").startsWith(name), name).toBe(true);
    });
    // Each type says what it is for, so the first choice is an informed one.
    expect(pick(/^Goal/).textContent).toContain("Outcome with a number and a horizon");
    expect(pick(/^Strategy/).textContent).toContain("Positioning, ICP, messaging");
  });

  it("is a modal dialog, and the Add tab says it is open while it is", async () => {
    await openSheet();

    expect(sheet().getAttribute("aria-modal")).toBe("true");
    expect(addTab().getAttribute("aria-expanded")).toBe("true");
  });

  it("takes focus into itself when it opens", async () => {
    await openSheet();

    await waitFor(() => expect(sheet().contains(document.activeElement)).toBe(true));
  });
});

describe("making a node from it", () => {
  it("makes a node of the type chosen, in the middle of the board, and opens it with its title ready to be typed", async () => {
    network.on("POST /nodes", (call) => json(201, made(call.body as Partial<CanvasNode>)));
    const { router } = await openSheet();

    fireEvent.click(pick(/^Goal/));

    await waitFor(() => expect(network.callsTo("POST /nodes")).toHaveLength(1));
    const body = network.callsTo("POST /nodes")[0]!.body as { type: string; x: number; y: number };
    expect(body.type).toBe("goal");
    expect(Number.isFinite(body.x) && Number.isFinite(body.y)).toBe(true);
    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
    expect(router.state.location.state).toMatchObject({ focusTitle: true });
    expect(screen.queryByRole("dialog", { name: "Add to the board" })).toBeNull();
    const title = await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it.each([
    ["Strategy", "strategy"],
    ["Campaign", "campaign"],
    ["Content", "content"],
    ["Note", "note"],
  ])("makes a %s", async (label, type) => {
    network.on("POST /nodes", (call) => json(201, made(call.body as Partial<CanvasNode>)));
    await openSheet();

    fireEvent.click(pick(new RegExp(`^${label}`)));

    await waitFor(() => expect(network.callsTo("POST /nodes")).toHaveLength(1));
    expect((network.callsTo("POST /nodes")[0]!.body as { type: string }).type).toBe(type);
  });

  it("says it could not, and offers to try again, when the server refuses", async () => {
    network.on("POST /nodes", () => apiError(503, "forced_failure", "Down."));
    await openSheet();

    fireEvent.click(pick(/^Goal/));

    await waitFor(() => expect(uiStore.getState().toasts.at(-1)?.message).toBe(COPY.addNodeFailed));
    expect(uiStore.getState().toasts.at(-1)?.actionLabel).toBe("Retry");
  });
});

describe("closing it without making anything", () => {
  it.each([
    ["Escape", () => fireEvent.keyDown(sheet(), { key: "Escape" })],
    ["a tap on the scrim", () => fireEvent.click(document.querySelector("[data-sheet-scrim]")!)],
    ["Close", () => fireEvent.click(pick("Close"))],
  ])("closes on %s, makes nothing, and gives focus back to the Add tab", async (_how, close) => {
    await openSheet();

    close();

    expect(screen.queryByRole("dialog", { name: "Add to the board" })).toBeNull();
    expect(network.callsTo("POST /nodes")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(addTab()));
    expect(addTab().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when it is dragged down by its handle", async () => {
    await openSheet();
    const handle = document.querySelector("[data-sheet-handle]")!;
    const at = (y: number) => ({ pointerId: 1, clientX: 100, clientY: y, button: 0 });

    fireEvent.pointerDown(handle, at(300));
    fireEvent.pointerMove(handle, at(500));
    fireEvent.pointerUp(handle, at(500));

    expect(screen.queryByRole("dialog", { name: "Add to the board" })).toBeNull();
  });

  it("keeps Tab inside it: from the last control it comes round to the first", async () => {
    await openSheet();
    const controls = within(sheet()).getAllByRole("button");
    controls.at(-1)!.focus();

    fireEvent.keyDown(controls.at(-1)!, { key: "Tab" });

    expect(document.activeElement).toBe(controls[0]);
  });
});

describe("Import a file and Draft in chat", () => {
  it("opens the file picker from Import a file, and closes", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    await openSheet();

    fireEvent.click(pick(/^Import a file/));

    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Add to the board" })).toBeNull();
  });

  it("shows Chat with the composer ready from Draft in chat, and writes nothing in it", async () => {
    await openSheet();

    fireEvent.click(pick(/^Draft in chat/));

    expect(uiStore.getState().phoneTab).toBe("chat");
    const composer = (await screen.findByRole("textbox", { name: "Message" })) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(composer.value).toBe("");
  });

  it("turns Draft in chat off, saying why in its own words, while a reply is still coming", async () => {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openApp();
    act(() => {
      uiStore.getState().setChatDraft("hello");
    });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    fireEvent.click(addTab());
    const draft = await within(await screen.findByRole("dialog", { name: "Add to the board" })).findByRole("button", {
      name: /^Draft in chat/,
    });

    expect(draft.getAttribute("aria-disabled")).toBe("true");
    expect(draft.textContent).toContain(COPY.waitForReply);
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
  });
});
