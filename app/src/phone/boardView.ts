import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import type { CanvasNode, Viewport } from "../types";

/**
 * Whether the camera is looking somewhere other than the board: fewer than `share` of the cards have their centre on
 * screen. The camera is the board's, one for every screen that opens it, so a phone can be handed one that a wider screen
 * left, showing a corner of the board or empty canvas. False when there are no cards to look at, or the canvas has no size
 * yet, because then it cannot be known.
 */
export function boardOutOfView(
  nodes: CanvasNode[],
  camera: Viewport,
  size: { width: number; height: number },
  share = 0.5,
): boolean {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return false;
  const seen = nodes.filter((node) => {
    const x = (node.x + CARD_WIDTH / 2) * camera.zoom + camera.x;
    const y = (node.y + CARD_HEIGHT / 2) * camera.zoom + camera.y;
    return x >= 0 && y >= 0 && x <= size.width && y <= size.height;
  }).length;
  return seen / nodes.length < share;
}
