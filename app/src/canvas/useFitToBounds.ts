import { getViewportForBounds, useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import { motionMs } from "../lib/motion";
import { ARRANGE_MS } from "./useArrangeTween";
import { FIT_MAX_ZOOM, FIT_PADDING, MIN_ZOOM } from "./useViewport";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Moves the camera to frame a box of board units, the way the Fit button frames the
 * nodes. `coveredRight` is how much of the canvas something else sits on (the detail
 * panel), so the box is framed in what is left. Instant under reduced motion. The box
 * is given rather than read off the cards, so it can be framed before they are drawn there.
 */
export function useFitToBounds(): (bounds: Bounds, coveredRight?: number) => void {
  const flow = useReactFlow();
  const store = useStoreApi();
  return useCallback(
    (bounds, coveredRight = 0) => {
      const { width, height } = store.getState();
      const visible = width - coveredRight;
      if (visible <= 0 || !height) return;
      const viewport = getViewportForBounds(bounds, visible, height, MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING);
      void flow.setViewport(viewport, { duration: motionMs(ARRANGE_MS) });
    },
    [flow, store],
  );
}
