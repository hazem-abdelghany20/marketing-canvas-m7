import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import type { Viewport } from "../types";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/** How long the camera must rest before its position is written to the store. */
export const VIEWPORT_SETTLE_MS = 300;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function clampViewport({ x, y, zoom }: Viewport): Viewport {
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, zoom: clampZoom(zoom) };
}

/**
 * Bridges the canvas camera and the store. The camera moves every frame; the
 * store hears about it once the camera has rested for 300ms, and the store in
 * turn throttles its writes to the API.
 */
export function useViewport() {
  const hasBoard = useStore(appStore, (s) => s.board !== null);

  // Captured once. The canvas owns the camera after mount; feeding our own
  // writes back in as a new starting point would fight the user's gesture.
  const [initialViewport, setInitialViewport] = useState<Viewport | null>(() => storedViewport());
  if (initialViewport === null && hasBoard) setInitialViewport(storedViewport());

  const pending = useRef<Viewport | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writePending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const viewport = pending.current;
    pending.current = null;
    if (viewport) appStore.getState().setViewport(viewport);
    return viewport !== null;
  }, []);

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      pending.current = clampViewport(viewport);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(writePending, VIEWPORT_SETTLE_MS);
    },
    [writePending],
  );

  // Leaving the canvas, or the page, must not drop a move still settling.
  useEffect(() => {
    const leave = () => {
      if (writePending()) void appStore.getState().flushViewport();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [writePending]);

  return { initialViewport, onViewportChange };
}

function storedViewport(): Viewport | null {
  const viewport = appStore.getState().board?.viewport;
  return viewport ? clampViewport(viewport) : null;
}
