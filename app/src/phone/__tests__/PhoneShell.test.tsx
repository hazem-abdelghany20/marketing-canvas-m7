// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import { uiStore } from "../../ui/uiStore";

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
});

const bar = () => screen.getByRole("navigation", { name: "Main" });
const tab = (name: string) => within(bar()).getByRole("button", { name });
const screenNamed = (name: string) => screen.queryByRole("region", { name });

async function openPhone(path = "/") {
  const rendered = renderAt(path);
  await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return rendered;
}

describe("the tab bar", () => {
  it("offers Trace, Board, Chat, Find and Add in that order, with Chat in the middle and raised", async () => {
    await openPhone();

    const buttons = within(bar()).getAllByRole("button");

    expect(buttons.map((button) => button.textContent?.trim())).toEqual(["Trace", "Board", "Chat", "Find", "Add"]);
    expect(buttons.filter((button) => button.hasAttribute("data-raised"))).toEqual([buttons[2]]);
  });

  it("is not drawn on a window 640px wide, where the rail and the toolbar are", async () => {
    stubViewport(640);
    renderAt("/");

    await screen.findByRole("toolbar", { name: "Canvas tools" });

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    // The tablet layout: the assistant is the floating button that opens its sheet.
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeTruthy();
  });

  it("opens on Trace, and marks the tab it shows as the current page", async () => {
    await openPhone();

    expect(tab("Trace").getAttribute("aria-current")).toBe("page");
    for (const name of ["Board", "Chat", "Find", "Add"]) expect(tab(name).getAttribute("aria-current")).toBeNull();
  });

  it("gives every tab a target at least 44px high, written into its classes", async () => {
    await openPhone();

    for (const button of within(bar()).getAllByRole("button")) {
      expect(Number(/min-h-\[(\d+)px\]/.exec(button.className)?.[1])).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("the screens", () => {
  it("shows the screen of the tab chosen, and hides the others from assistive technology", async () => {
    await openPhone();
    expect(screenNamed("Trace")).toBeTruthy();
    expect(screenNamed("Board")).toBeNull();

    fireEvent.click(tab("Board"));

    expect(screenNamed("Board")).toBeTruthy();
    expect(screenNamed("Trace")).toBeNull();
    expect(tab("Board").getAttribute("aria-current")).toBe("page");
    expect(tab("Trace").getAttribute("aria-current")).toBeNull();
  });

  it("keeps the canvas mounted, and the very same canvas, while another tab is shown", async () => {
    await openPhone();
    await waitFor(() => expect(document.querySelector(".react-flow")).not.toBeNull());
    const canvas = document.querySelector(".react-flow");

    fireEvent.click(tab("Chat"));
    fireEvent.click(tab("Find"));
    expect(document.querySelector(".react-flow")).toBe(canvas);
    fireEvent.click(tab("Board"));

    expect(document.querySelector(".react-flow")).toBe(canvas);
    expect(document.querySelectorAll("[data-node-card]").length).toBe(SEED_NODES.length);
  });

  it("makes the hidden canvas inert and see-through, so no card is found, or painted, behind another screen", async () => {
    await openPhone();
    await waitFor(() => expect(document.querySelector(".react-flow")).not.toBeNull());

    const board = document.querySelector<HTMLElement>("[data-phone-screen=board]")!;

    expect(board.hasAttribute("inert")).toBe(true);
    expect(board.style.visibility).toBe("hidden");
    // React Flow marks each node visibility: visible, which a child may do over a hidden parent; opacity it can't undo.
    expect(board.style.opacity).toBe("0");

    fireEvent.click(tab("Board"));

    expect(board.hasAttribute("inert")).toBe(false);
    expect(board.style.visibility).toBe("visible");
    expect(board.style.opacity).toBe("1");
  });

  it("shows the assistant on the Chat screen, not as a floating button or an overlay sheet", async () => {
    await openPhone();
    expect(screen.queryByRole("button", { name: "Open assistant" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    fireEvent.click(tab("Chat"));

    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Assistant" }).getAttribute("data-mode")).toBe("screen");
    expect(screen.queryByRole("button", { name: "Close assistant" })).toBeNull();
  });

  it("shows Chat, and puts focus in the composer, when the assistant is asked for from anywhere", async () => {
    await openPhone();

    act(() => uiStore.getState().openChat());

    expect(tab("Chat").getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" })));
  });

  it("shows Chat without taking focus when the board is sent to the assistant", async () => {
    await openPhone();

    act(() => uiStore.getState().revealChat());

    expect(tab("Chat").getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Message" }));
  });

  it("asks for the add menu with the Add tab, and does not move the screen", async () => {
    await openPhone();
    fireEvent.click(tab("Board"));

    fireEvent.click(tab("Add"));

    expect(uiStore.getState().addMenuOpen).toBe(true);
    expect(uiStore.getState().phoneTab).toBe("board");
    expect(tab("Board").getAttribute("aria-current")).toBe("page");
  });
});

describe("a node's detail", () => {
  it("opens over the tab bar, whichever screen is shown, and leaves that screen as it was", async () => {
    await openPhone("/node/nd_str_icp");
    const detail = await screen.findByRole("complementary", { name: "Node detail" });

    expect(bar().compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tab("Trace").getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(detail).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Node detail" })).toBeNull());
    expect(tab("Trace").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});
