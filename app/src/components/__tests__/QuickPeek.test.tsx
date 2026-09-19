// @vitest-environment jsdom
import { ReactFlowProvider } from "@xyflow/react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appStore } from "../../store";
import { byId } from "../../store/records";
import { uiStore } from "../../ui/uiStore";
import { PEEK_GAP, placePeek, QuickPeek } from "../QuickPeek";
import { makeNode } from "./cards";

const view = { width: 1000, height: 700 };
const peek = { width: 250, height: 160 };
const card = { width: 236, height: 132 };

describe("placePeek", () => {
  it("sits to the right of a node that has room", () => {
    const placed = placePeek({ left: 100, top: 200, ...card }, peek, view);
    expect(placed).toEqual({ side: "right", left: 100 + card.width + PEEK_GAP, top: 200 });
  });

  it("flips to the left rather than leave the viewport", () => {
    const placed = placePeek({ left: 700, top: 200, ...card }, peek, view);
    expect(placed.side).toBe("left");
    expect(placed.left + peek.width).toBe(700 - PEEK_GAP);
    expect(placed.left).toBeGreaterThanOrEqual(0);
  });

  it("stays inside the viewport vertically", () => {
    expect(placePeek({ left: 100, top: 650, ...card }, peek, view).top).toBe(view.height - peek.height - PEEK_GAP);
    expect(placePeek({ left: 100, top: -80, ...card }, peek, view).top).toBe(PEEK_GAP);
  });
});

describe("QuickPeek", () => {
  beforeEach(() => {
    uiStore.getState().reset();
    appStore.getState().resetBoard();
  });
  afterEach(cleanup);

  function show(nodes = [makeNode({ id: "nd_1", title: "Solo" })], selected = ["nd_1"]) {
    act(() => {
      appStore.setState({ nodes: byId(nodes) });
      uiStore.getState().select(selected);
    });
    const onConnect = vi.fn();
    render(
      <MemoryRouter>
        <ReactFlowProvider>
          <QuickPeek onConnect={onConnect} />
        </ReactFlowProvider>
      </MemoryRouter>,
    );
    return { onConnect };
  }

  it("renders beside a selected node with its title, type and excerpt", () => {
    show([makeNode({ id: "nd_1", type: "goal", title: "500 orders" })]);
    const dialog = screen.getByRole("dialog", { name: "Quick look: 500 orders" });
    expect(dialog.textContent).toContain("Goal");
    expect(dialog.textContent).toContain("No description yet");
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
  });

  it("makes 'Connect from here' non-interactive, with a reason, when the node is the only one", () => {
    const { onConnect } = show();
    const connect = screen.getByRole("button", { name: "Connect from here" });
    expect(connect.getAttribute("aria-disabled")).toBe("true");
    expect(connect.title).toBe("Add another node to connect to.");
    act(() => connect.click());
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("lets a node connect once there is another to connect to", () => {
    const { onConnect } = show([makeNode({ id: "nd_1", title: "A" }), makeNode({ id: "nd_2", title: "B" })]);
    const connect = screen.getByRole("button", { name: "Connect from here" });
    expect(connect.getAttribute("aria-disabled")).toBeNull();
    act(() => connect.click());
    expect(onConnect).toHaveBeenCalledWith("nd_1");
  });

  it("stays away while nothing, or more than one node, is selected", () => {
    show([makeNode({ id: "nd_1" }), makeNode({ id: "nd_2" })], ["nd_1", "nd_2"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
