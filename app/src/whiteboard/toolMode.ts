import { COPY } from "../ui/copy";

/**
 * The whiteboard's tool state machine (docs/spec.md § O7). Pure: no React, no DOM, no
 * stores. Which tool is active is client-only state and is never sent to the API.
 */

export type Tool = "select" | "pen" | "highlighter" | "eraser" | "sticky" | "text" | "comment";

export interface ToolDef {
  id: Tool;
  label: string;
  /** The shortcut, shown in capitals. Matched in either case. */
  key: string;
}

/** In dock order, top to bottom. */
export const TOOLS: readonly ToolDef[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "pen", label: "Pen", key: "P" },
  { id: "highlighter", label: "Highlighter", key: "H" },
  { id: "eraser", label: "Eraser", key: "E" },
  { id: "sticky", label: "Sticky", key: "S" },
  { id: "text", label: "Text", key: "T" },
  { id: "comment", label: "Comment", key: "C" },
];

/** What decides which tools can be used right now. */
export interface ToolContext {
  /** The board request has landed: you cannot draw on a canvas that has not arrived. */
  boardReady: boolean;
  /** Connect mode owns the canvas's drag gestures, so nothing that draws or drops can share it. */
  connecting: boolean;
  hasInk: boolean;
}

export interface ToolAvailability {
  enabled: boolean;
  /** Why not, in words for the tooltip. Null when enabled. */
  reason: string | null;
}

/** Says why a tool can't be used, if it can't. Loading beats connecting beats having no ink. */
export function availability(tool: Tool, ctx: ToolContext): ToolAvailability {
  const no = (reason: string): ToolAvailability => ({ enabled: false, reason });
  if (!ctx.boardReady) return no(COPY.loading);
  if (tool === "select") return { enabled: true, reason: null };
  if (ctx.connecting) return no(COPY.finishConnecting);
  if (tool === "eraser" && !ctx.hasInk) return no(COPY.nothingToErase);
  return { enabled: true, reason: null };
}

export type ToolAction =
  /** A tool's button or key was used. Ignored if that tool is disabled. */
  | { type: "pick"; tool: Tool }
  | { type: "escape" }
  /** The world changed (connecting began, the last stroke went): put the tool away if it can no longer be used. */
  | { type: "context" };

export function reduceTool(current: Tool, action: ToolAction, ctx: ToolContext): Tool {
  switch (action.type) {
    case "pick":
      return availability(action.tool, ctx).enabled ? action.tool : current;
    case "escape":
      return "select";
    case "context":
      return availability(current, ctx).enabled ? current : "select";
  }
}

/** The tool a key selects, or null for any other key. */
export function toolForKey(key: string): Tool | null {
  const upper = key.toUpperCase();
  return TOOLS.find((t) => t.key === upper)?.id ?? null;
}

export interface ToolHintText {
  label: string;
  text: string;
}

const HINTS: Record<Exclude<Tool, "select">, string> = {
  pen: "Draw on the board",
  highlighter: "Highlight with a wide, translucent stroke",
  eraser: "Click or drag over ink to erase a whole stroke",
  sticky: "Click to drop a sticky note",
  text: "Click to type text on the board",
  comment: "Click where the comment belongs",
};

/** What the hint pill says for a tool. Select has none: it is the resting state, not a mode to leave. */
export function toolHint(tool: Tool): ToolHintText | null {
  if (tool === "select") return null;
  return { label: TOOLS.find((t) => t.id === tool)!.label, text: HINTS[tool] };
}
