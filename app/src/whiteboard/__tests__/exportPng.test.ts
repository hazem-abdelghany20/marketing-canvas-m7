import { describe, expect, it, vi } from "vitest";
import { edgeGeometry } from "../../components/EdgeLine";
import { CARD_HEIGHT, CARD_WIDTH } from "../../components/NodeCard";
import type { CanvasNode, Edge, Mark, Stroke } from "../../types";
import {
  EXPORT_MAX_EDGE,
  EXPORT_PADDING,
  drawScene,
  exportSize,
  layoutMark,
  pngFileName,
  readPalette,
  renderBoardPng,
  resolveColor,
  sceneBounds,
  wrapText,
  type BoardScene,
} from "../exportPng";
import { FakePath2D, fakeCanvas, styleAt, texts } from "./canvasStub";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, x: number, y: number, extra: Partial<CanvasNode> = {}): CanvasNode => ({
  id, type: "campaign", title: `Node ${id}`, body: `About ${id}`, fileIds: [], x, y, createdAt: T, updatedAt: T, ...extra,
});
const stroke = (id: string, tool: Stroke["tool"], points: number[], extra: Partial<Stroke> = {}): Stroke => ({
  id, tool, color: "#a14a3a", width: 4, points, createdAt: T, ...extra,
});
const mark = (id: string, variant: Mark["variant"], x: number, y: number, body: string, color: string | null = null): Mark => ({
  id, variant, x, y, body, color, createdAt: T, updatedAt: T,
});
const edge = (id: string, fromId: string, toId: string, kind: Edge["kind"] = "serves"): Edge => ({ id, fromId, toId, kind, label: null });

/** Each character is 7 wide, as in the recording context. */
const measure = (text: string) => text.length * 7;
const EMPTY: BoardScene = { nodes: [], edges: [], strokes: [], marks: [] };

const LIGHT: Record<string, string> = {
  "--bg-canvas": " #f2eee7", "--bg-elevated": "#ffffff", "--fg-primary": "#252118", "--fg-muted": "#6f675d",
  "--border-subtle": "#e4ded4", "--edge-serves": "#9a9184", "--edge-relates": "#c2b9ab",
  "--node-goal": "#a8674f", "--node-strategy": "#6f7f5c", "--node-campaign": "#a3853f",
  "--node-content": "#5c7f8a", "--node-asset": "#7d6b8f", "--node-note": "#8a7f6d",
  "--sticky-1": "#f0d78d", "--sticky-fg": "#252118", "--ink-2": "#3d6b6f", "--ink-1": "#a14a3a",
};
const DARK: Record<string, string> = { ...LIGHT, "--bg-canvas": "#1b1916", "--bg-elevated": "#2a2621", "--fg-primary": "#f0ebe2", "--ink-2": "#6fa8a6" };
const palette = readPalette((name) => LIGHT[name] ?? "");

describe("wrapText", () => {
  const m = (s: string) => s.length * 10;

  it("breaks at spaces so no line is wider than the box", () => {
    expect(wrapText("one two three", 100, m)).toEqual(["one two", "three"]);
  });

  it("breaks a word that is wider than the box on its own", () => {
    expect(wrapText("abcdefghijklmnop", 100, m)).toEqual(["abcdefghij", "klmnop"]);
  });

  it("keeps the line breaks that were typed, blank lines included", () => {
    expect(wrapText("a\n\nb", 100, m)).toEqual(["a", "", "b"]);
  });

  it("is nothing for nothing", () => {
    expect(wrapText("", 100, m)).toEqual([]);
  });
});

describe("layoutMark", () => {
  it("is 200 wide for a sticky and 240 for board text, at the mark's own position", () => {
    expect(layoutMark(mark("a", "sticky", 40, 60, "hi"), measure)).toMatchObject({ x: 40, y: 60, width: 200 });
    expect(layoutMark(mark("b", "text", 10, 20, "hi"), measure)).toMatchObject({ x: 10, y: 20, width: 240 });
  });

  it("grows with its text, a line at a time", () => {
    const short = layoutMark(mark("a", "sticky", 0, 0, "hi"), measure);
    const long = layoutMark(mark("a", "sticky", 0, 0, "word ".repeat(60)), measure);

    expect(long.lines.length).toBeGreaterThan(short.lines.length);
    expect(long.height).toBeGreaterThan(short.height);
  });
});

