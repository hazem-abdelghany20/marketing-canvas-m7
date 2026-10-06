import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useMemo, useRef, type PointerEvent } from "react";
import type { Viewport } from "../types";
import { distance, midpoint, pinchViewport, type PinchStart, type Point } from "./pinch";
import type { SurfaceHandlers } from "./useDrawing";

/** What a two-finger gesture needs of the camera. React Flow's is {@link useFlowCamera}; a test hands in its own. */
export interface GestureCamera {
  viewport: () => Viewport;
  /** Where the canvas's top-left corner is in the window. */
  origin: () => Point;
  /** A point of the window, in board units. */
  toBoard: (point: Point) => Point;
  /** Puts the camera there, now. */
  move: (viewport: Viewport) => void;
}

/** The canvas's camera, for a gesture to move. Call it inside the canvas. */
export function useFlowCamera(): GestureCamera {
  const flow = useReactFlow();
  const store = useStoreApi();
  return useMemo(
    () => ({
      viewport: () => flow.getViewport(),
      origin: () => {
        const rect = store.getState().domNode?.getBoundingClientRect();
        return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
      },
      toBoard: (point) => flow.screenToFlowPosition(point),
      move: (viewport) => void flow.setViewport(viewport, { duration: 0 }),
    }),
    [flow, store],
  );
}

/** For this long after a gesture ends a click is not a click: lifting two fingers is not a tap. */
export const GESTURE_QUIET_MS = 400;

/** A tool that does nothing, for a surface whose own gesture is a click and which only wants the camera. */
export const NO_TOOL: SurfaceHandlers = {
  onPointerDown() {},
  onPointerMove() {},
  onPointerUp() {},
  onPointerCancel() {},
};

type Touch = PointerEvent<HTMLElement>;
const at = (event: Touch): Point => ({ x: event.clientX, y: event.clientY });

/**
 * Two fingers move the camera, whatever tool is in hand. One finger belongs to the tool: every event goes to its
 * handlers. When a second lands, the tool is told the first finger's stroke is cancelled (so nothing is saved) and gets
 * nothing more; the pair pan and zoom the board until every finger has lifted, and a finger that stays down after the
 * other leaves does nothing. A third finger is ignored. Wrap a tool surface's handlers with this and spread the result.
 *
 * `recently()` says whether a gesture ended a moment ago, for the click that can follow one.
 */
export function useCameraGesture(tool: SurfaceHandlers, camera: GestureCamera) {
  const latest = useRef({ tool, camera });
  latest.current = { tool, camera };

  const fingers = useRef(new Map<number, Point>());
  /** The finger the tool has, until a second one lands. */
  const first = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const pair = useRef<{ ids: [number, number]; start: PinchStart } | null>(null);
  const endedAt = useRef(Number.NEGATIVE_INFINITY);

  function down(event: Touch) {
    fingers.current.set(event.pointerId, at(event));
    if (pair.current) return; // a third finger, or one that landed after the pair began: not the tool's, not the camera's
    if (fingers.current.size === 1) {
      first.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      latest.current.tool.onPointerDown(event);
      return;
    }
    if (!first.current) return;

    const ids: [number, number] = [first.current.pointerId, event.pointerId];
    const a = fingers.current.get(ids[0])!;
    const b = fingers.current.get(ids[1])!;
    const { camera: cam } = latest.current;
    pair.current = {
      ids,
      start: { anchor: cam.toBoard(midpoint(a, b)), span: distance(a, b), zoom: cam.viewport().zoom },
    };
    // The first finger was drawing, or erasing, or dropping something: it was the start of a gesture, not of a stroke.
    latest.current.tool.onPointerCancel({ ...first.current, button: 0 } as unknown as Touch);
  }

  function move(event: Touch) {
    if (!fingers.current.has(event.pointerId)) {
      if (!pair.current) latest.current.tool.onPointerMove(event); // a pointer with no finger down: a hovering mouse
      return;
    }
    fingers.current.set(event.pointerId, at(event));
    const active = pair.current;
    if (!active) return latest.current.tool.onPointerMove(event);
    if (!active.ids.includes(event.pointerId)) return;
    const a = fingers.current.get(active.ids[0]);
    const b = fingers.current.get(active.ids[1]);
    if (!a || !b) return; // one of the pair has lifted: what is left of the gesture does nothing
    const { camera: cam } = latest.current;
    cam.move(pinchViewport(active.start, a, b, cam.origin()));
  }

  function lift(event: Touch, cancelled: boolean) {
    fingers.current.delete(event.pointerId);
    if (pair.current) {
      if (fingers.current.size === 0) {
        pair.current = null;
        first.current = null;
        endedAt.current = performance.now();
      }
      return;
    }
    first.current = null;
    if (cancelled) latest.current.tool.onPointerCancel(event);
    else latest.current.tool.onPointerUp(event);
  }

  const handlers: SurfaceHandlers = {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: (event) => lift(event, false),
    onPointerCancel: (event) => lift(event, true),
  };

  return { handlers, recently: () => performance.now() - endedAt.current < GESTURE_QUIET_MS };
}
