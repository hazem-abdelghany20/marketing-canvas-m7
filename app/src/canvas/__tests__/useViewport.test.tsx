// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appStore } from "../../store";
import type { Viewport } from "../../types";
import { clampViewport, clampZoom, MAX_ZOOM, MIN_ZOOM, useViewport, VIEWPORT_SETTLE_MS } from "../useViewport";

const board = (viewport: Viewport) => ({ id: "bd_1", name: "B", viewport });
const stored = () => appStore.getState().board?.viewport;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  appStore.setState({ token: "tok", board: board({ x: 10, y: 20, zoom: 1 }) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  appStore.getState().resetBoard();
});

describe("clampZoom", () => {
  it("holds zoom between 0.25x and 2x", () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.25, 2]);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.25);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it("falls back to 1x for a zoom that is not a finite number", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampViewport({ x: 1, y: 2, zoom: Number.POSITIVE_INFINITY })).toEqual({ x: 1, y: 2, zoom: 1 });
  });
});

describe("useViewport", () => {
  it("starts from the stored viewport", () => {
    const { result } = renderHook(() => useViewport());
    expect(result.current.initialViewport).toEqual({ x: 10, y: 20, zoom: 1 });
  });

  it("clamps a stored zoom that is out of range", () => {
    appStore.setState({ board: board({ x: 0, y: 0, zoom: 9 }) });
    const { result } = renderHook(() => useViewport());
    expect(result.current.initialViewport?.zoom).toBe(2);
  });

  it("writes x, y and zoom to the store once 300ms pass without another change", () => {
    const { result } = renderHook(() => useViewport());

    act(() => {
      result.current.onViewportChange({ x: 1, y: 1, zoom: 1 });
      vi.advanceTimersByTime(100);
      result.current.onViewportChange({ x: 2, y: 2, zoom: 1.1 });
      vi.advanceTimersByTime(100);
      result.current.onViewportChange({ x: 3, y: 4, zoom: 1.2 });
      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS - 1);
    });
    expect(stored()).toEqual({ x: 10, y: 20, zoom: 1 });

    act(() => vi.advanceTimersByTime(1));
    expect(stored()).toEqual({ x: 3, y: 4, zoom: 1.2 });
  });

  it("keeps the starting viewport fixed after its own writes land", () => {
    const { result } = renderHook(() => useViewport());
    act(() => {
      result.current.onViewportChange({ x: 99, y: 99, zoom: 2 });
      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS);
    });
    expect(result.current.initialViewport).toEqual({ x: 10, y: 20, zoom: 1 });
  });

  it("writes a pending change and flushes it to the API when the canvas unmounts", () => {
    const { result, unmount } = renderHook(() => useViewport());
    act(() => result.current.onViewportChange({ x: 7, y: 8, zoom: 0.5 }));

    unmount();

    expect(stored()).toEqual({ x: 7, y: 8, zoom: 0.5 });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/board",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ viewport: { x: 7, y: 8, zoom: 0.5 } }) }),
    );
  });

  it("has nothing to start from until the board has loaded", () => {
    appStore.setState({ board: null });
    const { result, rerender } = renderHook(() => useViewport());
    expect(result.current.initialViewport).toBeNull();

    act(() => appStore.setState({ board: board({ x: 5, y: 5, zoom: 0.5 }) }));
    rerender();
    expect(result.current.initialViewport).toEqual({ x: 5, y: 5, zoom: 0.5 });
  });
});
