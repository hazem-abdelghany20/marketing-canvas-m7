// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NARROW_QUERY } from "../../lib/useMediaQuery";
import { appStore } from "../../store";
import type { CanvasNode, Edge } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { apiError, emptyBoard, json, network, renderAt, resetApp, user } from "./harness";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, type: CanvasNode["type"], title: string, x = 0): CanvasNode => ({
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

const nodes = [node("nd_goal", "goal", "500 orders", 0), node("nd_str", "strategy", "Vayn ICP", 300)];
const edges: Edge[] = [{ id: "ed_1", fromId: "nd_str", toId: "nd_goal", kind: "serves", label: null }];

function serveBoard() {
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, edges));
  for (const p of ["/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) {
    network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
    network.on(`PATCH /nodes/${n.id}`, (call) =>
      json(200, { ...appStore.getState().nodes[n.id], ...(call.body as object), updatedAt: T }),
    );
  }
}

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard();
});
afterEach(() => {
  cleanup();
  // @ts-expect-error jsdom ships no matchMedia; the stub is removed to match.
  delete window.matchMedia;
});

async function open(id: string) {
  const rendered = renderAt(`/node/${id}`);
  const panel = await screen.findByRole("complementary", { name: "Node detail" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await waitFor(() => expect(document.querySelector(`[data-node-card="${id}"]`)).toBeTruthy());
  return { ...rendered, panel };
}
const title = () => screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
const cardFor = (id: string) => document.querySelector(`[data-node-card="${id}"]`) as HTMLElement;

describe("Node detail error, S4", () => {
  it("offers to reload when the board could not be loaded behind a deep link", async () => {
    network.on("GET /board", () => apiError(503, "forced_failure"));
    renderAt("/node/nd_str");

    const panel = await screen.findByRole("complementary", { name: "Node detail" });
    await within(panel).findByText("We couldn't load this node.");
    expect(within(panel).getByRole("button", { name: "Back to canvas" })).toBeTruthy();

    network.on("GET /board", () => json(200, emptyBoard));
    fireEvent.click(within(panel).getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(title().value).toBe("Vayn ICP"));
  });

  it("closes and says the node no longer exists when a save finds it deleted, never 'changes aren't saving'", async () => {
    network.on("PATCH /nodes/nd_str", () => apiError(404, "node_not_found", "gone"));
    const { router } = await open("nd_str");

    fireEvent.change(title(), { target: { value: "Edited too late" } });
    fireEvent.blur(title());

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(uiStore.getState().toasts.map((t) => t.message)).toContain(COPY.nodeDeletedElsewhere);
    expect(screen.queryByText(COPY.autosaveFailed)).toBeNull();
  });

  it("does not lose a failed edit when the panel is closed: it asks to try the save again", async () => {
    network.on("PATCH /nodes/nd_str", () => apiError(503, "forced_failure"));
    await open("nd_str");
    fireEvent.change(title(), { target: { value: "Words I typed" } });
    fireEvent.blur(title());
    await screen.findByText(COPY.autosaveFailed);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(uiStore.getState().toasts.map((t) => t.message)).toContain(COPY.saveFailed));
    expect(uiStore.getState().toasts.find((t) => t.message === COPY.saveFailed)).toMatchObject({
      actionLabel: "Retry",
    });

    network.on("PATCH /nodes/nd_str", (call) => json(200, { ...nodes[1], ...(call.body as object) }));
    act(() =>
      uiStore
        .getState()
        .toasts.find((t) => t.message === COPY.saveFailed)!
        .onAction?.(),
    );
    await waitFor(() =>
      expect(network.callsTo("PATCH /nodes/nd_str").at(-1)!.body).toEqual({ title: "Words I typed" }),
    );
  });
});

describe("Remove connection confirmation, S4", () => {
  const trigger = () => screen.getByRole("button", { name: "Remove connection to 500 orders" });

  it("is cancelled by Escape, which does not also close the panel, and focus goes back to where it was", async () => {
    const { router } = await open("nd_str");
    fireEvent.click(trigger());
    const group = screen.getByRole("group", { name: "Remove connection to 500 orders?" });

    fireEvent.keyDown(within(group).getByRole("button", { name: "Remove" }), { key: "Escape" });

    expect(screen.queryByRole("group", { name: "Remove connection to 500 orders?" })).toBeNull();
    expect(router.state.location.pathname).toBe("/node/nd_str");
    expect(document.activeElement).toBe(trigger());
  });

  it("returns focus to the remove control when Cancel is chosen", async () => {
    await open("nd_str");
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(document.activeElement).toBe(trigger());
  });

  it("puts the question away, and keeps the control explaining why, once connect mode starts", async () => {
    await open("nd_str");
    fireEvent.click(trigger());
    expect(screen.getByRole("group", { name: "Remove connection to 500 orders?" })).toBeTruthy();

    act(() => uiStore.getState().setConnect({ active: true, sourceId: null, targetId: null }));

    expect(screen.queryByRole("group", { name: "Remove connection to 500 orders?" })).toBeNull();
    expect(trigger().getAttribute("aria-disabled")).toBe("true");
    expect(trigger().title).toBe(COPY.finishConnecting);
  });
});

describe("Node detail focus, S4", () => {
  it("takes keyboard focus when it opens, so the next Tab is inside it", async () => {
    const { panel } = await open("nd_str");

    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it("gives focus back to the node's card when it is closed", async () => {
    await open("nd_str");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(cardFor("nd_str")));
  });

  it("gives focus back to the card when closed with its button, too", async () => {
    await open("nd_str");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(document.activeElement).toBe(cardFor("nd_str")));
  });

  it("leaves the title focused for a node that was just created", async () => {
    const rendered = renderAt("/node/nd_str");
    await screen.findByRole("complementary", { name: "Node detail" });
    await act(() => rendered.router.navigate("/node/nd_str", { state: { focusTitle: true } }));

    await waitFor(() => expect(document.activeElement).toBe(title()));
  });
});

describe("Node detail below 900px", () => {
  it("steps out of the way when Connect starts, so the nodes to pick are on screen", async () => {
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
    const { panel, router } = await open("nd_str");

    fireEvent.click(within(panel).getByRole("button", { name: /^\+ Connect$/ }));

    expect(uiStore.getState().connect).toMatchObject({ active: true, sourceId: "nd_str" });
    expect(router.state.location.pathname).toBe("/");
  });
});
