// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { CONNECT_COPY } from "../../canvas/connect";
import { network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { Mark, Stroke } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { BOARD_MESSAGE } from "../../whiteboard/sendBoardToChat";
import { stubBrowserExport } from "../../whiteboard/__tests__/canvasStub";

const T = "2026-09-02T00:00:00.000Z";
const IMAGE = "data:image/png;base64,cG5n"; // what the stubbed canvas "encodes": the bytes "png"
const STROKE: Stroke = {
  id: "stk_a",
  tool: "pen",
  color: "var(--ink-1)",
  width: 3,
  points: [0, 0, 100, 100],
  createdAt: T,
};
const MARK: Mark = {
  id: "mrk_a",
  variant: "sticky",
  x: 300,
  y: 300,
  body: "Reshoot the hook",
  color: null,
  createdAt: T,
  updatedAt: T,
};
const WITH_INK = { nodes: SEED_NODES, edges: SEED_EDGES, strokes: [STROKE], marks: [MARK] };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  stubViewport(375);
  stubBrowserExport();
});
afterEach(() => {
  cleanup();
  unstubViewport();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openBoard(content: Parameters<typeof serveBoard>[0] = WITH_INK) {
  serveBoard(content);
  renderAt("/");
  const bar = await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  fireEvent.click(within(bar).getByRole("button", { name: "Board" }));
}

const toolbar = () => screen.getByRole("toolbar", { name: "Canvas tools" });
// The board's name is the button for its actions (030): the mockup has no More button.
const more = () => within(toolbar()).getByRole("button", { name: /more board actions/i });
const ask = () => within(toolbar()).getByRole("button", { name: "Ask about this" });
const menu = () => screen.getByRole("menu", { name: "Board actions" });
const item = (label: string) => within(menu()).getByRole("menuitem", { name: new RegExp(`^${label}`) });

describe("the board's top bar", () => {
  it("holds the board's name, Undo, a More menu and Ask about this, in one toolbar", async () => {
    await openBoard();

    expect(within(toolbar()).getByText("Ada's board")).toBeTruthy();
    expect(within(toolbar()).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(more().getAttribute("aria-haspopup")).toBe("menu");
    expect(ask()).toBeTruthy();
  });

  it("is on the Board and nowhere else", async () => {
    serveBoard(WITH_INK);
    renderAt("/");
    await screen.findByRole("navigation", { name: "Main" });
    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));

    expect(screen.queryByRole("toolbar", { name: "Canvas tools" })).toBeNull();
  });
});

describe("Ask about this", () => {
  it("sends the board to the assistant, and shows the Chat tab with the reply coming in", async () => {
    network.on("POST /chat", () =>
      sseResponse([
        sseFrame("start", { mode: "reasoner" }),
        sseFrame("token", { token: "You wrote a note about the hook." }),
        sseFrame("done", { citedNodeIds: [], proposal: null }),
      ]),
    );
    await openBoard();
    expect(ask().getAttribute("aria-disabled")).toBeNull();

    fireEvent.click(ask());

    await waitFor(() => expect(network.callsTo("POST /chat")).toHaveLength(1));
    expect(network.callsTo("POST /chat")[0]!.body).toEqual({ message: BOARD_MESSAGE, board: { image: IMAGE } });
    expect(uiStore.getState().phoneTab).toBe("chat");
    // A finished reply is read out once, by an announcer, with the visible copy stepping aside: so the words are there twice.
    expect((await screen.findAllByText("You wrote a note about the hook.")).length).toBeGreaterThan(0);
  });

  it("says why it can't be used on a board with nothing to read, and says it again when it is tapped", async () => {
    await openBoard({ nodes: SEED_NODES, edges: SEED_EDGES });

    expect(ask().getAttribute("aria-disabled")).toBe("true");
    expect(ask().title).toBe(COPY.drawFirst);
    fireEvent.click(ask());

    expect(network.callsTo("POST /chat")).toHaveLength(0);
    expect(uiStore.getState().toasts.map((toast) => toast.message)).toContain(COPY.drawFirst);
    expect(uiStore.getState().phoneTab).toBe("board");
  });
});

describe("the More menu", () => {
  it("offers Connect, Text, Auto-arrange, Fit to screen and Save as PNG, and Clear ink while there is ink", async () => {
    await openBoard();

    fireEvent.click(more());

    expect(more().getAttribute("aria-expanded")).toBe("true");
    const names = within(menu())
      .getAllByRole("menuitem")
      .map((el) => el.firstChild?.textContent);
    expect(names).toEqual(["Connect", "Text", "Auto-arrange", "Fit to screen", "Save as PNG", "Clear ink"]);
  });

  it("leaves out Clear ink when there is none: a control for erasing nothing is noise", async () => {
    await openBoard({ nodes: SEED_NODES, edges: SEED_EDGES });

    fireEvent.click(more());

    expect(within(menu()).queryByRole("menuitem", { name: /^Clear ink/ })).toBeNull();
    expect(within(menu()).getAllByRole("menuitem")).toHaveLength(5);
  });

  it("says in the menu, in words, why an item can't be used, since a tap shows no tooltip", async () => {
    await openBoard({});

    fireEvent.click(more());

    for (const [label, reason] of [
      ["Connect", CONNECT_COPY.needsTwo],
      ["Auto-arrange", COPY.nothingToArrange],
      ["Fit to screen", COPY.nothingToFit],
      ["Save as PNG", COPY.nothingToSave],
    ] as const) {
      expect(item(label).getAttribute("aria-disabled")).toBe("true");
      expect(item(label).textContent).toContain(reason);
    }
  });

  it("starts connect mode from Connect, closes, and shows what to pick under the bar", async () => {
    await openBoard();
    fireEvent.click(more());

    fireEvent.click(item("Connect"));

    expect(uiStore.getState().connect.active).toBe(true);
    expect(screen.queryByRole("menu", { name: "Board actions" })).toBeNull();
    const banner = await screen.findByText("Pick the node to connect from");
    expect(toolbar().parentElement!.contains(banner)).toBe(true);

    fireEvent.click(more());
    expect(item("Leave connect mode")).toBeTruthy();
  });

  it("saves the board as a picture from Save as PNG", async () => {
    const { downloads } = stubBrowserExport();
    await openBoard();
    fireEvent.click(more());

    fireEvent.click(item("Save as PNG"));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.download).toMatch(/\.png$/);
    expect(screen.queryByRole("menu", { name: "Board actions" })).toBeNull();
  });

  it("opens the confirmation from Clear ink, which is not undoable", async () => {
    await openBoard();
    fireEvent.click(more());

    fireEvent.click(item("Clear ink"));

    expect(await screen.findByRole("alertdialog", { name: COPY.clearInkTitle })).toBeTruthy();
  });

  it("closes on Escape and on a tap outside it, and gives focus back to More", async () => {
    await openBoard();

    fireEvent.click(more());
    more().focus();
    fireEvent.keyDown(menu(), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Board actions" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more()));

    fireEvent.click(more());
    fireEvent.click(document.querySelector("[data-menu-backdrop]")!);
    expect(screen.queryByRole("menu", { name: "Board actions" })).toBeNull();
  });

  it("moves between items with the arrow keys", async () => {
    await openBoard();
    fireEvent.click(more());
    await waitFor(() => expect(document.activeElement).toBe(item("Connect")));

    fireEvent.keyDown(menu(), { key: "ArrowDown" });

    expect(document.activeElement).toBe(item("Text"));
    await act(async () => {});
  });
});
