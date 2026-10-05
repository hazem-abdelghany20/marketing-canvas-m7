// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { Stroke } from "../../types";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
// The camera is panned 100,40 and zoomed 2x, so a screen point is (client - pan) / 2 on the board.
const VIEWPORT = { x: 100, y: 40, zoom: 2 };
const board = (client: { x: number; y: number }) => ({ x: (client.x - VIEWPORT.x) / VIEWPORT.zoom, y: (client.y - VIEWPORT.y) / VIEWPORT.zoom });

// Two parallel lines on the board: A along y=0, B along y=50, each from x=0 to x=100.
const A: Stroke = { id: "stk_a", tool: "pen", color: "#a8674f", width: 3, points: [0, 0, 100, 0], createdAt: T };
const B: Stroke = { id: "stk_b", tool: "highlighter", color: "#c0a25c", width: 18, points: [0, 50, 100, 50], createdAt: T };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serve();
});
afterEach(cleanup);

function serve(strokes: Stroke[] = [A, B]) {
  network.on("GET /board", () => json(200, { ...emptyBoard, viewport: VIEWPORT }));
  for (const p of ["/nodes", "/edges", "/files", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  network.on("GET /strokes", () => json(200, strokes));
  network.on("POST /strokes", (call) => json(201, { id: "stk_new", ...(call.body as object), createdAt: T }));
  network.on("DELETE /strokes", () => json(204));
  for (const s of strokes) network.on(`DELETE /strokes/${s.id}`, () => json(204));
}

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("group", { name: "Whiteboard tools" });
  return rendered;
}

const pickTool = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const surface = () => document.querySelector<HTMLElement>("[data-ink-surface]");
const strokeEl = (id: string) => document.querySelector<SVGPathElement>(`[data-stroke-id="${id}"]`);
const liveEl = () => document.querySelector<SVGPathElement>("[data-live-stroke]");
const posts = () => network.callsTo("POST /strokes");
const deletes = (path: string) => network.callsTo(`DELETE ${path}`);

interface Pt { x: number; y: number }
const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", p: Pt) =>
  fireEvent[type](surface()!, { clientX: p.x, clientY: p.y, pointerId: 1, button: 0, buttons: type === "pointerUp" ? 0 : 1, isPrimary: true });
function drag(...path: Pt[]) {
  const [first, ...rest] = path;
  pointer("pointerDown", first!);
  for (const p of rest) pointer("pointerMove", p);
  pointer("pointerUp", rest.at(-1) ?? first!);
}

describe("Select", () => {
  it("has no ink surface at all, so the layer cannot take a pointer event from the canvas", async () => {
    await openBoard();

    expect(surface()).toBeNull();
    for (const svg of document.querySelectorAll("[data-ink-layer]")) {
      expect(getComputedStyle(svg).pointerEvents).toBe("none");
    }
  });
});

describe("the Pen", () => {
  it("makes one stroke when a drag completes, as flat board coordinates and not screen ones", async () => {
    await openBoard();
    pickTool("Pen");

    drag({ x: 300, y: 240 }, { x: 320, y: 260 }, { x: 340, y: 280 }, { x: 360, y: 300 }, { x: 400, y: 340 });

    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = posts()[0]!.body as Stroke;
    expect(body.tool).toBe("pen");
    expect(body.color).toMatch(/^var\(--ink-[1-6]\)$/);
    expect(body.width).toBe(3);
    expect(body.points.length).toBeGreaterThanOrEqual(4);
    expect(body.points.length % 2).toBe(0);
    expect(body.points.slice(0, 2)).toEqual([board({ x: 300, y: 240 }).x, board({ x: 300, y: 240 }).y]);
    expect(body.points.slice(-2)).toEqual([board({ x: 400, y: 340 }).x, board({ x: 400, y: 340 }).y]);
  });

  it("draws the live stroke before any request is made", async () => {
    const reply = deferred<Response>();
    network.on("POST /strokes", () => reply.promise);
    await openBoard();
    pickTool("Pen");

    pointer("pointerDown", { x: 300, y: 240 });
    pointer("pointerMove", { x: 340, y: 280 });
    pointer("pointerMove", { x: 380, y: 300 });

    expect(liveEl()).toBeTruthy();
    expect(liveEl()!.getAttribute("d")).toMatch(/^M/);
    expect(posts()).toHaveLength(0);

    pointer("pointerUp", { x: 380, y: 300 });

    // Let go: the stroke is on screen as a stroke while its save is still in flight.
    expect(liveEl()).toBeNull();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(3);
    await act(async () => reply.resolve(json(201, { id: "stk_new", ...(posts()[0]!.body as object), createdAt: T })));
  });

  it("does not send a point for every pixel: a long, slow drag arrives as a few points", async () => {
    await openBoard();
    pickTool("Pen");
    const path: Pt[] = Array.from({ length: 400 }, (_, i) => ({ x: 200 + i, y: 300 + Math.round(i * 0.25) }));

    drag(...path);

    await waitFor(() => expect(posts()).toHaveLength(1));
    // A straight line, however finely it was sampled, is two points.
    expect((posts()[0]!.body as Stroke).points).toHaveLength(4);
  });

  it("makes a dot of a tap, which is a stroke with the same point twice", async () => {
    await openBoard();
    pickTool("Pen");

    drag({ x: 300, y: 240 });

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]!.body as Stroke).points).toEqual([100, 100, 100, 100]);
  });

  it("keeps a stroke anchored to the board: the pen layer carries the camera's pan and zoom", async () => {
    await openBoard();

    const layer = document.querySelector('[data-ink-layer="over"] g')!;
    expect(layer.getAttribute("transform")).toBe("translate(100 40) scale(2)");
  });

  it("is chosen by the key P and drawn with it", async () => {
    await openBoard();

    fireEvent.keyDown(document.body, { key: "p" });

    expect(surface()).toBeTruthy();
    expect(surface()!.dataset.tool).toBe("pen");
  });

  it("makes a stroke only with the main button", async () => {
    await openBoard();
    pickTool("Pen");

    fireEvent.pointerDown(surface()!, { clientX: 300, clientY: 240, pointerId: 1, button: 2, buttons: 2 });
    fireEvent.pointerUp(surface()!, { clientX: 300, clientY: 240, pointerId: 1, button: 2 });

    expect(posts()).toHaveLength(0);
  });
});

