// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import { SEED_ANNOTATIONS, SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import { uiStore } from "../../ui/uiStore";
import { renderAt, resetApp, serveBoard, user } from "./harness";

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard({ nodes: SEED_NODES, edges: SEED_EDGES, annotations: SEED_ANNOTATIONS });
});
afterEach(() => {
  cleanup();
  unstubViewport();
});

async function openNode(id = "nd_str_icp") {
  const rendered = renderAt(`/node/${id}`);
  const panel = await screen.findByRole("complementary", { name: "Node detail" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await waitFor(() => expect(within(panel).getByRole("textbox", { name: "Title" })).toBeTruthy());
  return { ...rendered, panel };
}

describe("a node's detail on a phone", () => {
  beforeEach(() => stubViewport(375));

  it("is a sheet from the bottom, with a handle, rounded at the top, never taller than 92% of the screen", async () => {
    const { panel } = await openNode();

    expect(panel.getAttribute("data-sheet")).toBe("bottom");
    expect(panel.className).toMatch(/rounded-t-/);
    expect(panel.className).toMatch(/max-h-\[92dvh\]/);
    expect(panel.className).toMatch(/bottom-0/);
    expect(panel.querySelector("[data-sheet-handle]")).not.toBeNull();
  });

  it("has a scrim behind it, and a tap on that closes it", async () => {
    const { router } = await openNode();

    fireEvent.click(document.querySelector("[data-sheet-scrim]")!);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByRole("complementary", { name: "Node detail" })).toBeNull();
  });

  it("closes when it is dragged down by its handle", async () => {
    const { router, panel } = await openNode();
    const handle = panel.querySelector("[data-sheet-handle]")!;
    const at = (y: number) => ({ pointerId: 1, clientX: 100, clientY: y, button: 0 });

    fireEvent.pointerDown(handle, at(200));
    fireEvent.pointerMove(handle, at(420));
    fireEvent.pointerUp(handle, at(420));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("closes on Close and on Escape, as the side panel does", async () => {
    const first = await openNode();
    fireEvent.click(within(first.panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(first.router.state.location.pathname).toBe("/"));
    cleanup();

    const second = await openNode();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(second.router.state.location.pathname).toBe("/"));
  });

  it("shows the Board, with the node selected and the sheet gone, from Show on board", async () => {
    const { router, panel } = await openNode();

    fireEvent.click(within(panel).getByRole("button", { name: "Show on board" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(uiStore.getState().phoneTab).toBe("board");
    expect(uiStore.getState().selectedIds).toEqual(["nd_str_icp"]);
  });

  it("shows Chat, with a question about the node waiting in the composer, not sent, from Ask about it", async () => {
    const { router, panel } = await openNode();

    fireEvent.click(within(panel).getByRole("button", { name: "Ask about it" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(uiStore.getState().phoneTab).toBe("chat");
    expect(uiStore.getState().chatDraft).toBe("Tell me about “Vayn ICP: 25-34 urban women”.");
    const composer = (await screen.findByRole("textbox", { name: "Message" })) as HTMLTextAreaElement;
    expect(composer.value).toBe("Tell me about “Vayn ICP: 25-34 urban women”.");
    expect(appStore.getState().chatMessages).toHaveLength(0);
  });

  it("makes every field in it 16px, so the browser does not zoom the page to a field", async () => {
    const { panel } = await openNode();

    for (const field of [
      within(panel).getByRole("textbox", { name: "Title" }),
      within(panel).getByRole("textbox", { name: "Description" }),
      within(panel).getByRole("textbox", { name: "New annotation" }),
    ]) {
      expect(field.className, field.getAttribute("aria-label") ?? "").toMatch(/\bmax-\[639px\]:text-base\b/);
    }
  });
});

describe("a node's detail on a wider screen", () => {
  it("is the side panel it was: no scrim, no handle, and no extra actions", async () => {
    stubViewport(1280);
    const { panel } = await openNode();

    expect(panel.getAttribute("data-sheet")).toBeNull();
    expect(panel.querySelector("[data-sheet-handle]")).toBeNull();
    expect(document.querySelector("[data-sheet-scrim]")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Show on board" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Ask about it" })).toBeNull();
  });

  it("is the full-width sheet it was between 640px and 900px, not the bottom sheet", async () => {
    stubViewport(700);
    const { panel } = await openNode();

    expect(panel.getAttribute("data-sheet")).toBeNull();
    expect(panel.className).toMatch(/max-\[899px\]:w-full/);
  });
});