describe("sceneBounds", () => {
  it("is nothing for a board with nothing on it", () => {
    expect(sceneBounds(EMPTY, measure)).toBeNull();
  });

  it("is the card for a board with one node", () => {
    expect(sceneBounds({ ...EMPTY, nodes: [node("a", 100, 200)] }, measure)).toEqual({ x: 100, y: 200, width: CARD_WIDTH, height: CARD_HEIGHT });
  });

  it("takes in a stroke by its width, not only its centre line", () => {
    const bounds = sceneBounds({ ...EMPTY, strokes: [stroke("s", "pen", [0, 0, 100, 50], { width: 10 })] }, measure)!;

    expect(bounds).toEqual({ x: -5, y: -5, width: 110, height: 60 });
  });

  it("takes in a mark by the box its text fills", () => {
    const sticky = mark("m", "sticky", 500, 400, "hello");
    const layout = layoutMark(sticky, measure);

    const bounds = sceneBounds({ ...EMPTY, marks: [sticky] }, measure)!;

    expect(bounds).toMatchObject({ x: 500, y: 400, width: layout.width });
    // A sum of line heights is not exact in floating point.
    expect(bounds.height).toBeCloseTo(layout.height, 6);
  });

  it("is the union of everything on the board", () => {
    const bounds = sceneBounds(
      { ...EMPTY, nodes: [node("a", 0, 0), node("b", 1000, 800)], strokes: [stroke("s", "pen", [-200, 50, 10, 60], { width: 4 })] },
      measure,
    )!;

    expect(bounds.x).toBe(-202);
    expect(bounds.x + bounds.width).toBe(1000 + CARD_WIDTH);
    expect(bounds.y + bounds.height).toBe(800 + CARD_HEIGHT);
  });

  it("leaves out a mark with no text: that is a draft nobody wrote on", () => {
    const bounds = sceneBounds({ ...EMPTY, nodes: [node("a", 0, 0)], marks: [mark("m", "sticky", 9000, 9000, "  ")] }, measure)!;

    expect(bounds.width).toBe(CARD_WIDTH);
  });
});

describe("exportSize", () => {
  it("is twice the board plus a margin all round, at 2x", () => {
    const size = exportSize({ x: 0, y: 0, width: 1000, height: 500 });

    expect(size).toEqual({ width: (1000 + 2 * EXPORT_PADDING) * 2, height: (500 + 2 * EXPORT_PADDING) * 2, scale: 2 });
  });

  it("is held to 8192 on the long edge by drawing smaller, keeping the proportions", () => {
    const wide = exportSize({ x: 0, y: 0, width: 6000, height: 1000 });

    expect(wide.width).toBe(EXPORT_MAX_EDGE);
    expect(wide.scale).toBeLessThan(2);
    expect(wide.height).toBe(Math.round((1000 + 2 * EXPORT_PADDING) * wide.scale));
    const tall = exportSize({ x: 0, y: 0, width: 800, height: 9000 });
    expect(tall.height).toBe(EXPORT_MAX_EDGE);
    expect(tall.width).toBeLessThan(EXPORT_MAX_EDGE);
  });

  it("does not shrink a board that is already within the cap", () => {
    expect(exportSize({ x: 0, y: 0, width: 3900, height: 100 }).scale).toBe(2);
  });
});

describe("the palette", () => {
  it("reads every colour the picture needs from the theme's tokens, trimmed", () => {
    expect(palette.canvas).toBe("#f2eee7");
    expect(palette.nodes.goal).toBe("#a8674f");
    expect(palette.stickyInk).toBe("#252118");
  });

  it("follows the theme: the same read against the dark tokens gives the dark canvas", () => {
    expect(readPalette((name) => DARK[name] ?? "").canvas).toBe("#1b1916");
  });

  it("resolves a stroke colour that is a token, and passes any other colour through", () => {
    expect(resolveColor("var(--ink-2)", (name) => LIGHT[name] ?? "")).toBe("#3d6b6f");
    expect(resolveColor("var(--ink-2)", (name) => DARK[name] ?? "")).toBe("#6fa8a6");
    expect(resolveColor("#a8674f", () => "")).toBe("#a8674f");
  });

  it("falls back to the primary ink for a token it has never heard of", () => {
    expect(resolveColor("var(--nope)", (name) => LIGHT[name] ?? "")).toBe("#252118");
  });
});

