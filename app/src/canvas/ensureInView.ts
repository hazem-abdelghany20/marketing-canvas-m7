interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether a box in board units is wholly on screen, given where the camera is.
 * `coveredRight` is the width of canvas something else sits on, which does not count.
 */
export function rectInView(
  rect: Rect,
  camera: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
  coveredRight = 0,
): boolean {
  const left = rect.x * camera.zoom + camera.x;
  const top = rect.y * camera.zoom + camera.y;
  const right = left + rect.width * camera.zoom;
  const bottom = top + rect.height * camera.zoom;
  return left >= 0 && top >= 0 && right <= size.width - coveredRight && bottom <= size.height;
}