describe("the Highlighter", () => {
  it("draws wider than the pen would, and sends its tool", async () => {
    await openBoard();
    pickTool("Highlighter");

    drag({ x: 300, y: 240 }, { x: 400, y: 240 });

    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = posts()[0]!.body as Stroke;
    expect(body.tool).toBe("highlighter");
    expect(body.width).toBeGreaterThan(3);
  });

  it("is translucent, where the pen is solid", async () => {
    await openBoard();

    expect(Number(strokeEl("stk_b")!.getAttribute("stroke-opacity"))).toBeLessThan(1);
    expect(Number(strokeEl("stk_a")!.getAttribute("stroke-opacity") ?? 1)).toBe(1);
  });

  it("sits in the layer beneath the node cards, and the pen in the one over them", async () => {
    await openBoard();

    expect(strokeEl("stk_b")!.closest("[data-ink-layer]")!.getAttribute("data-ink-layer")).toBe("under");
    expect(strokeEl("stk_a")!.closest("[data-ink-layer]")!.getAttribute("data-ink-layer")).toBe("over");
  });
});

describe("persisted ink", () => {
  it("renders every stroke on load in its own colour, width and place", async () => {
    await openBoard();

    const a = strokeEl("stk_a")!;
    expect(a.style.stroke).toBe("#a8674f");
    expect(a.getAttribute("stroke-width")).toBe("3");
    expect(a.getAttribute("d")).toBe("M0 0 L100 0");
    const b = strokeEl("stk_b")!;
    expect(b.style.stroke).toBe("#c0a25c");
    expect(b.getAttribute("stroke-width")).toBe("18");
    expect(b.getAttribute("d")).toBe("M0 50 L100 50");
  });

  it("draws a colour that is a token as the token, so it follows the theme", async () => {
    serve([{ ...A, color: "var(--ink-2)" }]);
    await openBoard();

    expect(strokeEl("stk_a")!.style.stroke).toBe("var(--ink-2)");
  });
});

