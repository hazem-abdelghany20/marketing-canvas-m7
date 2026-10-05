// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { Mark } from "../../types";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
// Panned 100,40 and zoomed 2x: a screen point is (client - pan) / 2 on the board.
const VIEWPORT = { x: 100, y: 40, zoom: 2 };

const STICKY: Mark = { id: "mrk_a", variant: "sticky", x: 40, y: 60, body: "The hook is the whole reel.", color: "#c0a25c", createdAt: T, updatedAt: T };
const HEADING: Mark = { id: "mrk_b", variant: "text", x: 200, y: 20, body: "Q4: everything below", color: null, createdAt: T, updatedAt: T };

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serve();
});
afterEach(cleanup);

function serve(marks: Mark[] = [STICKY, HEADING]) {
  network.on("GET /board", () => json(200, { ...emptyBoard, viewport: VIEWPORT }));
  for (const p of ["/nodes", "/edges", "/files", "/strokes", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  network.on("GET /marks", () => json(200, marks));
  let made = 0;
  network.on("POST /marks", (call) =>
    json(201, { id: `mrk_new_${++made}`, color: null, body: "", createdAt: T, updatedAt: T, ...(call.body as object) }),
  );
  for (const mark of marks) {
    network.on(`PATCH /marks/${mark.id}`, (call) => json(200, { ...mark, ...(call.body as object) }));
    network.on(`DELETE /marks/${mark.id}`, () => json(204));
  }
}

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("group", { name: "Whiteboard tools" });
  await waitFor(() => expect(document.querySelector("[data-mark-layer]")).toBeTruthy());
  return rendered;
}

const pickTool = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const surface = () => document.querySelector<HTMLElement>("[data-mark-surface]");
const markEl = (id: string) => document.querySelector<HTMLElement>(`[data-mark-id="${id}"]`);
const allMarks = () => Array.from(document.querySelectorAll<HTMLElement>("[data-mark-id]"));
const field = (root: HTMLElement) => within(root).getByRole("textbox") as HTMLTextAreaElement;
const posts = () => network.callsTo("POST /marks");
const patches = (id: string) => network.callsTo(`PATCH /marks/${id}`);
const deletes = (id: string) => network.callsTo(`DELETE /marks/${id}`);
const drop = (at = { x: 300, y: 240 }) => fireEvent.click(surface()!, { clientX: at.x, clientY: at.y });
const newest = () => allMarks().find((el) => el.dataset.markId !== STICKY.id && el.dataset.markId !== HEADING.id)!;

/** Types into a mark and leaves it, as a person does. */
function write(root: HTMLElement, text: string) {
  const box = field(root);
  box.focus();
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
}

interface Pt { x: number; y: number }
const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", target: Element, p: Pt) =>
  fireEvent[type](target, { clientX: p.x, clientY: p.y, pointerId: 1, button: 0, buttons: type === "pointerUp" ? 0 : 1 });

describe("dropping a mark", () => {
  it("makes a sticky where the canvas is clicked, and focuses it for typing without a second click", async () => {
    await openBoard();
    pickTool("Sticky");

    drop({ x: 300, y: 240 });

    const created = newest();
    expect(created.dataset.markVariant).toBe("sticky");
    // Client (300, 240) is board (100, 100) under this camera.
    expect(created.style.left).toBe("100px");
    expect(created.style.top).toBe("100px");
    expect(created.querySelector("[data-mark-card]")).toBeTruthy();
    expect(document.activeElement).toBe(field(created));
    expect(field(created).placeholder).toBe("Type a note");
    expect(posts()).toHaveLength(0);
  });

  it("makes board text with no card behind it", async () => {
    await openBoard();
    pickTool("Text");

    drop();

    const created = newest();
    expect(created.dataset.markVariant).toBe("text");
    expect(created.querySelector("[data-mark-card]")).toBeNull();
    expect(document.activeElement).toBe(field(created));
  });

  it("has a surface for the Sticky and Text tools only, and none under Select", async () => {
    await openBoard();
    expect(surface()).toBeNull();

    for (const name of ["Sticky", "Text"]) {
      pickTool(name);
      expect(surface()).toBeTruthy();
    }
    for (const name of ["Pen", "Eraser", "Comment", "Select"]) {
      pickTool(name);
      expect(surface()).toBeNull();
    }
  });

  it("keeps the tool in hand, so the next click drops the next one", async () => {
    await openBoard();
    pickTool("Sticky");

    drop();

    expect(screen.getByRole("button", { name: "Sticky" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("is left, saved, and put away with Escape", async () => {
    await openBoard();
    pickTool("Sticky");
    drop();
    const box = field(newest());
    fireEvent.change(box, { target: { value: "Call the printer" } });

    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(posts()).toHaveLength(1));
  });
});

describe("committing a new mark", () => {
  it("sends nothing while it is being typed, and one request when the mark is left", async () => {
    await openBoard();
    pickTool("Sticky");
    drop();
    const created = newest();
    const box = field(created);

    for (const text of ["R", "Re", "Resh"]) fireEvent.change(box, { target: { value: text } });
    expect(posts()).toHaveLength(0);
    fireEvent.change(box, { target: { value: "Reshoot the hook" } });
    fireEvent.blur(box);

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ variant: "sticky", x: 100, y: 100, body: "Reshoot the hook" });
  });

  it("shows a pending indicator while the save is in flight, at full strength, and clears it with no toast", async () => {
    const reply = deferred<Response>();
    network.on("POST /marks", () => reply.promise);
    await openBoard();
    pickTool("Sticky");
    drop();
    const created = newest();

    write(created, "Reshoot the hook");

    await waitFor(() => expect(created.querySelector("[data-mark-pending]")).toBeTruthy());
    expect(created.style.opacity).toBe("");
    await act(async () => reply.resolve(json(201, { ...(posts()[0]!.body as object), id: "mrk_new_1", color: null, createdAt: T, updatedAt: T })));
    await waitFor(() => expect(document.querySelector("[data-mark-pending]")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status", { name: /saved/i })).toBeNull();
    // The mark is still there, now under the server's id.
    expect(markEl("mrk_new_1")).toBeTruthy();
  });

  it.each([["nothing", ""], ["only whitespace", "  \n "]])("discards a mark left with %s, and sends no request", async (_label, text) => {
    await openBoard();
    pickTool("Sticky");
    drop();
    const before = allMarks().length;

    write(newest(), text);

    await waitFor(() => expect(allMarks()).toHaveLength(before - 1));
    expect(posts()).toHaveLength(0);
    expect(network.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("editing a saved mark", () => {
  it("patches the text when the mark is left, and only if it changed", async () => {
    await openBoard();
    const root = markEl(STICKY.id)!;

    write(root, STICKY.body);
    expect(patches(STICKY.id)).toHaveLength(0);
    write(root, "Cut the first three seconds");

    await waitFor(() => expect(patches(STICKY.id)).toHaveLength(1));
    expect(patches(STICKY.id)[0]!.body).toEqual({ body: "Cut the first three seconds" });
  });

  it("deletes a mark whose text is emptied, and offers to undo that", async () => {
    await openBoard();

    write(markEl(HEADING.id)!, "   ");

    await waitFor(() => expect(deletes(HEADING.id)).toHaveLength(1));
    expect(markEl(HEADING.id)).toBeNull();
    expect(await screen.findByText("Note deleted.")).toBeTruthy();
  });
});

describe("dragging a mark", () => {
  const handle = (id: string) => markEl(id)!.querySelector("[data-mark-handle]")!;

  it("moves it live, then sends one patch with the final position, not one per pointer move", async () => {
    await openBoard();
    const grip = handle(STICKY.id);

    pointer("pointerDown", grip, { x: 300, y: 240 });
    pointer("pointerMove", grip, { x: 320, y: 250 });
    pointer("pointerMove", grip, { x: 350, y: 270 });
    pointer("pointerMove", grip, { x: 380, y: 300 });

    // 80px right and 60px down on screen is 40 and 30 board units at 2x.
    expect(markEl(STICKY.id)!.style.left).toBe("80px");
    expect(markEl(STICKY.id)!.style.top).toBe("90px");
    expect(patches(STICKY.id)).toHaveLength(0);

    pointer("pointerUp", grip, { x: 380, y: 300 });

    await waitFor(() => expect(patches(STICKY.id)).toHaveLength(1));
    expect(patches(STICKY.id)[0]!.body).toEqual({ x: 80, y: 90 });
  });

  it("sends nothing for a press on the handle that did not move", async () => {
    await openBoard();
    const grip = handle(STICKY.id);

    pointer("pointerDown", grip, { x: 300, y: 240 });
    pointer("pointerUp", grip, { x: 300, y: 240 });

    expect(patches(STICKY.id)).toHaveLength(0);
  });

  it("nudges by 8 board units with the arrow keys on a focused handle, one patch each, so it moves without a pointer", async () => {
    await openBoard();
    const grip = handle(STICKY.id) as HTMLElement;
    expect(grip.getAttribute("role")).toBe("button");
    expect(grip.getAttribute("aria-label")).toBe("Move note");
    grip.focus();

    fireEvent.keyDown(grip, { key: "ArrowRight" });
    fireEvent.keyDown(grip, { key: "ArrowDown" });

    await waitFor(() => expect(patches(STICKY.id)).toHaveLength(2));
    expect(patches(STICKY.id)[0]!.body).toEqual({ x: 48, y: 60 });
    expect(patches(STICKY.id)[1]!.body).toEqual({ x: 48, y: 68 });
  });

  it("does not drag from inside the text, where a drag selects it", async () => {
    await openBoard();
    const box = field(markEl(STICKY.id)!);

    pointer("pointerDown", box, { x: 300, y: 240 });
    pointer("pointerMove", box, { x: 380, y: 300 });
    pointer("pointerUp", box, { x: 380, y: 300 });

    expect(markEl(STICKY.id)!.style.left).toBe("40px");
    expect(patches(STICKY.id)).toHaveLength(0);
  });
});

describe("when a save fails", () => {
  const retry = (root: HTMLElement) => within(root).getByRole("button", { name: "Retry saving this note" });
  const SAVE_FAILED = "Couldn't save that note. Check your connection and try again.";

  it("keeps a new mark's text on screen, with Retry on the mark and a toast, and Retry sends it again", async () => {
    let attempts = 0;
    network.on("POST /marks", (call) =>
      ++attempts === 1
        ? apiError(503, "forced_failure")
        : json(201, { id: "mrk_new_1", color: null, createdAt: T, updatedAt: T, ...(call.body as object) }),
    );
    await openBoard();
    pickTool("Sticky");
    drop();
    const created = newest();

    write(created, "Reshoot the hook");

    await screen.findByText(SAVE_FAILED);
    expect(field(created).value).toBe("Reshoot the hook");
    fireEvent.click(retry(created));

    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual(posts()[0]!.body);
    await waitFor(() => expect(markEl("mrk_new_1")).toBeTruthy());
    expect(within(markEl("mrk_new_1")!).queryByRole("button", { name: "Retry saving this note" })).toBeNull();
  });

  it("keeps an edit's text on screen, with Retry on the mark, when the patch fails", async () => {
    network.on(`PATCH /marks/${STICKY.id}`, () => apiError(503, "forced_failure"));
    await openBoard();
    const root = markEl(STICKY.id)!;

    write(root, "Cut the first three seconds");

    await screen.findByText(SAVE_FAILED);
    expect(field(root).value).toBe("Cut the first three seconds");
    expect(retry(root)).toBeTruthy();
  });

  it("leaves a moved mark where it was dropped, with Retry on the mark, when the patch fails", async () => {
    network.on(`PATCH /marks/${STICKY.id}`, () => apiError(503, "forced_failure"));
    await openBoard();
    const grip = markEl(STICKY.id)!.querySelector("[data-mark-handle]")!;

    pointer("pointerDown", grip, { x: 300, y: 240 });
    pointer("pointerMove", grip, { x: 380, y: 300 });
    pointer("pointerUp", grip, { x: 380, y: 300 });

    await screen.findByText(SAVE_FAILED);
    expect(markEl(STICKY.id)!.style.left).toBe("80px");
    expect(retry(markEl(STICKY.id)!)).toBeTruthy();
  });

  it("brings a mark whose delete failed back to the canvas, and says so", async () => {
    network.on(`DELETE /marks/${STICKY.id}`, () => apiError(503, "forced_failure"));
    await openBoard();

    fireEvent.click(within(markEl(STICKY.id)!).getByRole("button", { name: "Delete note" }));

    await screen.findByText("Couldn't delete that note. Check your connection and try again.");
    await waitFor(() => expect(markEl(STICKY.id)).toBeTruthy());
  });
});

describe("deleting a mark", () => {
  it("removes it, and Undo in the toast writes it out again", async () => {
    await openBoard();

    fireEvent.click(within(markEl(STICKY.id)!).getByRole("button", { name: "Delete note" }));

    expect(markEl(STICKY.id)).toBeNull();
    await waitFor(() => expect(deletes(STICKY.id)).toHaveLength(1));
    const toast = await screen.findByText("Note deleted.");
    fireEvent.click(within(toast.closest("[role]") as HTMLElement).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ variant: "sticky", x: 40, y: 60, body: STICKY.body, color: "#c0a25c" });
  });
});

describe("persisted marks", () => {
  it("render at their stored position, with their stored variant, colour and text", async () => {
    await openBoard();

    const sticky = markEl(STICKY.id)!;
    expect(sticky.dataset.markVariant).toBe("sticky");
    expect(sticky.style.left).toBe("40px");
    expect(sticky.style.top).toBe("60px");
    expect(sticky.dataset.markColor).toBe("#c0a25c");
    expect(sticky.querySelector<HTMLElement>("[data-mark-card]")!.style.backgroundColor).toMatch(/192, ?162, ?92|#c0a25c/i);
    expect(field(sticky).value).toBe(STICKY.body);

    const heading = markEl(HEADING.id)!;
    expect(heading.dataset.markVariant).toBe("text");
    expect(heading.style.left).toBe("200px");
    expect(heading.style.top).toBe("20px");
    expect(heading.querySelector("[data-mark-card]")).toBeNull();
    expect(field(heading).value).toBe(HEADING.body);
  });

  it("use one component for both variants: the same parts, a card only for the sticky", async () => {
    await openBoard();

    for (const id of [STICKY.id, HEADING.id]) {
      const root = markEl(id)!;
      expect(root.querySelector("[data-mark-handle]")).toBeTruthy();
      expect(within(root).getByRole("button", { name: "Delete note" })).toBeTruthy();
      expect(within(root).getByRole("textbox")).toBeTruthy();
    }
  });

  it("sit in the canvas's viewport layer, above the highlighter's and beneath the cards", async () => {
    await openBoard();

    const layer = document.querySelector<HTMLElement>("[data-mark-layer]")!;
    expect(layer.closest(".react-flow__viewport-portal")).toBeTruthy();
    const ink = document.querySelector<HTMLElement>('[data-ink-layer="under"]')!;
    expect(ink.closest(".react-flow__viewport-portal")).toBe(layer.closest(".react-flow__viewport-portal"));
    expect(Number(layer.style.zIndex)).toBeGreaterThan(Number(ink.style.zIndex));
  });

  it("can be handled with Select in hand: the layer takes pointer events, the canvas keeps the rest", async () => {
    await openBoard();

    expect(document.querySelector<HTMLElement>("[data-mark-layer]")!.style.pointerEvents).toBe("none");
    expect(markEl(STICKY.id)!.style.pointerEvents).toBe("auto");
  });
});
