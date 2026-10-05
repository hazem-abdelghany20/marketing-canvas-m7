import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TOOLS,
  availability,
  reduceTool,
  toolForKey,
  toolHint,
  type Tool,
  type ToolContext,
} from "../toolMode";

const ALL: ToolContext = { boardReady: true, connecting: false, hasInk: true };
const ids = TOOLS.map((t) => t.id);

describe("the tools", () => {
  it("are the seven of the dock, in dock order, with the keys V P H E S T C", () => {
    expect(TOOLS.map((t) => [t.id, t.key])).toEqual([
      ["select", "V"],
      ["pen", "P"],
      ["highlighter", "H"],
      ["eraser", "E"],
      ["sticky", "S"],
      ["text", "T"],
      ["comment", "C"],
    ]);
  });

  it("are looked up by key, either case, and by nothing else", () => {
    for (const { id, key } of TOOLS) {
      expect(toolForKey(key)).toBe(id);
      expect(toolForKey(key.toLowerCase())).toBe(id);
    }
    for (const key of ["n", "l", "x", "Enter", "Escape", " ", "1"]) expect(toolForKey(key)).toBeNull();
  });
});

describe("picking a tool", () => {
  it.each(ids)("%s becomes the active tool from Select", (tool) => {
    expect(reduceTool("select", { type: "pick", tool }, ALL)).toBe(tool);
  });

  it.each(ids)("%s becomes the active tool from any other tool", (tool) => {
    for (const from of ids) expect(reduceTool(from, { type: "pick", tool }, ALL)).toBe(tool);
  });

  it("is ignored for a tool that is disabled right now", () => {
    expect(reduceTool("select", { type: "pick", tool: "pen" }, { ...ALL, connecting: true })).toBe("select");
    expect(reduceTool("pen", { type: "pick", tool: "eraser" }, { ...ALL, hasInk: false })).toBe("pen");
    expect(reduceTool("select", { type: "pick", tool: "sticky" }, { ...ALL, boardReady: false })).toBe("select");
  });
});

describe("Escape", () => {
  it.each(ids)("returns to Select from %s", (tool) => {
    expect(reduceTool(tool, { type: "escape" }, ALL)).toBe("select");
  });
});

describe("what is available", () => {
  const reasonOf = (tool: Tool, ctx: ToolContext) => availability(tool, ctx).reason;
  const enabled = (tool: Tool, ctx: ToolContext) => availability(tool, ctx).enabled;

  it("is everything once the board is there, there is ink, and nothing is being connected", () => {
    for (const tool of ids) expect(availability(tool, ALL)).toEqual({ enabled: true, reason: null });
  });

  it("is nothing while the board is in flight, Select included, with one reason for all", () => {
    for (const tool of ids) {
      expect(availability(tool, { ...ALL, boardReady: false })).toEqual({
        enabled: false,
        reason: "Waiting for the board.",
      });
    }
  });

  it("leaves Select alone while connecting, and disables every tool that draws, writes or pins", () => {
    const connecting = { ...ALL, connecting: true };
    expect(enabled("select", connecting)).toBe(true);
    for (const tool of ["pen", "highlighter", "eraser"] as const) {
      expect(availability(tool, connecting)).toEqual({ enabled: false, reason: "Finish connecting first." });
    }
    // docs/state-matrix.md § O8 and O9 add these three to the same rule.
    for (const tool of ["sticky", "text", "comment"] as const) {
      expect(availability(tool, connecting)).toEqual({ enabled: false, reason: "Finish connecting first." });
    }
  });

  it("disables only the Eraser when there is no ink", () => {
    const noInk = { ...ALL, hasInk: false };
    expect(availability("eraser", noInk)).toEqual({ enabled: false, reason: "Nothing to erase yet." });
    for (const tool of ids.filter((t) => t !== "eraser")) expect(enabled(tool, noInk)).toBe(true);
  });

  it("says waiting before it says finish connecting before it says nothing to erase", () => {
    expect(reasonOf("eraser", { boardReady: false, connecting: true, hasInk: false })).toBe("Waiting for the board.");
    expect(reasonOf("eraser", { boardReady: true, connecting: true, hasInk: false })).toBe("Finish connecting first.");
    expect(reasonOf("eraser", { boardReady: true, connecting: false, hasInk: false })).toBe("Nothing to erase yet.");
  });
});

describe("when the world changes under the active tool", () => {
  it("falls back to Select when connecting starts under a drawing tool", () => {
    expect(reduceTool("pen", { type: "context" }, { ...ALL, connecting: true })).toBe("select");
    expect(reduceTool("comment", { type: "context" }, { ...ALL, connecting: true })).toBe("select");
  });

  it("falls back to Select when the last stroke goes under the Eraser", () => {
    expect(reduceTool("eraser", { type: "context" }, { ...ALL, hasInk: false })).toBe("select");
  });

  it("keeps a tool that is still available", () => {
    expect(reduceTool("pen", { type: "context" }, { ...ALL, hasInk: false })).toBe("pen");
    expect(reduceTool("select", { type: "context" }, { ...ALL, connecting: true })).toBe("select");
  });
});

describe("the hint", () => {
  it("is nothing for Select, which is the resting state and not a mode to escape", () => {
    expect(toolHint("select")).toBeNull();
  });

  it.each(ids.filter((t) => t !== "select"))("names %s and offers Esc", (tool) => {
    const hint = toolHint(tool);
    expect(hint?.label).toBe(TOOLS.find((t) => t.id === tool)!.label);
    expect(hint?.text.length).toBeGreaterThan(8);
  });
});

describe("the reducer", () => {
  it("is pure: it imports nothing from React or the DOM", () => {
    const source = readFileSync(new URL("../toolMode.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']react/);
    expect(source).not.toMatch(/\b(document|window)\./);
  });
});
