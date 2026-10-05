import { useReactFlow, useStore as useFlowStore } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import { useUi, uiStore } from "../ui/uiStore";
import { Thread } from "./Thread";
import { closeThread, toggleThread } from "./threadActions";

const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * Comment pins. They are drawn over everything on the canvas, at a fixed size whatever the zoom, with their
 * tip on the board point they were dropped on; the layer takes no pointer events itself, each pin does. While
 * the Comment tool is in hand a surface (beneath the pins) takes the click that drops a new one.
 */
export function PinLayer() {
  const pins = useStore(appStore, (s) => s.pins);
  const alias = useStore(appStore, (s) => s.pinAlias);
  const tool = useUi((s) => s.tool);
  const openId = useUi((s) => s.openPinId);
  const [panX, panY, zoom] = useFlowStore((s) => s.transform);
  const flow = useReactFlow();

  // A draft pin that has just been saved is a new pin under a new id: its open thread follows it.
  useEffect(() => {
    if (openId !== null && !pins[openId] && alias[openId]) uiStore.getState().openPin(alias[openId]!);
  }, [openId, pins, alias]);

  // Escape closes the thread before it does anything else, so the tool in hand is put away by the next one.
  useEffect(() => {
    if (openId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeThread();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openId]);

  const ordered = useMemo(() => Object.values(pins), [pins]);
  const open = openId !== null ? pins[openId] : undefined;
  // The thread keeps its place (and its half-written comment) when its draft pin becomes the server's.
  const threadKey = open ? (Object.entries(alias).find(([, real]) => real === open.id)?.[0] ?? open.id) : "";

  function dropPin(event: { clientX: number; clientY: number }) {
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    closeThread();
    const id = appStore.getState().draftPin({ x: tenth(at.x), y: tenth(at.y) });
    uiStore.getState().openPin(id);
  }

  return (
    <>
      <div data-pin-layer style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 7 }}>
        {ordered.map((pin, index) => {
          const x = pin.x * zoom + panX;
          const y = pin.y * zoom + panY;
          const active = openId === pin.id;
          return (
            <button
              key={pin.id}
              type="button"
              data-pin-id={pin.id}
              data-pin-resolved={pin.resolved}
              aria-label={`Comment thread ${index + 1}${pin.resolved ? " (resolved)" : ""}`}
              aria-expanded={active}
              onClick={() => toggleThread(pin.id)}
              // The tip of the marker (its sharp corner) is on the point.
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: "translate(-2px, -24px)",
                pointerEvents: "auto",
                opacity: pin.resolved ? 0.55 : undefined,
              }}
              className={[
                // No entrance animation: a filled-forwards keyframe would hold the opacity at 1 over a resolved pin's muting.
                "grid size-[26px] place-items-center border-2 border-canvas p-0 font-mono text-[11px] text-inverse shadow-[0_4px_12px_-6px_rgba(0,0,0,.6)] [border-radius:50%_50%_50%_2px]",
                pin.resolved ? "bg-ok" : active ? "bg-primary" : "bg-danger",
              ].join(" ")}
            >
              {index + 1}
            </button>
          );
        })}
        {open ? <Thread key={threadKey} pinId={open.id} anchor={{ x: open.x * zoom + panX, y: open.y * zoom + panY }} /> : null}
      </div>

      {tool === "comment" ? (
        <div data-pin-surface onClick={dropPin} className="absolute inset-0 z-[6] cursor-crosshair touch-none" />
      ) : null}
    </>
  );
}