describe("drawScene", () => {
  const scene: BoardScene = {
    nodes: [node("a", 0, 0, { title: "Linen drop", body: "Carousel and reel" }), node("b", 400, 300, { title: "Ramadan push", type: "goal" })],
    edges: [edge("e1", "a", "b"), edge("e2", "b", "a", "relates-to")],
    strokes: [
      stroke("pen", "pen", [10, 10, 200, 10], { color: "var(--ink-2)", width: 3 }),
      stroke("hl", "highlighter", [10, 80, 200, 80], { color: "#c0a25c", width: 18 }),
    ],
    marks: [mark("st", "sticky", 100, 400, "Reshoot the hook", "#c0a25c"), mark("tx", "text", 0, 600, "Q4 plan")],
  };
  const frame = { bounds: { x: -50, y: -50, width: 700, height: 800 }, scale: 2, width: 1400, height: 1600 };

  function run() {
    const { ctx, log } = fakeCanvas();
    const paths: string[] = [];
    drawScene(ctx, scene, palette, frame, (d) => (paths.push(d), new FakePath2D(d) as unknown as Path2D), measure);
    return { log, paths };
  }

  it("fills the whole picture with the canvas colour first, so the background is never transparent", () => {
    const { log } = run();

    const firstFill = log.find(([name]) => name === "fillRect")!;
    expect(firstFill.slice(1)).toEqual([0, 0, 1400, 1600]);
    expect(styleAt(log, "fillRect", 0)).toBe(palette.canvas);
  });

  it("draws every node's title, and every mark's text", () => {
    const { log } = run();

    const drawn = texts(log).join("\n");
    for (const words of ["Linen drop", "Ramadan push", "Reshoot the hook", "Q4 plan"]) expect(drawn).toContain(words);
  });

  it("draws nothing that is not on the board: no toolbar, dock or chat rail text", () => {
    const { log } = run();

    const drawn = texts(log).join("\n");
    for (const chrome of ["Add", "Connect", "Search", "Auto-arrange", "Assistant", "Undo", "Fit", "Pen", "Eraser"]) {
      expect(drawn).not.toContain(chrome);
    }
  });

  it("strokes each piece of ink in its own resolved colour and width", () => {
    const { log } = run();

    const strokes = log.map((entry, i) => [entry, i] as const).filter(([[name]]) => name === "stroke");
    expect(strokes).toHaveLength(2 + 2); // two pieces of ink, two edges
    expect(styleAt(log, "stroke", 0, "strokeStyle")).toBeDefined();
    const colours = log.filter(([name]) => name === "set strokeStyle").map(([, value]) => value);
    expect(colours).toContain("#3d6b6f");
    expect(colours).toContain("#c0a25c");
    const widths = log.filter(([name]) => name === "set lineWidth").map(([, value]) => value);
    expect(widths).toContain(3);
    expect(widths).toContain(18);
  });

  it("draws the highlighter translucent, and puts the opacity back after it", () => {
    const { log } = run();

    const alphas = log.filter(([name]) => name === "set globalAlpha").map(([, value]) => value);
    expect(alphas).toContain(0.3);
    expect(alphas.at(-1)).toBe(1);
  });

  it("draws a sticky as a card in its colour, with its text in the sticky ink", () => {
    const { log } = run();

    const fills = log.filter(([name]) => name === "set fillStyle").map(([, value]) => value);
    expect(fills).toContain("#c0a25c");
    expect(fills).toContain(palette.stickyInk);
  });

  it("draws the edges from the same geometry as the canvas does, dashed for relates-to", () => {
    const { log, paths } = run();

    const a = { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT };
    const b = { x: 400, y: 300, width: CARD_WIDTH, height: CARD_HEIGHT };
    expect(paths).toContain(edgeGeometry(a, b).d);
    expect(paths).toContain(edgeGeometry(b, a).d);
    expect(log.some(([name, dash]) => name === "setLineDash" && Array.isArray(dash) && dash.length === 2)).toBe(true);
  });

  it("stacks the layers as the canvas does: highlighter, marks, nodes, then the pen over the lot", () => {
    const { log } = run();

    const at = (matches: (entry: (typeof log)[number]) => boolean) => log.findIndex(matches);
    const highlighter = at(([name, value]) => name === "set strokeStyle" && value === "#c0a25c");
    const sticky = at(([name, text]) => name === "fillText" && text === "Reshoot the hook");
    const card = at(([name, text]) => name === "fillText" && text === "Linen drop");
    const pen = at(([name, value]) => name === "set strokeStyle" && value === "#3d6b6f");
    expect(highlighter).toBeGreaterThan(-1);
    expect(highlighter).toBeLessThan(sticky);
    expect(sticky).toBeLessThan(card);
    expect(card).toBeLessThan(pen);
  });

  it("skips an edge whose node is not on the board", () => {
    const { ctx, log } = fakeCanvas();
    const paths: string[] = [];

    drawScene(ctx, { ...scene, edges: [edge("ghost", "a", "nope")] }, palette, frame, (d) => (paths.push(d), new FakePath2D(d) as unknown as Path2D), measure);

    expect(paths.filter((d) => d.startsWith("M0") || d.includes("C"))).toEqual([]);
    expect(log.length).toBeGreaterThan(0);
  });
});

