import { useReactFlow, ViewportPortal } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { EdgeKindPicker } from "../components/EdgeKindPicker";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { appStore } from "../store";
import { uiStore, useUi } from "../ui/uiStore";
import { CONNECT_COPY } from "./connect";

/**
 * O3 — what connect mode shows over the canvas: a banner saying what to pick
 * next and how to leave, and the kind picker once both ends are chosen.
 */
export function ConnectMode() {
  const { active, sourceId, targetId } = useUi((s) => s.connect);
  const nodes = useStore(appStore, (s) => s.nodes);

  // A node deleted mid-flow drops out of the flow; the mode goes back a step.
  useEffect(() => {
    if (!active) return;
    if (targetId && !nodes[targetId]) {
      uiStore.getState().setConnect({ targetId: null });
      uiStore.getState().toast({ message: CONNECT_COPY.targetRemoved, tone: "warn" });
    } else if (sourceId && !nodes[sourceId]) {
      uiStore.getState().setConnect({ sourceId: null, targetId: null });
      uiStore.getState().toast({ message: CONNECT_COPY.targetRemoved, tone: "warn" });
    }
  }, [active, sourceId, targetId, nodes]);

  if (!active) return null;
  const hint = !sourceId
    ? "Pick the node to connect from"
    : !targetId
      ? "Now pick the node it connects to"
      : "Choose what kind of connection this is";

  return (
    <>
      <div
        role="status"
        data-connect-banner
        className="absolute left-1/2 top-3.5 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-primary px-4 py-[7px] text-[12.5px] text-inverse shadow-[0_8px_24px_-14px_rgba(0,0,0,.6)] max-[899px]:top-[64px]"
      >
        <span>{hint}</span>
        <span className="font-mono text-[9.5px] tracking-[0.1em] opacity-65">ESC TO EXIT</span>
      </div>
      {sourceId && targetId && nodes[sourceId] && nodes[targetId] ? (
        <EdgeKindPicker sourceId={sourceId} targetId={targetId} />
      ) : null}
    </>
  );
}

/** While a source is picked, a dashed line runs from it to the pointer. Lives inside <ReactFlow>. */
export function PendingLine() {
  const { active, sourceId, targetId } = useUi((s) => s.connect);
  const source = useStore(appStore, (s) => (sourceId ? s.nodes[sourceId] : undefined));
  const flow = useReactFlow();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const following = active && Boolean(source) && !targetId;

  useEffect(() => {
    if (!following) {
      setPointer(null);
      return;
    }
    const move = (event: PointerEvent) => setPointer(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [following, flow]);

  if (!following || !source || !pointer) return null;
  const from = { x: source.x + CARD_WIDTH / 2, y: source.y + CARD_HEIGHT / 2 };
  return (
    <ViewportPortal>
      <svg data-pending-line className="pointer-events-none absolute left-0 top-0 size-px overflow-visible">
        <path
          d={`M${from.x} ${from.y} L${pointer.x} ${pointer.y}`}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 5"
          className="stroke-accent"
        />
      </svg>
    </ViewportPortal>
  );
}