describe("ink options", () => {
  it("appear for the Pen and the Highlighter and for no other tool", async () => {
    await openBoard();
    expect(screen.queryByRole("radiogroup", { name: "Ink colour" })).toBeNull();

    for (const name of ["Pen", "Highlighter"]) {
      pickTool(name);
      expect(screen.getByRole("radiogroup", { name: "Ink colour" })).toBeTruthy();
      expect(screen.getByRole("radiogroup", { name: "Stroke width" })).toBeTruthy();
    }
    for (const name of ["Eraser", "Sticky", "Text", "Comment", "Select"]) {
      pickTool(name);
      expect(screen.queryByRole("radiogroup", { name: "Ink colour" })).toBeNull();
    }
  });

  it("offers six colours from the ink palette and three widths, one of each chosen", async () => {
    await openBoard();
    pickTool("Pen");

    const colours = within(screen.getByRole("radiogroup", { name: "Ink colour" })).getAllByRole("radio");
    const widths = within(screen.getByRole("radiogroup", { name: "Stroke width" })).getAllByRole("radio");
    expect(colours).toHaveLength(6);
    expect(widths).toHaveLength(3);
    expect(colours.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(widths.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("changes the colour of the next stroke", async () => {
    await openBoard();
    pickTool("Pen");

    fireEvent.click(screen.getByRole("radio", { name: "Teal" }));
    expect(screen.getByRole("radio", { name: "Teal" }).getAttribute("aria-checked")).toBe("true");
    drag({ x: 300, y: 240 }, { x: 400, y: 340 });

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]!.body as Stroke).color).toBe("var(--ink-2)");
  });

  it("changes the width of the next stroke, the highlighter's staying five times wider", async () => {
    await openBoard();
    pickTool("Pen");
    fireEvent.click(screen.getByRole("radio", { name: "Thick" }));
    drag({ x: 300, y: 240 }, { x: 400, y: 340 });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]!.body as Stroke).width).toBe(6);

    pickTool("Highlighter");
    drag({ x: 300, y: 240 }, { x: 400, y: 340 });

    await waitFor(() => expect(posts()).toHaveLength(2));
    expect((posts()[1]!.body as Stroke).width).toBe(30);
  });
});