describe("renderBoardPng", () => {
  const withNode: BoardScene = { ...EMPTY, nodes: [node("a", 0, 0)] };
  const deps = (canvas: HTMLCanvasElement) => ({
    createCanvas: () => canvas,
    createPath: (d: string) => new FakePath2D(d) as unknown as Path2D,
    readVar: (name: string) => LIGHT[name] ?? "",
  });

  it("sizes the picture to the board and its margin at 2x, not to the window", async () => {
    const { canvas } = fakeCanvas();

    await renderBoardPng(withNode, deps(canvas));

    expect(canvas.width).toBe((CARD_WIDTH + 2 * EXPORT_PADDING) * 2);
    expect(canvas.height).toBe((CARD_HEIGHT + 2 * EXPORT_PADDING) * 2);
  });

  it("resolves a PNG", async () => {
    const { canvas } = fakeCanvas();

    const blob = await renderBoardPng(withNode, deps(canvas));

    expect(blob.type).toBe("image/png");
  });

  it("rejects when the browser cannot encode the picture", async () => {
    const { canvas } = fakeCanvas((cb) => cb(null));

    await expect(renderBoardPng(withNode, deps(canvas))).rejects.toThrow();
  });

  it("rejects for a board with nothing on it, which has nothing to draw", async () => {
    const { canvas } = fakeCanvas();

    await expect(renderBoardPng(EMPTY, deps(canvas))).rejects.toThrow();
  });

  it("can be asked for a smaller picture, for sending rather than saving", async () => {
    const { canvas } = fakeCanvas();

    await renderBoardPng(withNode, { ...deps(canvas), scale: 1, maxEdge: 1600 });

    expect(canvas.width).toBe(CARD_WIDTH + 2 * EXPORT_PADDING);
  });

  it("takes the theme's own canvas colour for its background", async () => {
    const { canvas, log } = fakeCanvas();
    vi.stubGlobal("Path2D", FakePath2D);

    await renderBoardPng(withNode, { ...deps(canvas), readVar: (name) => DARK[name] ?? "" });

    expect(styleAt(log, "fillRect", 0)).toBe("#1b1916");
  });
});

describe("pngFileName", () => {
  it.each([
    ["Q4 planning", "q4-planning-markup.png"],
    ["Ada's board", "ada-s-board-markup.png"],
    ["  Marketing   Canvas  ", "marketing-canvas-markup.png"],
    ["", "board-markup.png"],
    ["***", "board-markup.png"],
  ])("names a board %j as %s", (name, file) => {
    expect(pngFileName(name)).toBe(file);
  });
});
