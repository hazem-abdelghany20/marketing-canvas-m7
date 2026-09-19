import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { motionMs } from "../lib/motion";
import type { CanvasNode } from "../types";

/** How long a pan to a node takes; zero under prefers-reduced-motion. */
export const PAN_MS = 400;

/** The slice of React Flow's instance this needs, so tests can hand in a stub. */
export interface Camera {
  getZoom: () => number;
  setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => Promise<boolean>;
}

export interface PanOptions {
  /** Zoom to land at. Keeps the current zoom when omitted. */
  zoom?: number;
  /**
   * Screen pixels covered on the right, e.g. by the detail panel. The node is
   * centred in what is left visible rather than behind the panel.
   */
  coveredRight?: number;
}

/** Centres the camera on a node; instant when the user asks for reduced motion. */
export function panToNode(camera: Camera, node: Pick<CanvasNode, "x" | "y">, options: PanOptions = {}) {
  const zoom = options.zoom ?? camera.getZoom();
  const shift = (options.coveredRight ?? 0) / 2 / zoom;
  return camera.setCenter(node.x + CARD_WIDTH / 2 + shift, node.y + CARD_HEIGHT / 2, {
    zoom,
    duration: motionMs(PAN_MS),
  });
}
