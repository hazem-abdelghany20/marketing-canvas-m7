import type { InkTool } from "../types";

/**
 * The pen's colours, by token. A stroke stores `var(--ink-N)` rather than a hex value, so the same
 * stroke is drawn in the theme's own ink and the darkest pen is never invisible on a dark canvas.
 */
export const INK_COLORS = [
  { id: "ink-1", label: "Terracotta" },
  { id: "ink-2", label: "Teal" },
  { id: "ink-3", label: "Ochre" },
  { id: "ink-4", label: "Sage" },
  { id: "ink-5", label: "Plum" },
  { id: "ink-6", label: "Ink" },
] as const;

export type InkColorId = (typeof INK_COLORS)[number]["id"];

export const inkColorValue = (id: InkColorId) => `var(--${id})`;

/** The pen's three widths, in board units. The highlighter draws each five times wider. */
export const INK_SIZES = [
  { width: 2, label: "Thin" },
  { width: 3, label: "Medium" },
  { width: 6, label: "Thick" },
] as const;

export const HIGHLIGHTER_FACTOR = 5;
export const HIGHLIGHTER_OPACITY = 0.3;

export const strokeWidthFor = (tool: InkTool, size: number) => (tool === "highlighter" ? size * HIGHLIGHTER_FACTOR : size);
