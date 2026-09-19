import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import { fixtures, loadedStore, seededRoutes } from "./fakeBackend";

const echoBoard = () => json(200, fixtures.board);

describe("setViewport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("updates the cache at once and writes PATCH /board at most once per 500ms", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /board": echoBoard });
    const writes = () => backend.callsTo("PATCH /board");

    // A continuous pan: a change every 16ms for two seconds.
    for (let t = 0; t < 2000; t += 16) {
      store.getState().setViewport({ x: t, y: 0, zoom: 1 });
      expect(store.getState().board?.viewport.x).toBe(t);
      await vi.advanceTimersByTimeAsync(16);
    }
    await vi.advanceTimersByTimeAsync(600);

    // 2000ms of motion + the trailing flush: never more than one write per window.
    expect(writes().length).toBeGreaterThanOrEqual(1);
    expect(writes().length).toBeLessThanOrEqual(5);
    expect(writes().at(-1)?.body).toEqual({ viewport: { x: 1984, y: 0, zoom: 1 } });
  });

  it("spaces every write at least 500ms from the one before", async () => {
    const sentAt: number[] = [];
    const { store } = await loadedStore({
      ...seededRoutes(),
      "PATCH /board": () => (sentAt.push(Date.now()), echoBoard()),
    });

    for (let i = 0; i < 100; i++) {
      store.getState().setViewport({ x: i, y: i, zoom: 1 });
      await vi.advanceTimersByTimeAsync(37);
    }
    await vi.advanceTimersByTimeAsync(1000);

    for (let i = 1; i < sentAt.length; i++) expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(500);
  });

  it("sends a single change once, 500ms later", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /board": echoBoard });

    store.getState().setViewport({ x: 1, y: 2, zoom: 0.5 });
    await vi.advanceTimersByTimeAsync(499);
    expect(backend.callsTo("PATCH /board")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(backend.callsTo("PATCH /board")).toHaveLength(1);
  });

  it("keeps the camera where the user put it when the write fails", async () => {
    const { store } = await loadedStore({ ...seededRoutes(), "PATCH /board": () => apiError(503, "forced_failure") });

    store.getState().setViewport({ x: 7, y: 7, zoom: 2 });
    await vi.advanceTimersByTimeAsync(500);

    expect(store.getState().board?.viewport).toEqual({ x: 7, y: 7, zoom: 2 });
    expect(store.getState().viewportSaveError?.code).toBe("forced_failure");
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("flushViewport sends a pending change immediately", async () => {
    const { store, backend } = await loadedStore({ ...seededRoutes(), "PATCH /board": echoBoard });

    store.getState().setViewport({ x: 3, y: 3, zoom: 1 });
    await store.getState().flushViewport();

    expect(backend.callsTo("PATCH /board")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(backend.callsTo("PATCH /board")).toHaveLength(1);
  });
});
