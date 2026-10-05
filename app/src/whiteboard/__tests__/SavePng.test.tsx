// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode, Stroke } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { stubBrowserExport, texts } from "./canvasStub";

const T = "2026-09-02T00:00:00.000Z";
const NODE: CanvasNode = { id: "nd_a", type: "goal", title: "500 orders by Q4", body: "", fileIds: [], x: 0, y: 0, createdAt: T, updatedAt: T };
const STROKE: Stroke = { id: "stk_a", tool: "pen", color: "var(--ink-1)", width: 3, points: [0, 0, 50, 50], createdAt: T };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  document.documentElement.removeAttribute("style");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function serve(content: { nodes?: CanvasNode[]; strokes?: Stroke[] } = { nodes: [NODE] }) {
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, content.nodes ?? []));
  network.on("GET /strokes", () => json(200, content.strokes ?? []));
  for (const p of ["/edges", "/files", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of content.nodes ?? []) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
}

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("group", { name: "Whiteboard tools" });
  return rendered;
}
const save = () => screen.getByRole("button", { name: "Save as PNG" });

describe("the save control", () => {
  it("is in the dock, below the tools", async () => {
    stubBrowserExport();
    serve();
    await openBoard();

    expect(screen.getByRole("group", { name: "Whiteboard tools" }).contains(save())).toBe(true);
  });

  it("is disabled, saying why, while the board is still loading", async () => {
    stubBrowserExport();
    const board = deferred<Response>();
    serve();
    network.on("GET /board", () => board.promise);

    renderAt("/");

    await screen.findByRole("group", { name: "Whiteboard tools" });
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().title).toBe("Waiting for the board.");
    await act(async () => board.resolve(json(200, emptyBoard)));
  });

  it("is disabled on a completely empty board, with a tooltip saying there is nothing to save", async () => {
    const stub = stubBrowserExport();
    serve({});
    await openBoard();

    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().title).toBe("Nothing to save yet.");
    fireEvent.click(save());
    expect(stub.downloads).toHaveLength(0);
  });

  it.each([
    ["a node", { nodes: [NODE] }],
    ["only ink", { strokes: [STROKE] }],
  ])("is available for a board with %s on it", async (_label, content) => {
    stubBrowserExport();
    serve(content);
    await openBoard();

    expect(save().getAttribute("aria-disabled")).toBeNull();
    expect(save().title).toMatch(/PNG/i);
  });
});

describe("saving", () => {
  it("downloads a PNG named for the board", async () => {
    const stub = stubBrowserExport();
    serve();
    await openBoard();

    fireEvent.click(save());

    await waitFor(() => expect(stub.downloads).toHaveLength(1));
    expect(stub.downloads[0]).toEqual({ download: "ada-s-board-markup.png", href: "blob:board" });
    expect(stub.toBlobCalls).toEqual(["image/png"]);
    await waitFor(() => expect(stub.urls.revoked).toEqual(["blob:board"]));
  });

  it("draws the board's own content and nothing of the screen around it", async () => {
    const stub = stubBrowserExport();
    serve();
    await openBoard();

    fireEvent.click(save());

    await waitFor(() => expect(stub.downloads).toHaveLength(1));
    const drawn = texts(stub.log).join("\n");
    expect(drawn).toContain("500 orders by Q4");
    for (const chrome of ["Assistant", "Add node", "Auto-arrange", "Whiteboard tools", "Ask, or say"]) expect(drawn).not.toContain(chrome);
  });

  it("paints the current theme's canvas colour behind it, so it is not transparent", async () => {
    const stub = stubBrowserExport();
    document.documentElement.style.setProperty("--bg-canvas", "#123456");
    serve();
    await openBoard();

    fireEvent.click(save());

    await waitFor(() => expect(stub.downloads).toHaveLength(1));
    const background = stub.log.findIndex(([name]) => name === "fillRect");
    const fillStyle = stub.log.slice(0, background).filter(([name]) => name === "set fillStyle").at(-1)![1];
    expect(fillStyle).toBe("#123456");
  });

  it("makes no request to the API: it is a picture of what is already here", async () => {
    const stub = stubBrowserExport();
    serve();
    await openBoard();
    const before = network.calls.length;

    fireEvent.click(save());

    await waitFor(() => expect(stub.downloads).toHaveLength(1));
    expect(network.calls.length).toBe(before);
  });
});

describe("while it is saving", () => {
  it("shows a pending state, and a second use does not start a second export", async () => {
    let finish!: (blob: Blob | null) => void;
    const stub = stubBrowserExport({ toBlob: (cb) => (finish = cb) });
    serve();
    await openBoard();

    fireEvent.click(save());

    await waitFor(() => expect(save().getAttribute("aria-busy")).toBe("true"));
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(save().title).toBe("Saving the image…");
    fireEvent.click(save());
    fireEvent.click(save());
    expect(stub.toBlobCalls).toHaveLength(1);

    await act(async () => finish(new Blob(["png"], { type: "image/png" })));
    await waitFor(() => expect(save().getAttribute("aria-busy")).toBeNull());
    expect(save().getAttribute("aria-disabled")).toBeNull();
    expect(stub.downloads).toHaveLength(1);
  });
});

describe("when it fails", () => {
  it("says it could not save, and the control is ready to be used again", async () => {
    const stub = stubBrowserExport({ toBlob: (cb) => cb(null) });
    serve();
    await openBoard();

    fireEvent.click(save());

    expect(await screen.findByText("Couldn't save the image. Try again.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Couldn't save the image. Try again.");
    expect(stub.downloads).toHaveLength(0);
    expect(save().getAttribute("aria-busy")).toBeNull();
    expect(save().getAttribute("aria-disabled")).toBeNull();
  });
});