describe("the Eraser", () => {
  it("removes a whole stroke when it is clicked, and no other", async () => {
    await openBoard();
    pickTool("Eraser");

    // Board (50, 0) is on stroke A; screen = board * 2 + (100, 40).
    drag({ x: 200, y: 40 });

    expect(strokeEl("stk_a")).toBeNull();
    expect(strokeEl("stk_b")).toBeTruthy();
    await waitFor(() => expect(deletes("/strokes/stk_a")).toHaveLength(1));
    expect(deletes("/strokes/stk_b")).toHaveLength(0);
    // Never a segment of it: no stroke is created to stand in for the rest.
    expect(posts()).toHaveLength(0);
  });

  it("removes every stroke a drag crosses, in one gesture", async () => {
    await openBoard();
    pickTool("Eraser");

    drag({ x: 200, y: 36 }, { x: 200, y: 100 }, { x: 200, y: 140 });

    expect(strokeEl("stk_a")).toBeNull();
    expect(strokeEl("stk_b")).toBeNull();
    await waitFor(() => expect(deletes("/strokes/stk_a")).toHaveLength(1));
    await waitFor(() => expect(deletes("/strokes/stk_b")).toHaveLength(1));
  });

  it("does nothing on empty canvas", async () => {
    await openBoard();
    pickTool("Eraser");

    drag({ x: 600, y: 600 }, { x: 640, y: 640 });

    expect(strokeEl("stk_a")).toBeTruthy();
    expect(network.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });

  it("reaches a stroke by the width of what is drawn, not only by its centre line", async () => {
    await openBoard();
    pickTool("Eraser");

    // B is 18 wide on the board: 9 either side of y=50, so board y=57 is on it. Screen y = 57*2 + 40 = 154.
    drag({ x: 200, y: 154 });

    expect(strokeEl("stk_b")).toBeNull();
  });

  it("offers one Undo for what a gesture erased, which draws it back", async () => {
    await openBoard();
    pickTool("Eraser");
    drag({ x: 200, y: 36 }, { x: 200, y: 140 });
    await waitFor(() => expect(deletes("/strokes/stk_b")).toHaveLength(1));

    const toast = await screen.findByText("Erased 2 strokes.");
    fireEvent.click(within(toast.closest("[role]") as HTMLElement).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(posts()).toHaveLength(2));
    await waitFor(() => expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(2));
  });

  it("brings the stroke back, and offers Retry, when the delete fails", async () => {
    network.on("DELETE /strokes/stk_a", () => apiError(503, "forced_failure"));
    await openBoard();
    pickTool("Eraser");

    drag({ x: 200, y: 40 });

    await screen.findByText("Couldn't save that change. Check your connection and try again.");
    await waitFor(() => expect(strokeEl("stk_a")).toBeTruthy());
  });
});

describe("clearing the ink", () => {
  const clearButton = () => screen.getByRole("button", { name: "Clear ink" });

  it("asks first, and a Cancel changes nothing", async () => {
    await openBoard();

    fireEvent.click(clearButton());
    const dialog = screen.getByRole("alertdialog", { name: "Clear all ink?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(network.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
    expect(strokeEl("stk_a")).toBeTruthy();
  });

  it("answers Escape as Cancel", async () => {
    await openBoard();
    fireEvent.click(clearButton());

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(strokeEl("stk_a")).toBeTruthy();
  });

  it("starts on Cancel, so the safe answer is the default one", async () => {
    await openBoard();

    fireEvent.click(clearButton());

    expect(document.activeElement).toBe(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
  });

  it("removes every stroke with a single request once confirmed", async () => {
    await openBoard();

    fireEvent.click(clearButton());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear ink" }));

    expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(0);
    await waitFor(() => expect(deletes("/strokes")).toHaveLength(1));
    expect(network.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    // With no ink left the control goes, and so does the Eraser.
    expect(screen.queryByRole("button", { name: "Clear ink" })).toBeNull();
    expect(screen.getByRole("button", { name: "Eraser" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("returns the ink, with a toast saying so, when the request fails", async () => {
    network.on("DELETE /strokes", () => apiError(503, "forced_failure"));
    await openBoard();

    fireEvent.click(clearButton());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear ink" }));

    await screen.findByText("Couldn't clear the ink. Check your connection and try again.");
    expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Clear ink" })).toBeTruthy();
  });
});

describe("when saving a stroke fails", () => {
  it("leaves the stroke on screen and offers Retry, which sends it again", async () => {
    let attempts = 0;
    network.on("POST /strokes", (call) =>
      ++attempts === 1 ? apiError(503, "forced_failure") : json(201, { id: "stk_new", ...(call.body as object), createdAt: T }),
    );
    await openBoard();
    pickTool("Pen");

    drag({ x: 300, y: 240 }, { x: 400, y: 340 });

    const toast = await screen.findByText("Couldn't save that mark. Check your connection and try again.");
    expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(3);
    expect(document.querySelector("[data-stroke-unsaved]")).toBeTruthy();

    fireEvent.click(within(toast.closest("[role]") as HTMLElement).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(posts()).toHaveLength(2));
    await waitFor(() => expect(document.querySelector("[data-stroke-unsaved]")).toBeNull());
    expect(document.querySelectorAll("[data-stroke-id]")).toHaveLength(3);
    expect(posts()[1]!.body).toEqual(posts()[0]!.body);
  });
});

describe("the dock's Clear ink", () => {
  it("is offered while there is ink, and gone once there is none", async () => {
    serve([]);
    await openBoard();

    expect(screen.queryByRole("button", { name: "Clear ink" })).toBeNull();
    expect(screen.getByRole("button", { name: "Eraser" }).getAttribute("aria-disabled")).toBe("true");
  });
});
