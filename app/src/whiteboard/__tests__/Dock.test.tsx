// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appStore } from "../../store";
import { uiStore } from "../../ui/uiStore";
import type { Stroke } from "../../types";
import { Dock } from "../Dock";
import { ToolHint } from "../ToolHint";
import { useToolShortcuts } from "../useToolShortcuts";

const T = "2026-09-01T00:00:00.000Z";
const stroke: Stroke = { id: "stk_1", tool: "pen", color: "#000", width: 3, points: [0, 0, 5, 5], createdAt: T };

function Harness({ onClearInk }: { onClearInk?: () => void }) {
  useToolShortcuts(true);
  return (
    <>
      <Dock onClearInk={onClearInk} />
      <ToolHint />
      <input aria-label="A field" />
      <textarea aria-label="A text box" />
    </>
  );
}

function setBoard(patch: { ready?: boolean; ink?: boolean; connecting?: boolean }) {
  const { ready = true, ink = true, connecting = false } = patch;
  act(() => {
    appStore.setState({ boardStatus: ready ? "ready" : "loading", strokes: ink ? { [stroke.id]: stroke } : {} });
    uiStore.setState({ connect: { active: connecting, sourceId: null, targetId: null } });
  });
}

beforeEach(() => {
  uiStore.getState().reset();
  appStore.getState().resetBoard();
  setBoard({});
});
afterEach(cleanup);

const tool = (name: string) => screen.getByRole("button", { name });
const queryHint = () => document.querySelector<HTMLElement>("[data-tool-hint]");
const hint = () => queryHint()!;
const pressed = (name: string) => tool(name).getAttribute("aria-pressed") === "true";
const press = (key: string, target: Element = document.body, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key, ...init });
const NAMES = ["Select", "Pen", "Highlighter", "Eraser", "Sticky", "Text", "Comment"];

describe("the dock", () => {
  it("holds the seven tools, in order, with Select visibly selected", () => {
    render(<Harness />);

    const dock = screen.getByRole("group", { name: "Whiteboard tools" });
    const names = within(dock)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names.slice(0, 7)).toEqual(NAMES);
    expect(pressed("Select")).toBe(true);
    for (const name of NAMES.slice(1)) expect(pressed(name)).toBe(false);
  });

  it("names each tool's key in its tooltip", () => {
    render(<Harness />);

    const keys: Record<string, string> = {
      Select: "V", Pen: "P", Highlighter: "H", Eraser: "E", Sticky: "S", Text: "T", Comment: "C",
    };
    for (const [name, key] of Object.entries(keys)) expect(tool(name).title).toMatch(new RegExp(`\\b${key}$`));
  });

  it("selects a tool when its button is used, and only that one", () => {
    render(<Harness />);

    fireEvent.click(tool("Highlighter"));

    expect(pressed("Highlighter")).toBe(true);
    expect(pressed("Select")).toBe(false);
    expect(uiStore.getState().tool).toBe("highlighter");
  });
});

describe("the keys", () => {
  it.each([
    ["v", "Select"], ["p", "Pen"], ["h", "Highlighter"], ["e", "Eraser"],
    ["s", "Sticky"], ["t", "Text"], ["c", "Comment"],
  ])("%s selects %s outside a text field", (key, name) => {
    render(<Harness />);

    press(key === "v" ? "p" : "v"); // somewhere else first, so every key has to move it
    press(key);

    expect(pressed(name)).toBe(true);
    expect(NAMES.filter((n) => pressed(n))).toEqual([name]);
  });

  it("answers capital letters too", () => {
    render(<Harness />);

    press("P", document.body, { shiftKey: true });

    expect(pressed("Pen")).toBe(true);
  });

  it.each(["input", "textarea"])("leaves the tool alone while focus is in a %s, and lets the letter be typed", (kind) => {
    render(<Harness />);
    const field = screen.getByLabelText(kind === "input" ? "A field" : "A text box");
    field.focus();

    const typed = fireEvent.keyDown(field, { key: "p" });

    expect(pressed("Select")).toBe(true);
    // fireEvent returns false when something called preventDefault; the character must go through.
    expect(typed).toBe(true);
  });

  it("does not take a letter that is part of a shortcut", () => {
    render(<Harness />);

    press("p", document.body, { metaKey: true });
    press("p", document.body, { ctrlKey: true });
    press("p", document.body, { altKey: true });

    expect(pressed("Select")).toBe(true);
  });

  it("ignores a key for a tool that is disabled: no ink, no Eraser", () => {
    setBoard({ ink: false });
    render(<Harness />);

    press("e");

    expect(pressed("Select")).toBe(true);
    expect(pressed("Eraser")).toBe(false);
  });

  it("ignores the tool keys while the board is in flight", () => {
    setBoard({ ready: false });
    render(<Harness />);

    press("p");

    expect(uiStore.getState().tool).toBe("select");
  });
});

