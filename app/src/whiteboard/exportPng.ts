import { edgeGeometry } from "../components/EdgeLine";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { typeLabel } from "../components/TypeChip";
import { appStore } from "../store";
import type { CanvasNode, Edge, Mark, NodeType, Stroke } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { HIGHLIGHTER_OPACITY } from "./inkPalette";
import { smoothPath } from "./strokePath";

/**
 * Save the marked-up board as a PNG.
 *
 * It is drawn straight onto a canvas from the board's own data, not photographed from the page. Drawing
 * the DOM into a canvas goes through SVG's foreignObject, which browsers disagree about (fonts, form
 * fields, CSS variables, a tainted canvas); drawing the data does not, and it leaves the dock, the chat
 * rail, the toolbar and any open overlay out by construction rather than by hiding them first. The cost
 * is that a card is redrawn here and can drift from the live one; the geometry that matters (card size,
 * edge curves, stroke paths) is shared with the canvas, not copied.
 */

/** Twice the board's own size, for legibility. */
export const EXPORT_SCALE = 2;
/** The long edge of the picture is held to this, by drawing smaller if it has to be. */
export const EXPORT_MAX_EDGE = 8192;
/** Board units of margin on every side. */
export const EXPORT_PADDING = 48;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What goes in the picture: the four layers the board has. Pins are a conversation about the board, not part of it. */
export interface BoardScene {
  nodes: CanvasNode[];
  edges: Edge[];
  strokes: Stroke[];
  marks: Mark[];
}

/** The width of `text` set in `font`, in the units of the picture. */
export type Measure = (text: string, font: string) => number;

const FONT_SANS = '"Instrument Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

// ---------------------------------------------------------------------------------------- text

