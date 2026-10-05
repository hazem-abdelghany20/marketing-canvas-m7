// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nudgeNode } from "../../canvas/actions";
import { appStore } from "../../store";
import type { CanvasNode, Edge, NodePatch } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, serveEmptyBoard, user } from "./harness";

// The real glide is 300ms, and on a loaded machine it can be over before a test has looked at it.
// Stretching it keeps "still gliding" checks about the glide, not about how busy the machine is.
vi.mock("../../canvas/useArrangeTween", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../canvas/useArrangeTween")>()),
  ARRANGE_MS: 1500,
}));

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, type: CanvasNode["type"], title: string, x: number, y: number): CanvasNode => ({
  id,
  type,
  title,
  body: "",
  fileIds: [],
  x,
  y,
  createdAt: T,
  updatedAt: T,
});

// A chain drawn upside down and scattered: content → campaign → goal.
const ORIGINAL = {
  nd_goal: { x: 500, y: 500 },
  nd_cmp: { x: 0, y: 0 },
  nd_reel: { x: 300, y: 300 },
};
const nodes = [
  node("nd_goal", "goal", "500 orders", ORIGINAL.nd_goal.x, ORIGINAL.nd_goal.y),
  node("nd_cmp", "campaign", "Ramadan push", ORIGINAL.nd_cmp.x, ORIGINAL.nd_cmp.y),
  node("nd_reel", "content", "Reel: linen", ORIGINAL.nd_reel.x, ORIGINAL.nd_reel.y),
];
const edges: Edge[] = [
  { id: "ed_1", fromId: "nd_cmp", toId: "nd_goal", kind: "serves", label: null },
  { id: "ed_2", fromId: "nd_reel", toId: "nd_cmp", kind: "serves", label: null },
];

/** The API's copy of each node, so a PATCH answers like the real thing. */
let server: Record<string, CanvasNode> = {};

function serveBoard(options: { failFor?: string } = {}) {
  server = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, edges));
  for (const p of ["/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) {
    network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
    network.on(`PATCH /nodes/${n.id}`, (call) => {
      const patch = call.body as NodePatch;
      if (options.failFor === n.id && patch.x !== ORIGINAL[n.id as keyof typeof ORIGINAL].x) {
        return apiError(503, "forced_failure", "Down.");
      }
      server[n.id] = { ...server[n.id]!, ...patch };
      return json(200, server[n.id]);
    });
  }
}

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  // jsdom has no layout, so React Flow's animated camera move computes NaN for its dot grid
  // and React says so. That is jsdom, not the app; every other warning still shows.
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (!String(args[0]).includes("Received NaN")) error(...args);
  });
  resetApp();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  // @ts-expect-error jsdom ships no matchMedia; the stub is removed to match.
  delete window.matchMedia;
});

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  const button = await screen.findByRole("button", { name: "Auto-arrange" });
  await waitFor(() => expect(document.querySelector('[data-node-card="nd_goal"]')).toBeTruthy());
  return { ...rendered, button };
}

const stored = (id: string) => {
  const n = appStore.getState().nodes[id]!;
  return { x: n.x, y: n.y };
};

