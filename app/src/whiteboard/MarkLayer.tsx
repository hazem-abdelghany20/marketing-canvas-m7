import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { useStore } from "zustand";
import { appStore } from "../store";
import { useUi } from "../ui/uiStore";
import { MarkCard } from "./MarkCard";

const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * Stickies and board text. They sit in the canvas's viewport layer, above the highlighter's ink and beneath
 * the node cards, so they move with the camera and never cover a card. The layer takes no pointer events
 * itself; each mark does. While the Sticky or Text tool is in hand a surface takes the click that drops one.
 */
export function MarkLayer() {
  const marks = useStore(appStore, (s) => s.marks);
  const tool = useUi((s) => s.tool);
  const flow = useReactFlow();

  // A click, not a press: on press the browser would move focus off the new mark's field as the button came up.
  function dropMark(event: { clientX: number; clientY: number }) {
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    appStore.getState().draftMark({ variant: tool === "text" ? "text" : "sticky", x: tenth(at.x), y: tenth(at.y) });
  }

  return (
    <>
      <ViewportPortal>
        <div
          data-mark-layer
          style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, pointerEvents: "none", zIndex: 1 }}
        >
          {Object.values(marks).map((mark) => (
            <MarkCard key={mark.id} mark={mark} />
          ))}
        </div>
      </ViewportPortal>

      {tool === "sticky" || tool === "text" ? (
        <div
          data-mark-surface
          data-tool={tool}
          onClick={dropMark}
          className={`absolute inset-0 z-[6] touch-none ${tool === "text" ? "cursor-text" : "cursor-copy"}`}
        />
      ) : null}
    </>
  );
}
