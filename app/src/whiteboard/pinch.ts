import { MAX_ZOOM, MIN_ZOOM } from "../canvas/useViewport";
import type { Viewport } from "../types";

/**
 * The camera's share of a two-finger gesture, as arithmetic and nothing else (docs/spec.md § P3): where the board
 * should sit, and how large, so that the point that was between the fingers when they landed stays between them.
 */

export interface Point {
  x: number;
  y: number;
}

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** What was true when the second finger landed. */
export interface PinchStart {
  /** The board point that was under the midpoint of the two fingers. */
  anchor: Point;
  /** How far apart the fingers were. */
  span: number;
  /** The camera's zoom then. */
  zoom: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

/**
 * The camera for fingers at `a` and `b` (window coordinates), given where the canvas's corner is in the window
 * (`origin`). The zoom is the start's, scaled by how much the fingers have spread, and held to the canvas's own range;
 * the pan then puts the anchor back under the midpoint, so a pinch zooms about the fingers and a drag moves the board
 * with them. Fingers that landed on the same spot (a span of nothing) change the pan and not the zoom.
 */
export function pinchViewport(
  start: PinchStart,
  a: Point,
  b: Point,
  origin: Point,
  limits: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM },
): Viewport {
  const ratio = start.span > 0 ? distance(a, b) / start.span : 1;
  const zoom = Math.min(limits.max, Math.max(limits.min, start.zoom * ratio));
  const mid = midpoint(a, b);
  return {
    x: mid.x - origin.x - start.anchor.x * zoom,
    y: mid.y - origin.y - start.anchor.y * zoom,
    zoom,
  };
}