/** Where React Flow is drawing a card right now, read off its transform. */
function drawnAt(id: string) {
  const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!;
  const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const patches = () => nodes.flatMap((n) => network.callsTo(`PATCH /nodes/${n.id}`));
const settled = (label: string) => waitFor(() => expect(screen.getByText(label)).toBeTruthy());

describe("Auto-arrange control", () => {
  it("is non-interactive on a board with no nodes, and says why", async () => {
    serveEmptyBoard();
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");

    const button = screen.getByRole("button", { name: "Auto-arrange" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.title).toBe("Nothing to arrange yet.");

    fireEvent.click(button);
    expect(network.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("waits for the board before it does anything", async () => {
    const gate = deferred<Response>();
    serveBoard();
    network.on("GET /board", () => gate.promise);
    renderAt("/");

    const button = await screen.findByRole("button", { name: "Auto-arrange" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.title).toBe(COPY.loading);

    gate.resolve(json(200, emptyBoard));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Auto-arrange" }).getAttribute("aria-disabled")).toBeNull(),
    );
  });
});

describe("Auto-arrange", () => {
  it("lays the board out in layers and saves only x and y for each node that moved", async () => {
    serveBoard();
    const { button } = await openBoard();

    fireEvent.click(button);
    await settled("Arranged 3 nodes.");

    const { nd_goal, nd_cmp, nd_reel } = Object.fromEntries(nodes.map((n) => [n.id, stored(n.id)]));
    expect(nd_goal!.y).toBeLessThan(nd_cmp!.y);
    expect(nd_cmp!.y).toBeLessThan(nd_reel!.y);

    expect(patches()).toHaveLength(3);
    for (const call of patches()) expect(Object.keys(call.body as object).sort()).toEqual(["x", "y"]);
    expect(server.nd_goal).toMatchObject(nd_goal!);
  });

  it("holds the toast and the undo step back until every save has landed", async () => {
    const gate = deferred<void>();
    serveBoard();
    for (const n of nodes) {
      const answer = network.routes.get(`PATCH /nodes/${n.id}`)!;
      network.on(`PATCH /nodes/${n.id}`, async (call) => (await gate.promise, answer(call)));
    }
    const { button } = await openBoard();

    fireEvent.click(button);
    await waitFor(() => expect(patches()).toHaveLength(3));
    expect(screen.queryByText("Arranged 3 nodes.")).toBeNull();
    expect(appStore.getState().undoStack).toHaveLength(0);

    gate.resolve();
    await settled("Arranged 3 nodes.");
    expect(appStore.getState().undoStack).toHaveLength(1);
  });

  it("offers one Undo in the toast that puts every node back", async () => {
    serveBoard();
    const { button } = await openBoard();
    fireEvent.click(button);
    const toast = (await screen.findByText("Arranged 3 nodes.")).closest("[role=status]") as HTMLElement;
    await waitFor(() => expect(patches()).toHaveLength(3));
    expect(appStore.getState().undoStack).toHaveLength(1);

    fireEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      for (const n of nodes) expect(stored(n.id)).toEqual(ORIGINAL[n.id as keyof typeof ORIGINAL]);
    });
    expect(appStore.getState().undoStack).toHaveLength(0);
    expect(server.nd_goal).toMatchObject(ORIGINAL.nd_goal);
    expect(server.nd_reel).toMatchObject(ORIGINAL.nd_reel);
  });

  it("is undone, every node at once, by one Cmd/Ctrl+Z", async () => {
    serveBoard();
    const { button } = await openBoard();
    fireEvent.click(button);
    await settled("Arranged 3 nodes.");
    await waitFor(() => expect(appStore.getState().undoStack).toHaveLength(1));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      for (const n of nodes) expect(stored(n.id)).toEqual(ORIGINAL[n.id as keyof typeof ORIGINAL]);
    });
    expect(appStore.getState().undoStack).toHaveLength(0);
  });

  it("sends nothing and adds no undo step when the board is already arranged", async () => {
    serveBoard();
    const { button } = await openBoard();
    fireEvent.click(button);
    await waitFor(() => expect(patches()).toHaveLength(3));
    await waitFor(() => expect(appStore.getState().undoStack).toHaveLength(1));

    fireEvent.click(button);
    await new Promise((r) => setTimeout(r, 100));

    expect(patches()).toHaveLength(3);
    expect(appStore.getState().undoStack).toHaveLength(1);
  });

  it("leaves every node where it was, and offers Retry, when a save fails", async () => {
    serveBoard({ failFor: "nd_reel" });
    const { button } = await openBoard();

    fireEvent.click(button);
    await screen.findByText(COPY.saveFailed);

    for (const n of nodes) expect(stored(n.id)).toEqual(ORIGINAL[n.id as keyof typeof ORIGINAL]);
    expect(appStore.getState().undoStack).toHaveLength(0);
    expect(screen.queryByText("Arranged 3 nodes.")).toBeNull();

    serveBoard();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settled("Arranged 3 nodes.");
    expect(stored("nd_goal").y).toBeLessThan(stored("nd_reel").y);
  });
});

describe("Auto-arrange motion", () => {
  it("glides: on the frame after the click the cards are still at the old layout, and they arrive within the transition", async () => {
    stubReducedMotion(false);
    serveBoard();
    const { button } = await openBoard();
    expect(drawnAt("nd_goal")).toEqual(ORIGINAL.nd_goal);

    fireEvent.click(button);

    // The store already holds the new layout; the canvas has barely begun to draw it.
    const target = stored("nd_goal");
    expect(distance(target, ORIGINAL.nd_goal)).toBeGreaterThan(100);
    expect(distance(drawnAt("nd_goal"), ORIGINAL.nd_goal)).toBeLessThan(distance(drawnAt("nd_goal"), target) / 4);
    await waitFor(() => expect(drawnAt("nd_goal")).toEqual(target));
    expect(drawnAt("nd_reel")).toEqual(stored("nd_reel"));
  });

  it("ends the glide the moment a card is moved by hand, so the hand wins", async () => {
    stubReducedMotion(false);
    serveBoard();
    const { button } = await openBoard();
    fireEvent.click(button);
    expect(distance(drawnAt("nd_reel"), ORIGINAL.nd_reel)).toBeLessThan(1); // still gliding

    nudgeNode("nd_goal", 8, 0);

    await waitFor(() => expect(drawnAt("nd_goal")).toEqual(stored("nd_goal")));
    expect(drawnAt("nd_reel")).toEqual(stored("nd_reel"));
  });

  it("draws every card at the saved position once the glide is over, and at the old one after undo", async () => {
    stubReducedMotion(false);
    serveBoard();
    const { button } = await openBoard();
    fireEvent.click(button);
    await settled("Arranged 3 nodes.");
    await waitFor(() => {
      for (const n of nodes) expect(drawnAt(n.id)).toEqual(stored(n.id));
    });
    await waitFor(() => expect(appStore.getState().undoStack).toHaveLength(1));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      for (const n of nodes) expect(drawnAt(n.id)).toEqual(ORIGINAL[n.id as keyof typeof ORIGINAL]);
    });
  });

  it("is instant under prefers-reduced-motion: the cards are drawn at the new layout at once", async () => {
    stubReducedMotion(true);
    serveBoard();
    const { button } = await openBoard();

    fireEvent.click(button);

    expect(drawnAt("nd_goal")).toEqual(stored("nd_goal"));
    expect(drawnAt("nd_goal")).not.toEqual(ORIGINAL.nd_goal);
    expect(drawnAt("nd_reel")).toEqual(stored("nd_reel"));
  });
});
