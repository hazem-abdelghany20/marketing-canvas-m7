import { useReactFlow } from "@xyflow/react";
import { useCallback, useRef, useState, type PointerEvent } from "react";
import { reportSaveFailure, undoLast } from "../canvas/actions";
import { plural } from "../lib/format";
import { appStore } from "../store";
import type { InkTool, StrokeInput } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { inkColorValue, strokeWidthFor } from "./inkPalette";
import { ERASE_SLOP_PX, MIN_SAMPLE_PX, SIMPLIFY_PX, appendPoint, simplify, strokeHit } from "./strokePath";

/** A stroke being drawn: shown on screen before any request has been made. */
export interface LiveStroke {
  tool: InkTool;
  points: number[];
}

/** The pointer handlers an ink tool puts on the canvas's tool surface. */
export interface SurfaceHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

interface Point {
  x: number;
  y: number;
}

function capture(event: PointerEvent<HTMLElement>) {
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch {
    /* a synthetic pointer has nothing to capture; the drag still works while it stays over the surface */
  }
}

/** Saves a stroke, and on failure leaves it drawn with a toast that offers to send it again. */
export function saveStroke(input: StrokeInput) {
  let localId = "";
  appStore
    .getState()
    .createStroke(input, (id) => (localId = id))
    .catch(() => reportInkSaveFailure(localId));
}

function reportInkSaveFailure(id: string) {
  uiStore.getState().toast({
    message: COPY.inkSaveFailed,
    tone: "danger",
    actionLabel: "Retry",
    onAction: () => {
      // Erased in the meantime: there is nothing left to send.
      if (!appStore.getState().strokes[id]) return;
      appStore
        .getState()
        .retryStroke(id)
        .catch(() => reportInkSaveFailure(id));
    },
  });
}

/**
 * Removes whole strokes, and offers one Undo for the lot. A failed delete brings the strokes back and
 * says so, with Retry.
 */
export async function eraseStrokes(ids: string[]) {
  try {
    const undoable = await appStore.getState().deleteStrokes(ids);
    if (undoable) {
      uiStore.getState().toast({
        message: `Erased ${plural(ids.length, "stroke")}.`,
        tone: "success",
        actionLabel: "Undo",
        onAction: () => undoLast(),
        durationMs: 8000,
      });
    }
  } catch {
    reportSaveFailure(() => void eraseStrokes(ids));
  }
}

/**
 * Drawing with the Pen or the Highlighter. Moves are sampled, not recorded per pixel: one is kept only
 * once it is a few screen pixels from the last, and on release the stroke is simplified, so a long drag
 * is a few dozen points rather than thousands. Points are in board coordinates, so a stroke stays put
 * under pan and zoom.
 */
export function useDrawing(tool: InkTool) {
  const flow = useReactFlow();
  const [live, setLive] = useState<LiveStroke | null>(null);
  const points = useRef<number[] | null>(null);
  const pointer = useRef<number | null>(null);

  const zoom = useCallback(() => flow.getViewport().zoom || 1, [flow]);
  const toBoard = useCallback(
    (event: PointerEvent<HTMLElement>): Point => flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    [flow],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || pointer.current !== null) return;
      pointer.current = event.pointerId;
      capture(event);
      const at = toBoard(event);
      points.current = appendPoint([], at.x, at.y, 0);
      setLive({ tool, points: points.current });
    },
    [toBoard, tool],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (points.current === null || event.pointerId !== pointer.current) return;
      const at = toBoard(event);
      const next = appendPoint(points.current, at.x, at.y, MIN_SAMPLE_PX / zoom());
      if (next === points.current) return;
      points.current = next;
      setLive({ tool, points: next });
    },
    [toBoard, tool, zoom],
  );

  const finish = useCallback(
    (event: PointerEvent<HTMLElement>, save: boolean) => {
      if (points.current === null || event.pointerId !== pointer.current) return;
      const at = toBoard(event);
      let drawn = appendPoint(points.current, at.x, at.y, 0.1);
      points.current = null;
      pointer.current = null;
      setLive(null);
      if (!save) return;
      // A tap is a dot: the same point twice, which a round cap draws as a dot.
      if (drawn.length === 2) drawn = [drawn[0]!, drawn[1]!, drawn[0]!, drawn[1]!];
      const { ink } = uiStore.getState();
      saveStroke({
        tool,
        color: inkColorValue(ink.color),
        width: strokeWidthFor(tool, ink.size),
        points: simplify(drawn, SIMPLIFY_PX / zoom()),
      });
    },
    [toBoard, tool, zoom],
  );

  return {
    live,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event) => finish(event, true),
      onPointerCancel: (event) => finish(event, false),
    } satisfies SurfaceHandlers,
  };
}

/**
 * Erasing: pressing on a stroke, or dragging across several, removes each one whole, never a segment.
 * They disappear as the pointer passes; the requests go out when it is released, as one undo step.
 */
export function useErasing() {
  const flow = useReactFlow();
  const [erased, setErased] = useState<ReadonlySet<string>>(new Set());
  const gesture = useRef<{ ids: Set<string>; last: Point } | null>(null);
  const pointer = useRef<number | null>(null);

  const toBoard = useCallback(
    (event: PointerEvent<HTMLElement>): Point => flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    [flow],
  );

  /** Marks every stroke the pointer touched on its way from the last position to this one. */
  const sweep = useCallback(
    (to: Point) => {
      const active = gesture.current;
      if (!active) return;
      const slop = ERASE_SLOP_PX / (flow.getViewport().zoom || 1);
      const { strokes, strokeSync } = appStore.getState();
      // Sampled along the way, so a fast flick across a thin stroke cannot skip over it.
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - active.last.x, to.y - active.last.y) / Math.max(1, slop)));
      let grew = false;
      for (let i = 1; i <= steps; i++) {
        const x = active.last.x + ((to.x - active.last.x) * i) / steps;
        const y = active.last.y + ((to.y - active.last.y) * i) / steps;
        for (const stroke of Object.values(strokes)) {
          if (active.ids.has(stroke.id) || strokeSync[stroke.id] === "saving") continue;
          if (strokeHit(stroke, x, y, slop)) {
            active.ids.add(stroke.id);
            grew = true;
          }
        }
      }
      active.last = to;
      if (grew) setErased(new Set(active.ids));
    },
    [flow],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || pointer.current !== null) return;
      pointer.current = event.pointerId;
      capture(event);
      const at = toBoard(event);
      gesture.current = { ids: new Set(), last: at };
      sweep(at);
    },
    [sweep, toBoard],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (gesture.current === null || event.pointerId !== pointer.current) return;
      sweep(toBoard(event));
    },
    [sweep, toBoard],
  );

  const finish = useCallback(
    (event: PointerEvent<HTMLElement>, commit: boolean) => {
      const active = gesture.current;
      if (active === null || event.pointerId !== pointer.current) return;
      gesture.current = null;
      pointer.current = null;
      if (commit && active.ids.size > 0) void eraseStrokes([...active.ids]);
      setErased(new Set());
    },
    [],
  );

  return {
    /** Strokes the pointer has passed over in the gesture still going, hidden until it is released. */
    erased,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event) => finish(event, true),
      onPointerCancel: (event) => finish(event, false),
    } satisfies SurfaceHandlers,
  };
}
