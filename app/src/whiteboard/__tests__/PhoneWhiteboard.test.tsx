// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { Stroke } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { Dock } from "../Dock";
import { InkOptions } from "../InkOptions";
import { ToolHint } from "../ToolHint";
import { toolHint } from "../toolMode";
import { useToolShortcuts } from "../useToolShortcuts";

const T = "2026-09-01T00:00:00.000Z";
const stroke: Stroke = { id: "stk_1", tool: "pen", color: "#000", width: 3, points: [0, 0, 5, 5], createdAt: T };
const NAMES = ["Select", "Pen", "Highlighter", "Eraser", "Sticky", "Text", "Comment"];

function Harness() {
  useToolShortcuts(true);
  return (
    <>
      <Dock layout="bar" onClearInk={() => {}} />
      <InkOptions layout="bar" />
      <ToolHint />
    </>
  );
}

function setBoard({ ink = true, connecting = false }: { ink?: boolean; connecting?: boolean } = {}) {
  act(() => {
    appStore.setState({ boardStatus: "ready", strokes: ink ? { [stroke.id]: stroke } : {} });
    uiStore.setState({ connect: { active: connecting, sourceId: null, targetId: null } });
  });
}

beforeEach(() => {
  uiStore.getState().reset();
  appStore.getState().resetBoard();
  stubViewport(375);
  setBoard();
});
afterEach(() => {
  cleanup();
  unstubViewport();
});

const tool = (name: string) => screen.getByRole("button", { name });
const dock = () => screen.getByRole("group", { name: "Whiteboard tools" });

describe("the dock as a bar", () => {
  it("holds the seven tools in one row and nothing else: send, save and clear ink are in the board's menu", () => {
    render(<Harness />);

    const names = within(dock())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(NAMES);
    expect(dock().getAttribute("data-layout")).toBe("bar");
    for (const gone of ["Send board to the assistant", "Save as PNG", "Clear ink"]) {
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }
  });

  it("makes every tool a target at least 40px across", () => {
    render(<Harness />);

    for (const button of within(dock()).getAllByRole("button")) expect(button.className).toMatch(/!size-10/);
  });

  it("is still the same group, and keeps each tool's state and the reason it can't be used", () => {
    setBoard({ ink: false });
    render(<Harness />);

    expect(dock().getAttribute("aria-label")).toBe("Whiteboard tools");
    expect(tool("Select").getAttribute("aria-pressed")).toBe("true");
    expect(tool("Eraser").getAttribute("aria-disabled")).toBe("true");
    expect(tool("Eraser").title).toBe(COPY.nothingToErase);
  });

  it("says why a tool can't be used when it is tapped, because a touch screen has no tooltip to read", () => {
    setBoard({ ink: false });
    render(<Harness />);

    fireEvent.click(tool("Eraser"));

    expect(uiStore.getState().toasts.map((toast) => toast.message)).toContain(COPY.nothingToErase);
    expect(tool("Select").getAttribute("aria-pressed")).toBe("true"); // and the tool was not taken
  });

  it("picks a tool when it is tapped, as the key does", () => {
    render(<Harness />);

    fireEvent.click(tool("Pen"));

    expect(tool("Pen").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the ink options as a bar", () => {
  it("offers the colours and the widths while the Pen is in hand, each at least 40px across", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));

    const options = document.querySelector<HTMLElement>("[data-ink-options]")!;
    expect(options.getAttribute("data-layout")).toBe("bar");
    const colours = within(options).getByRole("radiogroup", { name: "Ink colour" });
    const widths = within(options).getByRole("radiogroup", { name: "Stroke width" });
    expect(within(colours).getAllByRole("radio")).toHaveLength(6);
    expect(within(widths).getAllByRole("radio")).toHaveLength(3);
    for (const radio of within(options).getAllByRole("radio")) expect(radio.className).toMatch(/size-10/);
  });

  it("is not there while Select is", () => {
    render(<Harness />);

    expect(document.querySelector("[data-ink-options]")).toBeNull();
  });
});

describe("the hint for a tool in hand", () => {
  it("reads for a finger, not a mouse: one draws, two move the board", () => {
    expect(toolHint("pen", true)?.text).toBe("One finger draws · two fingers pan and zoom");
    expect(toolHint("highlighter", true)?.text).toBe("One finger draws · two fingers pan and zoom");
    expect(toolHint("sticky", true)?.text).toBe("Tap to drop a sticky note");
    expect(toolHint("comment", true)?.text).toBe("Tap where the comment belongs");
    expect(toolHint("eraser", true)?.text).toBe("Drag across ink to erase a whole stroke");
    expect(toolHint("select", true)).toBeNull();
    // A mouse is still told what it was.
    expect(toolHint("pen")?.text).toBe("Draw on the board");
  });

  it("is a pill with the touch wording and a Done button on a phone, and keeps Esc on a desktop", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));

    const hint = document.querySelector<HTMLElement>("[data-tool-hint]")!;
    expect(hint.textContent).toContain("One finger draws · two fingers pan and zoom");
    const done = within(hint).getByRole("button", { name: "Put Pen away" });
    expect(done.textContent).toBe("Done");

    fireEvent.click(done);
    expect(tool("Select").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-tool-hint]")).toBeNull();

    cleanup();
    unstubViewport();
    uiStore.getState().reset();
    render(<Harness />);
    fireEvent.click(tool("Pen"));
    const desktop = document.querySelector<HTMLElement>("[data-tool-hint]")!;
    expect(desktop.textContent).toContain("Draw on the board");
    expect(within(desktop).getByRole("button", { name: "Put Pen away (Esc)" })).toBeTruthy();
  });
});
