import { ViewportPortal, useStore as useFlowStore } from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import type { InkTool, Stroke } from "../types";
import { useUi } from "../ui/uiStore";
import { HIGHLIGHTER_OPACITY, inkColorValue, strokeWidthFor } from "./inkPalette";
import { smoothPath } from "./strokePath";
import { useDrawing, useErasing, type LiveStroke, type SurfaceHandlers } from "./useDrawing";

/**
 * Ink on the canvas. The highlighter sits in React Flow's viewport layer (which the stylesheet puts
 * beneath the node cards); the pen sits above everything on the canvas, in a layer that carries the
 * camera's pan and zoom itself. Either way a stroke is in board coordinates and stays anchored under
 * pan and zoom. Neither layer ever takes a pointer event: while an ink tool is active a surface does,
 * and while Select is active there is no surface at all, so the canvas keeps every gesture.
 */
export function InkLayer() {
  const tool = useUi((s) => s.tool);
  const strokes = useStore(appStore, (s) => s.strokes);
  const sync = useStore(appStore, (s) => s.strokeSync);
  const [panX, panY, zoom] = useFlowStore((s) => s.transform);

  const drawingTool: InkTool = tool === "highlighter" ? "highlighter" : "pen";
  const draw = useDrawing(drawingTool);
  const erase = useErasing();

  const { under, over } = useMemo(() => {
    const visible = Object.values(strokes).filter((stroke) => !erase.erased.has(stroke.id));
    return {
      under: visible.filter((stroke) => stroke.tool === "highlighter"),
      over: visible.filter((stroke) => stroke.tool !== "highlighter"),
    };
  }, [strokes, erase.erased]);

  const live = draw.live;
  const surface = tool === "pen" || tool === "highlighter" ? draw.handlers : tool === "eraser" ? erase.handlers : null;

  return (
    <>
      <ViewportPortal>
        <svg
          data-ink-layer="under"
          aria-hidden="true"
          // Beneath the marks, which share this viewport layer at z-index 1.
          style={{ pointerEvents: "none", zIndex: 0 }}
          className="absolute left-0 top-0 size-px overflow-visible"
        >
          {under.map((stroke) => (
            <StrokePath key={stroke.id} stroke={stroke} unsaved={sync[stroke.id] !== undefined} />
          ))}
          {live?.tool === "highlighter" ? <LivePath live={live} /> : null}
        </svg>
      </ViewportPortal>

      <svg
        data-ink-layer="over"
        aria-hidden="true"
        style={{ pointerEvents: "none" }}
        className="absolute inset-0 z-[5] h-full w-full overflow-visible"
      >
        <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
          {over.map((stroke) => (
            <StrokePath key={stroke.id} stroke={stroke} unsaved={sync[stroke.id] !== undefined} />
          ))}
          {live?.tool === "pen" ? <LivePath live={live} /> : null}
        </g>
      </svg>

      {surface ? <Surface tool={tool} handlers={surface} /> : null}
    </>
  );
}

/** What the canvas shows while a tool that draws or erases is in hand: it takes the pointer, and hands the wheel on. */
function Surface({ tool, handlers }: { tool: string; handlers: SurfaceHandlers }) {
  const element = useRef<HTMLDivElement>(null);

  // Zooming still works while a tool is in hand: the wheel goes to the canvas underneath.
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    function forward(event: WheelEvent) {
      const pane = el!.parentElement?.querySelector(".react-flow__pane");
      if (!pane) return;
      event.preventDefault();
      pane.dispatchEvent(new WheelEvent("wheel", event));
    }
    el.addEventListener("wheel", forward, { passive: false });
    return () => el.removeEventListener("wheel", forward);
  }, []);

  return (
    <div
      ref={element}
      data-ink-surface
      data-tool={tool}
      {...handlers}
      className={`absolute inset-0 z-[6] touch-none ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
    />
  );
}

function StrokePath({ stroke, unsaved }: { stroke: Stroke; unsaved: boolean }) {
  const d = useMemo(() => smoothPath(stroke.points), [stroke.points]);
  return (
    <path
      data-stroke-id={stroke.id}
      data-stroke-tool={stroke.tool}
      data-stroke-unsaved={unsaved ? "" : undefined}
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={stroke.width}
      strokeOpacity={stroke.tool === "highlighter" ? HIGHLIGHTER_OPACITY : undefined}
      style={{ stroke: stroke.color }}
    />
  );
}

function LivePath({ live }: { live: LiveStroke }) {
  const color = useUi((s) => s.ink.color);
  const size = useUi((s) => s.ink.size);
  return (
    <path
      data-live-stroke
      d={smoothPath(live.points)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidthFor(live.tool, size)}
      strokeOpacity={live.tool === "highlighter" ? HIGHLIGHTER_OPACITY : undefined}
      style={{ stroke: inkColorValue(color) }}
    />
  );
}
