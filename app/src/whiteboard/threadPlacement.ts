export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Which side of the pin the panel opened on. */
  side: "right" | "left";
}

export const THREAD_WIDTH = 280;
/** What a thread is taken to measure before it has been laid out. */
export const THREAD_HEIGHT_GUESS = 240;

/**
 * Where a thread panel goes, in canvas pixels: beside the pin, a little below its tip, on whichever side
 * has room. It opens to the right, flips to the left when the right would leave the canvas, and is held
 * inside the canvas on both axes however small the canvas is.
 */
export function placeThread({
  anchor,
  container,
  panel,
  gap = 18,
  margin = 12,
}: {
  anchor: { x: number; y: number };
  container: Size;
  panel: Size;
  gap?: number;
  margin?: number;
}): Placement {
  const fitsRight = anchor.x + gap + panel.width <= container.width - margin;
  const fitsLeft = anchor.x - gap - panel.width >= margin;
  // Neither fits (a tiny canvas): the side with more room around the pin.
  const side = fitsRight || (!fitsLeft && anchor.x < container.width / 2) ? "right" : "left";
  const left = side === "right" ? anchor.x + gap : anchor.x - gap - panel.width;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
  return {
    left: clamp(left, margin, container.width - panel.width - margin),
    top: clamp(anchor.y - 10, margin, container.height - panel.height - margin),
    side,
  };
}
