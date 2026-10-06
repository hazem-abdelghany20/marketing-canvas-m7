// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { Stroke } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { BOARD_MESSAGE } from "../../whiteboard/sendBoardToChat";
import { stubBrowserExport } from "../../whiteboard/__tests__/canvasStub";

const T = "2026-09-02T00:00:00.000Z";
const STROKE: Stroke = {
  id: "stk_a",
  tool: "pen",
  color: "var(--ink-1)",
  width: 3,
  points: [0, 0, 100, 100],
  createdAt: T,
};
const IMAGE = "data:image/png;base64,cG5n";

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

async function openChat(content: Parameters<typeof serveBoard>[0] = { nodes: SEED_NODES, edges: SEED_EDGES }) {
  serveBoard(content);
  const rendered = renderAt("/");
  const nav = await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  fireEvent.click(within(nav).getByRole("button", { name: "Chat" }));
  return rendered;
}

const strip = () => screen.getByRole("region", { name: "Board overview" });
const composer = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
const stripNode = (title: string) => within(strip()).getByRole("button", { name: new RegExp(`^${title}`) });

function answerWith(cited: string[]) {
  network.on("POST /chat", () =>
    sseResponse([
      sseFrame("start", { mode: "librarian" }),
      sseFrame("token", { token: "These speak to that." }),
      sseFrame("done", { citedNodeIds: cited, proposal: null }),
    ]),
  );
}

async function ask(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(appStore.getState().chatMessages.at(-1)?.status).toBe("done"));
}

describe("the Chat screen", () => {
  it("shows the assistant's heading, a strip of the board, the reply modes, the conversation and a composer", async () => {
    await openChat();

    expect(screen.getByRole("heading", { name: "Assistant" })).toBeTruthy();
    expect(strip()).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Reply mode" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Example prompts" })).toBeTruthy();
    expect(composer()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send the board" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("keeps the reply modes where the conversation is, once, and not again in the composer", async () => {
    await openChat();

    expect(screen.getAllByRole("radiogroup", { name: "Reply mode" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: /^Librarian/ }));
    expect(uiStore.getState().chatMode).toBe("librarian");
  });
});

describe("the strip", () => {
  it("shows the whole board as an outline, and says how many nodes, while nothing is cited", async () => {
    await openChat();

    expect(strip().getAttribute("data-strip-mode")).toBe("overview");
    expect(within(strip()).getByText(`${SEED_NODES.length} nodes`)).toBeTruthy();
    expect(within(strip()).queryAllByRole("button", { name: /^(Vayn|Reel|Email)/ })).toHaveLength(0);
  });

  it("says so when there is nothing on the board", async () => {
    await openChat({});

    expect(strip().getAttribute("data-strip-mode")).toBe("empty");
    expect(within(strip()).getByText("Nothing on the board yet.")).toBeTruthy();
  });

  it("shows what a finished reply cited, and what it is connected to, with the cited ones marked", async () => {
    answerWith(["nd_con_linenstyle", "nd_cmp_linen"]);
    await openChat();

    await ask("what serves linen?");

    await waitFor(() => expect(strip().getAttribute("data-strip-mode")).toBe("cited"));
    expect(within(strip()).getByText("2 cited")).toBeTruthy();
    expect(stripNode("Reel: 3 ways to style linen").getAttribute("data-cited")).toBe("true");
    expect(stripNode("Vayn linen drop - September").getAttribute("data-cited")).toBe("true");
    // Connected to them, not cited.
    expect(stripNode("Vayn ICP: 25-34 urban women").getAttribute("data-cited")).toBeNull();
    // Nothing to do with them: not there.
    expect(within(strip()).queryByRole("button", { name: /^Reel: the 2am hunger loop/ })).toBeNull();
  });

  it("opens a node's detail when its chip is tapped", async () => {
    answerWith(["nd_con_linenstyle"]);
    const { router } = await openChat();
    await ask("tell me about the reel");
    await waitFor(() => expect(strip().getAttribute("data-strip-mode")).toBe("cited"));

    fireEvent.click(stripNode("Vayn linen drop - September"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_cmp_linen"));
  });

  it("shows the Board tab from Open board", async () => {
    answerWith(["nd_con_linenstyle", "nd_cmp_linen"]);
    await openChat();
    await ask("what serves linen?");

    fireEvent.click(within(strip()).getByRole("button", { name: "Open board" }));

    expect(uiStore.getState().phoneTab).toBe("board");
  });

  it("offers Open board with nothing cited, too: the board is one tap away from here", async () => {
    await openChat();

    fireEvent.click(within(strip()).getByRole("button", { name: "Open board" }));

    expect(uiStore.getState().phoneTab).toBe("board");
  });
});

describe("a citation chip in a reply, on a phone", () => {
  it("shows the Board tab with that node selected, instead of closing a sheet over it", async () => {
    answerWith(["nd_cmp_ramadan"]);
    await openChat();
    await ask("what serves the Ramadan push?");

    fireEvent.click(
      within(screen.getByRole("list", { name: "Cited nodes" })).getByRole("button", { name: /Vayn Ramadan push/ }),
    );

    expect(uiStore.getState().phoneTab).toBe("board");
    expect(uiStore.getState().selectedIds).toEqual(["nd_cmp_ramadan"]);
  });
});

describe("the composer on a phone", () => {
  it("is 16px, so the browser does not zoom the page when it takes focus", async () => {
    await openChat();

    expect(composer().className).toMatch(/\btext-base\b/);
  });

  it("adds a new line on Enter, and sends nothing: Send is how a message goes", async () => {
    answerWith([]);
    await openChat();
    fireEvent.change(composer(), { target: { value: "first line" } });

    const left = fireEvent.keyDown(composer(), { key: "Enter" });

    expect(left).toBe(true); // not prevented: the textarea takes its own newline
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(network.callsTo("POST /chat")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(network.callsTo("POST /chat")).toHaveLength(1));
    expect(network.callsTo("POST /chat")[0]!.body).toEqual({ message: "first line" });
  });

  it("says why Send can't be used, as it does on a desktop, and on a tap says it again", async () => {
    await openChat();

    const send = screen.getByRole("button", { name: "Send" });
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(send.title).toBe(COPY.chatWriteFirst);
    fireEvent.click(send);

    expect(uiStore.getState().toasts.map((toast) => toast.message)).toContain(COPY.chatWriteFirst);
  });

  it("sends the board from its own button, under the dock's rules", async () => {
    network.on("POST /chat", () =>
      sseResponse([sseFrame("start", { mode: "reasoner" }), sseFrame("done", { citedNodeIds: [], proposal: null })]),
    );
    await openChat({ nodes: SEED_NODES, edges: SEED_EDGES, strokes: [STROKE] });

    fireEvent.click(screen.getByRole("button", { name: "Send the board" }));

    await waitFor(() => expect(network.callsTo("POST /chat")).toHaveLength(1));
    expect(network.callsTo("POST /chat")[0]!.body).toEqual({ message: BOARD_MESSAGE, board: { image: IMAGE } });
    expect(uiStore.getState().phoneTab).toBe("chat");
  });

  it("says why the board can't be sent when there is nothing on it to read, and again when tapped", async () => {
    await openChat();

    const board = screen.getByRole("button", { name: "Send the board" });
    expect(board.getAttribute("aria-disabled")).toBe("true");
    expect(board.title).toBe(COPY.drawFirst);
    fireEvent.click(board);

    expect(uiStore.getState().toasts.map((toast) => toast.message)).toContain(COPY.drawFirst);
    await act(async () => {});
  });
});