/** Breaks text into lines no wider than `maxWidth`: at spaces, inside a word wider than the box, and where a line break was typed. */
export function wrapText(text: string, maxWidth: number, width: (text: string) => number): string[] {
  if (text === "") return [];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      // A word wider than the box on its own is broken where it overflows.
      let rest = word;
      while (width(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && width(rest.slice(0, cut)) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** At most `count` lines, the last one ending in an ellipsis if there was more. */
function clampLines(lines: string[], count: number, maxWidth: number, width: (text: string) => number): string[] {
  if (lines.length <= count) return lines;
  const kept = lines.slice(0, count);
  let last = kept[count - 1]!;
  while (last.length > 0 && width(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[count - 1] = `${last}…`;
  return kept;
}

// -------------------------------------------------------------------------------------- layout

const STICKY = { width: 200, padX: 12, padTop: 12, padBottom: 16, size: 13.5, weight: 400, line: 19.6 };
const BOARD_TEXT = { width: 240, padX: 8, padTop: 6, padBottom: 6, size: 17, weight: 600, line: 24.65 };

export interface MarkLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  font: string;
  lineHeight: number;
  padX: number;
  padTop: number;
}

/** Where a mark's box is and how its text breaks: the same box the canvas gives it, from its width and its words. */
export function layoutMark(mark: Mark, measure: Measure): MarkLayout {
  const spec = mark.variant === "sticky" ? STICKY : BOARD_TEXT;
  const font = `${spec.weight} ${spec.size}px ${FONT_SANS}`;
  const lines = wrapText(mark.body, spec.width - 2 * spec.padX, (text) => measure(text, font));
  return {
    x: mark.x,
    y: mark.y,
    width: spec.width,
    height: spec.padTop + Math.max(1, lines.length) * spec.line + spec.padBottom,
    lines,
    font,
    lineHeight: spec.line,
    padX: spec.padX,
    padTop: spec.padTop,
  };
}

const hasText = (mark: Mark) => mark.body.trim() !== "";

/** The box that holds everything on the board, or null when there is nothing. */
export function sceneBounds(scene: BoardScene, measure: Measure): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number, width: number, height: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };

  for (const node of scene.nodes) take(node.x, node.y, CARD_WIDTH, CARD_HEIGHT);
  for (const stroke of scene.strokes) {
    const reach = stroke.width / 2;
    for (let i = 0; i + 1 < stroke.points.length; i += 2) take(stroke.points[i]! - reach, stroke.points[i + 1]! - reach, reach * 2, reach * 2);
  }
  for (const mark of scene.marks.filter(hasText)) {
    const layout = layoutMark(mark, measure);
    take(layout.x, layout.y, layout.width, layout.height);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

export interface ExportSize {
  width: number;
  height: number;
  /** How many picture pixels one board unit is: 2, or less when the long edge would pass the cap. */
  scale: number;
}

/** The picture's size in pixels: the board and its margin at 2x, drawn smaller if that would pass 8192 on the long edge. */
export function exportSize(bounds: Bounds, options: { scale?: number; maxEdge?: number; padding?: number } = {}): ExportSize {
  const { scale: wanted = EXPORT_SCALE, maxEdge = EXPORT_MAX_EDGE, padding = EXPORT_PADDING } = options;
  const logicalWidth = bounds.width + 2 * padding;
  const logicalHeight = bounds.height + 2 * padding;
  const scale = Math.min(wanted, maxEdge / Math.max(logicalWidth, logicalHeight));
  return { width: Math.round(logicalWidth * scale), height: Math.round(logicalHeight * scale), scale };
}

// ------------------------------------------------------------------------------------- palette

export interface Palette {
  canvas: string;
  elevated: string;
  primary: string;
  muted: string;
  subtle: string;
  edgeServes: string;
  edgeRelates: string;
  nodes: Record<NodeType, string>;
  stickyDefault: string;
  stickyInk: string;
  /** A stroke or mark colour: a token resolves against the theme, any other colour is itself. */
  resolve: (color: string) => string;
}

const TOKEN = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/;

/** A colour that may be a `var(--token)`, resolved against the theme through `getVar`. */
export function resolveColor(color: string, getVar: (name: string) => string): string {
  const token = TOKEN.exec(color.trim());
  if (!token) return color;
  return getVar(token[1]!).trim() || getVar("--fg-primary").trim();
}

/** Every colour the picture is drawn in, read from the theme's tokens as they are right now. */
export function readPalette(getVar: (name: string) => string): Palette {
  const v = (name: string) => getVar(name).trim();
  return {
    canvas: v("--bg-canvas"),
    elevated: v("--bg-elevated"),
    primary: v("--fg-primary"),
    muted: v("--fg-muted"),
    subtle: v("--border-subtle"),
    edgeServes: v("--edge-serves"),
    edgeRelates: v("--edge-relates"),
    nodes: {
      goal: v("--node-goal"),
      strategy: v("--node-strategy"),
      campaign: v("--node-campaign"),
      content: v("--node-content"),
      asset: v("--node-asset"),
      note: v("--node-note"),
    },
    stickyDefault: v("--sticky-1"),
    stickyInk: v("--sticky-fg"),
    resolve: (color) => resolveColor(color, getVar),
  };
}

// ---------------------------------------------------------------------------------- drawing

export interface Frame {
  /** The board region the picture shows, margin included, in board units. */
  bounds: Bounds;
  scale: number;
  /** The picture's size in pixels. */
  width: number;
  height: number;
}

type Ctx = CanvasRenderingContext2D;
type MakePath = (d: string) => Path2D;

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStroke(ctx: Ctx, stroke: Stroke, palette: Palette, makePath: MakePath) {
  ctx.strokeStyle = palette.resolve(stroke.color);
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
  ctx.setLineDash([]);
  ctx.stroke(makePath(smoothPath(stroke.points)));
  ctx.globalAlpha = 1;
}

function drawMark(ctx: Ctx, mark: Mark, palette: Palette, measure: Measure) {
  const layout = layoutMark(mark, measure);
  const sticky = mark.variant === "sticky";
  if (sticky) {
    ctx.fillStyle = palette.resolve(mark.color ?? "var(--sticky-1)") || palette.stickyDefault;
    roundedRect(ctx, layout.x, layout.y, layout.width, layout.height, 3);
    ctx.fill();
  }
  ctx.fillStyle = sticky ? palette.stickyInk : palette.primary;
  ctx.font = layout.font;
  ctx.textBaseline = "top";
  layout.lines.forEach((line, i) => ctx.fillText(line, layout.x + layout.padX, layout.y + layout.padTop + i * layout.lineHeight));
}

function drawEdge(ctx: Ctx, edge: Edge, nodes: Map<string, CanvasNode>, palette: Palette, makePath: MakePath) {
  const from = nodes.get(edge.fromId);
  const to = nodes.get(edge.toId);
  if (!from || !to) return;
  const geometry = edgeGeometry(
    { x: from.x, y: from.y, width: CARD_WIDTH, height: CARD_HEIGHT },
    { x: to.x, y: to.y, width: CARD_WIDTH, height: CARD_HEIGHT },
  );
  const serves = edge.kind === "serves";
  ctx.strokeStyle = serves ? palette.edgeServes : palette.edgeRelates;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.setLineDash(serves ? [] : [5, 5]);
  ctx.stroke(makePath(geometry.d));
  if (serves) ctx.fill(makePath(geometry.arrow));
  ctx.setLineDash([]);
}

function drawNode(ctx: Ctx, node: CanvasNode, palette: Palette, measure: Measure) {
  const { x, y } = node;
  // A border is the card's colour drawn one unit inside a slightly larger card in the border colour.
  ctx.fillStyle = palette.subtle;
  roundedRect(ctx, x, y, CARD_WIDTH, CARD_HEIGHT, 9);
  ctx.fill();
  ctx.fillStyle = palette.elevated;
  roundedRect(ctx, x + 1, y + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 8);
  ctx.fill();

  ctx.save();
  roundedRect(ctx, x + 1, y + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 8);
  ctx.clip();
  ctx.fillStyle = palette.nodes[node.type];
  ctx.fillRect(x, y, 4, CARD_HEIGHT);
  ctx.restore();

  const left = x + 15;
  const textWidth = CARD_WIDTH - 15 - 13;
  ctx.textBaseline = "top";
  ctx.fillStyle = palette.nodes[node.type];
  ctx.beginPath();
  ctx.arc(left + 3.5, y + 17, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.muted;
  ctx.font = `400 9.5px ${FONT_MONO}`;
  ctx.fillText(typeLabel(node.type).toUpperCase(), left + 12, y + 12);

  const titleFont = `600 14.5px ${FONT_SANS}`;
  const title = clampLines(wrapText(node.title.trim() || "Untitled", textWidth, (t) => measure(t, titleFont)), 2, textWidth, (t) => measure(t, titleFont));
  ctx.fillStyle = palette.primary;
  ctx.font = titleFont;
  title.forEach((line, i) => ctx.fillText(line, left, y + 28 + i * 18.5));

  const bodyFont = `400 12.5px ${FONT_SANS}`;
  const body = clampLines(wrapText(node.body, textWidth, (t) => measure(t, bodyFont)), 2, textWidth, (t) => measure(t, bodyFont));
  ctx.fillStyle = palette.muted;
  ctx.font = bodyFont;
  body.forEach((line, i) => ctx.fillText(line, left, y + 28 + title.length * 18.5 + 5 + i * 17.5));
}

/**
 * Draws the board into `ctx` the way the canvas stacks it: the highlighter, then the marks, then the edges and
 * the cards, then the pen over the lot. The background is the theme's canvas colour, painted first, so the
 * picture is never transparent.
 */
export function drawScene(ctx: Ctx, scene: BoardScene, palette: Palette, frame: Frame, makePath: MakePath, measure: Measure) {
  ctx.save();
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.setTransform(frame.scale, 0, 0, frame.scale, -frame.bounds.x * frame.scale, -frame.bounds.y * frame.scale);

  for (const stroke of scene.strokes) if (stroke.tool === "highlighter") drawStroke(ctx, stroke, palette, makePath);
  for (const mark of scene.marks) if (hasText(mark)) drawMark(ctx, mark, palette, measure);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const edge of scene.edges) drawEdge(ctx, edge, byId, palette, makePath);
  for (const node of scene.nodes) drawNode(ctx, node, palette, measure);
  for (const stroke of scene.strokes) if (stroke.tool !== "highlighter") drawStroke(ctx, stroke, palette, makePath);
  ctx.restore();
}

// ---------------------------------------------------------------------------------- rendering

export interface RenderDeps {
  createCanvas?: () => HTMLCanvasElement;
  createPath?: MakePath;
  readVar?: (name: string) => string;
  /** Pixels per board unit; 2 to save, less to send. */
  scale?: number;
  maxEdge?: number;
}

const rootVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);

/** Draws the board and encodes it as a PNG. Rejects for an empty board, or if the browser cannot encode the picture. */
export function renderBoardPng(scene: BoardScene, deps: RenderDeps = {}): Promise<Blob> {
  const canvas = deps.createCanvas?.() ?? document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("This browser cannot draw the image."));
  const measure: Measure = (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  const content = sceneBounds(scene, measure);
  if (!content) return Promise.reject(new Error("There is nothing on the board to draw."));
  const size = exportSize(content, { scale: deps.scale, maxEdge: deps.maxEdge });
  const bounds = {
    x: content.x - EXPORT_PADDING,
    y: content.y - EXPORT_PADDING,
    width: content.width + 2 * EXPORT_PADDING,
    height: content.height + 2 * EXPORT_PADDING,
  };
  // Resizing clears the canvas and its state, so it comes before anything is drawn.
  canvas.width = size.width;
  canvas.height = size.height;

  drawScene(
    ctx,
    scene,
    readPalette(deps.readVar ?? rootVar),
    { bounds, scale: size.scale, width: size.width, height: size.height },
    deps.createPath ?? ((d) => new Path2D(d)),
    measure,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode the image."))), "image/png"),
  );
}

/** "Q4 planning" → "q4-planning-markup.png". */
export function pngFileName(boardName: string): string {
  const slug = boardName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "board"}-markup.png`;
}

/** What is on the board right now, as the picture takes it: unsaved ink and marks too, and no empty draft. */
export function currentScene(): BoardScene {
  const { nodes, edges, strokes, marks } = appStore.getState();
  return {
    nodes: Object.values(nodes),
    edges: Object.values(edges),
    strokes: Object.values(strokes),
    marks: Object.values(marks).filter(hasText),
  };
}

/** Whether there is anything to put in a picture. */
export function boardHasContent(state: ReturnType<typeof appStore.getState>): boolean {
  return Object.keys(state.nodes).length > 0 || Object.keys(state.strokes).length > 0 || Object.values(state.marks).some(hasText);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Save: draws the board and downloads it. Only one at a time; a second use while one is running does nothing. A
 * failure says so and leaves the control ready to try again. Makes no request: the picture is of what is here.
 */
export async function saveBoardPng(): Promise<boolean> {
  if (uiStore.getState().exporting) return false;
  uiStore.getState().setExporting(true);
  try {
    const blob = await renderBoardPng(currentScene());
    download(blob, pngFileName(appStore.getState().board?.name ?? ""));
    return true;
  } catch {
    uiStore.getState().toast({ message: COPY.saveImageFailed, tone: "danger" });
    return false;
  } finally {
    uiStore.getState().setExporting(false);
  }
}
