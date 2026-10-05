// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deferred, emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode, Stroke } from "../../types";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, x: number): CanvasNode => ({
  id, type: "note", title: id, body: "", fileIds: [], x, y: 0, createdAt: T, updatedAt: T,
});
const nodes = [node("nd_a", 0), node("nd_b", 400)];
const stroke: Stroke = { id: "stk_1", tool: "pen", color: "#000", width: 3, points: [0, 0, 5, 5], createdAt: T };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, []));
  network.on("GET /strokes", () => json(200, [stroke]));
  for (const p of ["/files", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
});
afterEach(cleanup);

const dock = () => screen.getByRole("group", { name: "Whiteboard tools" });
const tool = (name: string) => screen.getByRole("button", { name });
const hint = () => document.querySelector<HTMLElement>("[data-tool-hint]")!;
const pressed = (name: string) => tool(name).getAttribute("aria-pressed") === "true";

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await waitFor(() => expect(document.querySelector('[data-node-card="nd_a"]')).toBeTruthy());
  return rendered;
}

describe("the dock in the workspace", () => {
  it("is on the canvas once the board has arrived, with Select active", async () => {
    await openBoard();

    expect(dock()).toBeTruthy();
    expect(pressed("Select")).toBe(true);
  });

  it("is there while the board loads, but every tool waits for it", async () => {
    const board = deferred<Response>();
    network.on("GET /board", () => board.promise);

    renderAt("/");

    await screen.findByRole("group", { name: "Whiteboard tools" });
    expect(tool("Pen").getAttribute("aria-disabled")).toBe("true");
    expect(tool("Pen").title).toBe("Waiting for the board.");

    await act(async () => board.resolve(json(200, emptyBoard)));
    await waitFor(() => expect(tool("Pen").getAttribute("aria-disabled")).toBeNull());
  });

  it("takes the tool keys once the board is ready", async () => {
    await openBoard();

    fireEvent.keyDown(document.body, { key: "h" });

    expect(pressed("Highlighter")).toBe(true);
    expect(hint().textContent).toContain("Highlighter");
  });

  it("gives C to the Comment tool and moves Connect to L", async () => {
    await openBoard();

    fireEvent.keyDown(document.body, { key: "c" });
    expect(pressed("Comment")).toBe(true);
    expect(uiStore.getState().connect.active).toBe(false);

    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "l" });

    expect(uiStore.getState().connect.active).toBe(true);
    expect(pressed("Select")).toBe(true);
  });

  it("puts the drawing tool away, and disables it, when Connect is used", async () => {
    await openBoard();
    fireEvent.click(tool("Pen"));

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(pressed("Select")).toBe(true);
    expect(tool("Pen").getAttribute("aria-disabled")).toBe("true");
    expect(tool("Pen").title).toBe("Finish connecting first.");
  });

  it("names the key in Connect's tooltip", async () => {
    await openBoard();

    expect(screen.getByRole("button", { name: "Connect" }).title).toMatch(/\bL$/);
  });

  it("does not select a tool from a key typed into the chat composer", async () => {
    await openBoard();
    const composer = screen.getByRole("textbox", { name: "Message" });
    composer.focus();

    fireEvent.keyDown(composer, { key: "p" });

    expect(pressed("Select")).toBe(true);
  });
});