describe("Escape", () => {
  it.each(NAMES.slice(1))("returns to Select from %s", (name) => {
    render(<Harness />);
    fireEvent.click(tool(name));

    press("Escape");

    expect(pressed("Select")).toBe(true);
    expect(pressed(name)).toBe(false);
  });

  it("leaves a key that something else has already used alone", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));
    const used = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    used.preventDefault();

    act(() => void document.body.dispatchEvent(used));

    expect(pressed("Pen")).toBe(true);
  });

  it("does not swallow Escape when Select is already active", () => {
    render(<Harness />);

    expect(press("Escape")).toBe(true);
  });
});

describe("the hint", () => {
  it("shows no pill while Select is active", () => {
    render(<Harness />);

    expect(queryHint()).toBeNull();
  });

  it.each([["Pen", "Draw"], ["Highlighter", "Highlight"], ["Eraser", "Erase"], ["Sticky", "sticky"], ["Text", "text"], ["Comment", "comment"]])(
    "names %s and offers Esc",
    (name, word) => {
      render(<Harness />);

      fireEvent.click(tool(name));

      expect(hint().textContent).toContain(name);
      expect(hint().textContent?.toLowerCase()).toContain(word.toLowerCase());
      expect(within(hint()).getByRole("button", { name: /esc/i })).toBeTruthy();
    },
  );

  it("is dismissed by its Esc button, which returns to Select", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));

    fireEvent.click(within(hint()).getByRole("button", { name: /esc/i }));

    expect(pressed("Select")).toBe(true);
    expect(queryHint()).toBeNull();
  });
});

describe("what is disabled", () => {
  const disabled = (name: string) => tool(name).getAttribute("aria-disabled") === "true";

  it("is every tool while the board request is in flight, each saying why", () => {
    setBoard({ ready: false });
    render(<Harness />);

    for (const name of NAMES) {
      expect(disabled(name)).toBe(true);
      expect(tool(name).title).toBe("Waiting for the board.");
    }
  });

  it("does nothing when a disabled tool is used", () => {
    setBoard({ ready: false });
    render(<Harness />);

    fireEvent.click(tool("Pen"));

    expect(uiStore.getState().tool).toBe("select");
  });

  it("is Pen, Highlighter and Eraser while connect mode is on", () => {
    setBoard({ connecting: true });
    render(<Harness />);

    for (const name of ["Pen", "Highlighter", "Eraser"]) {
      expect(disabled(name)).toBe(true);
      expect(tool(name).title).toBe("Finish connecting first.");
    }
    expect(disabled("Select")).toBe(false);
  });

  it("does not let the tool keys through while connecting", () => {
    setBoard({ connecting: true });
    render(<Harness />);

    press("p");

    expect(pressed("Select")).toBe(true);
  });

  it("puts a drawing tool away when connecting begins under it", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));

    setBoard({ connecting: true });

    expect(pressed("Select")).toBe(true);
    expect(queryHint()).toBeNull();
  });

  it("is the Eraser alone when there is no ink, and Clear ink is absent rather than disabled", () => {
    setBoard({ ink: false });
    render(<Harness onClearInk={() => {}} />);

    expect(disabled("Eraser")).toBe(true);
    expect(tool("Eraser").title).toBe("Nothing to erase yet.");
    for (const name of NAMES.filter((n) => n !== "Eraser")) expect(disabled(name)).toBe(false);
    expect(screen.queryByRole("button", { name: "Clear ink" })).toBeNull();
  });

  it("puts the Eraser away when the last stroke is gone", () => {
    render(<Harness />);
    fireEvent.click(tool("Eraser"));

    setBoard({ ink: false });

    expect(pressed("Select")).toBe(true);
  });

  it("offers Clear ink once there is ink, and calls the handler it is given", () => {
    const onClearInk = vi.fn();
    render(<Harness onClearInk={onClearInk} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear ink" }));

    expect(onClearInk).toHaveBeenCalledTimes(1);
    expect(disabled("Eraser")).toBe(false);
  });
});

describe("what stays client-side", () => {
  it("never reaches the API: selecting tools makes no request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<Harness />);

    for (const name of NAMES) fireEvent.click(tool(name));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("clears the selection when a tool is picked, so no quick-peek floats over an inert canvas", () => {
    uiStore.getState().select(["nd_1"]);
    render(<Harness />);

    fireEvent.click(tool("Pen"));

    expect(uiStore.getState().selectedIds).toEqual([]);
  });

  it("is back at Select after the UI state is reset", () => {
    render(<Harness />);
    fireEvent.click(tool("Pen"));

    act(() => uiStore.getState().reset());

    expect(uiStore.getState().tool).toBe("select");
  });
});
