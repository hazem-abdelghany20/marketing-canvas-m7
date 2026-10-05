// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controlledSse, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { COPY } from "../../ui/copy";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode, Mark, Stroke } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { stubBrowserExport } from "./canvasStub";

const T = "2026-09-02T00:00:00.000Z";
const IMAGE = "data:image/png;base64,cG5n"; // what the stubbed canvas "encodes": the bytes "png"
const NODES: CanvasNode[] = [
  { id: "nd_a", type: "campaign", title: "Vayn linen drop", body: "", fileIds: [], x: 0, y: 0, createdAt: T, updatedAt: T },
  { id: "nd_b", type: "goal", title: "500 orders", body: "", fileIds: [], x: 600, y: 0, createdAt: T, updatedAt: T },
];
const STROKE: Stroke = { id: "stk_a", tool: "pen", color: "var(--ink-1)", width: 3, points: [0, 0, 100, 100], createdAt: T };
const MARK: Mark = { id: "mrk_a", variant: "sticky", x: 300, y: 300, body: "Reshoot the hook", color: null, createdAt: T, updatedAt: T };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function serve(content: { nodes?: CanvasNode[]; strokes?: Stroke[]; marks?: Mark[] } = { nodes: NODES, strokes: [STROKE], marks: [MARK] }) {
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, content.nodes ?? []));
  network.on("GET /strokes", () => json(200, content.strokes ?? []));
  network.on("GET /marks", () => json(200, content.marks ?? []));
  for (const p of ["/edges", "/files", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of content.nodes ?? []) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
}
const answer = (cited: string[] = ["nd_a"]) =>
  network.on("POST /chat", () =>
    sseResponse([
      sseFrame("start", { mode: "reasoner" }),
      sseFrame("token", { token: "You circled Vayn linen drop." }),
      sseFrame("done", { citedNodeIds: cited, proposal: null }),
    ]),
  );

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("group", { name: "Whiteboard tools" });
  return rendered;
}
const sendBoard = () => screen.getByRole("button", { name: "Send board to the assistant" });
const posts = () => network.callsTo("POST /chat");

describe("the send control", () => {
  it("is in the dock", async () => {
    stubBrowserExport();
    serve();
    await openBoard();

    expect(screen.getByRole("group", { name: "Whiteboard tools" }).contains(sendBoard())).toBe(true);
    expect(sendBoard().getAttribute("aria-disabled")).toBeNull();
  });

  it("is disabled, saying so, while the board is loading", async () => {
    stubBrowserExport();
    serve();
    const board = deferred<Response>();
    network.on("GET /board", () => board.promise);

    renderAt("/");

    await screen.findByRole("group", { name: "Whiteboard tools" });
    expect(sendBoard().getAttribute("aria-disabled")).toBe("true");
    expect(sendBoard().title).toBe("Waiting for the board.");
    await act(async () => board.resolve(json(200, emptyBoard)));
  });

  it.each([
    ["nothing but nodes", { nodes: NODES }],
    ["nothing at all", {}],
  ])("is disabled, asking for ink or a note, on a board with %s", async (_label, content) => {
    stubBrowserExport();
    serve(content);
    await openBoard();

    expect(sendBoard().getAttribute("aria-disabled")).toBe("true");
    expect(sendBoard().title).toBe("Draw or add a note first.");
    fireEvent.click(sendBoard());
    expect(posts()).toHaveLength(0);
  });

  it.each([
    ["ink alone", { nodes: NODES, strokes: [STROKE] }],
    ["a note alone", { nodes: NODES, marks: [MARK] }],
  ])("is available for a board with %s", async (_label, content) => {
    stubBrowserExport();
    serve(content);
    await openBoard();

    expect(sendBoard().getAttribute("aria-disabled")).toBeNull();
  });

  it("does not count a sticky nobody wrote on", async () => {
    stubBrowserExport();
    serve({ nodes: NODES, marks: [{ ...MARK, body: "  " }] });
    await openBoard();

    expect(sendBoard().getAttribute("aria-disabled")).toBe("true");
  });

  it("is disabled while a reply is still streaming, saying to wait", async () => {
    stubBrowserExport();
    serve();
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openBoard();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    expect(sendBoard().getAttribute("aria-disabled")).toBe("true");
    expect(sendBoard().title).toBe(COPY.waitForReply);
    fireEvent.click(sendBoard());
    expect(posts()).toHaveLength(1);

    await act(async () => {
      stream.push("start", { mode: "librarian" });
      stream.push("done", { citedNodeIds: [], proposal: null });
      stream.close();
    });
    await waitFor(() => expect(sendBoard().getAttribute("aria-disabled")).toBeNull());
  });
});

