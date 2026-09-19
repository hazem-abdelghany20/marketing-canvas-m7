import { useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import type { Point } from "./actions";

/**
 * Where a card lands so that it sits in the middle of what is on screen, in
 * board units. Read on demand, so it always reflects the camera right now.
 */
export function useViewportCenter(): () => Point {
  const flow = useStoreApi();
  return useCallback(() => {
    const { width, height, transform } = flow.getState();
    const [x, y, zoom] = transform;
    return {
      x: Math.round((width / 2 - x) / zoom - CARD_WIDTH / 2),
      y: Math.round((height / 2 - y) / zoom - CARD_HEIGHT / 2),
    };
  }, [flow]);
}