describe("sending the board", () => {
  it("makes a chat message that carries the picture, and asks without a mode", async () => {
    stubBrowserExport();
    serve();
    answer();
    await openBoard();

    fireEvent.click(sendBoard());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ message: "Read my markup on the board.", board: { image: IMAGE } });
  });

  it("shows the picture in your message, with its words", async () => {
    stubBrowserExport();
    serve();
    answer();
    await openBoard();

    fireEvent.click(sendBoard());

    const mine = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-chat-message="user"]');
      expect(el).toBeTruthy();
      return el!;
    });
    expect(within(mine).getByText("Read my markup on the board.")).toBeTruthy();
    const image = within(mine).getByRole("img", { name: "Your board, as sent" }) as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(IMAGE);
  });

  it("cites and highlights the nodes the reply names, through the same path as any reply", async () => {
    stubBrowserExport();
    serve();
    answer(["nd_a"]);
    await openBoard();

    fireEvent.click(sendBoard());

    await waitFor(() => expect(document.querySelector('[data-node-card="nd_a"]')!.hasAttribute("data-cited")).toBe(true));
    expect(document.querySelector('[data-node-card="nd_b"]')!.hasAttribute("data-cited")).toBe(false);
    expect(screen.getByRole("button", { name: "Vayn linen drop" })).toBeTruthy();
    expect(screen.getByText("Assistant · reasoner")).toBeTruthy();
  });

  it("opens the rail if it was folded away, so the conversation is in view", async () => {
    stubBrowserExport();
    serve();
    answer();
    await openBoard();
    act(() => uiStore.getState().setRailCollapsed(true));
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    fireEvent.click(sendBoard());

    await screen.findByRole("textbox", { name: "Message" });
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("makes no request to the board's own endpoints: only the chat", async () => {
    stubBrowserExport();
    serve();
    answer();
    await openBoard();
    const before = network.calls.length;

    fireEvent.click(sendBoard());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(network.calls.slice(before).map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["POST /chat"]);
  });
});

describe("when it fails", () => {
  it("keeps your message and its picture, shows the error on the reply with Retry, and frees the composer", async () => {
    stubBrowserExport();
    serve();
    network.on("POST /chat", () => apiError(503, "forced_failure"));
    await openBoard();

    fireEvent.click(sendBoard());

    await screen.findByText(COPY.chatReplyFailed);
    const mine = document.querySelector<HTMLElement>('[data-chat-message="user"]')!;
    expect(within(mine).getByRole("img", { name: "Your board, as sent" })).toBeTruthy();
    expect(within(mine).getByText("Read my markup on the board.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(false);
    // Free to ask again: with something typed, Send is ready (it only waits for words, not for the failed reply).
    fireEvent.change(box, { target: { value: "and now?" } });
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("sends the same picture on Retry, without drawing the board a second time", async () => {
    const stub = stubBrowserExport();
    serve();
    let attempts = 0;
    network.on("POST /chat", () =>
      ++attempts === 1
        ? apiError(503, "forced_failure")
        : sseResponse([sseFrame("start", { mode: "reasoner" }), sseFrame("token", { token: "ok" }), sseFrame("done", { citedNodeIds: [], proposal: null })]),
    );
    await openBoard();
    fireEvent.click(sendBoard());
    await screen.findByText(COPY.chatReplyFailed);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual(posts()[0]!.body);
    expect(stub.toBlobCalls).toHaveLength(1);
    expect(document.querySelectorAll('[data-chat-message="user"]')).toHaveLength(1);
  });

  it("says so, and sends nothing, when the board cannot be drawn", async () => {
    stubBrowserExport({ toBlob: (cb) => cb(null) });
    serve();
    answer();
    await openBoard();

    fireEvent.click(sendBoard());

    expect(await screen.findByText(COPY.sendBoardFailed)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(document.querySelector('[data-chat-message="user"]')).toBeNull();
    expect(sendBoard().getAttribute("aria-disabled")).toBeNull();
  });
});

describe("what it is built on", () => {
  it("uses the rasteriser of ticket 020 and has none of its own", () => {
    // (Under jsdom import.meta.url is not a file URL, so the path is made from the project root, where vitest runs.)
    const source = readFileSync(resolve(process.cwd(), "src/whiteboard/sendBoardToChat.ts"), "utf8");

    expect(source).toMatch(/from\s+["']\.\/exportPng["']/);
    expect(source).not.toMatch(/getContext|createElement\(\s*["']canvas["']\)|toDataURL|toBlob/);
  });
});
