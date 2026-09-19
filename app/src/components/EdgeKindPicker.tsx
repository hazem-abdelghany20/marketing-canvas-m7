import { useStore as useFlowStore, useViewport as useFlowViewport } from "@xyflow/react";
import { forwardRef, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { chooseKind } from "../canvas/connect";
import { appStore } from "../store";
import { CARD_HEIGHT, CARD_WIDTH } from "./NodeCard";
import { placePeek } from "./QuickPeek";

const PICKER_WIDTH = 236;
const PICKER_HEIGHT = 150;

/** O3 — asked once both ends are picked: is this `serves` (directional) or `relates-to`? */
export function EdgeKindPicker({ sourceId, targetId }: { sourceId: string; targetId: string }) {
  const source = useStore(appStore, (s) => s.nodes[sourceId]);
  const target = useStore(appStore, (s) => s.nodes[targetId]);
  const { x, y, zoom } = useFlowViewport();
  const bounds = useFlowStore(
    (s) => ({ width: s.width, height: s.height }),
    (a, b) => a.width === b.width && a.height === b.height,
  );
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => first.current?.focus(), []);

  if (!source || !target) return null;
  const placement = placePeek(
    { left: target.x * zoom + x, top: target.y * zoom + y, width: CARD_WIDTH * zoom, height: CARD_HEIGHT * zoom },
    { width: PICKER_WIDTH, height: PICKER_HEIGHT },
    bounds,
  );
  const name = (title: string) => title.trim() || "Untitled";

  return (
    <div
      role="dialog"
      aria-label="Connection kind"
      style={{ left: placement.left, top: placement.top, width: PICKER_WIDTH }}
      className="absolute z-30 animate-mc-pop rounded-md border border-subtle bg-panel p-[11px] shadow-[0_16px_40px_-22px_rgba(0,0,0,.55)]"
    >
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">Connection kind</div>
      <KindButton
        ref={first}
        label="serves"
        hint={`${name(source.title)} serves ${name(target.title)}`}
        onClick={() => void chooseKind("serves")}
      />
      <KindButton label="relates to" hint="Undirected association" onClick={() => void chooseKind("relates-to")} />
    </div>
  );
}

const KindButton = forwardRef<HTMLButtonElement, { label: string; hint: string; onClick: () => void }>(
  function KindButton({ label, hint, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className="mt-1.5 flex w-full flex-col items-start gap-0.5 rounded-sm border border-subtle bg-elevated px-2.5 py-2 text-left text-[13px] text-primary first-of-type:mt-0 hover:border-strong"
      >
        <span className="font-semibold">{label}</span>
        <span className="line-clamp-2 text-xs text-muted">{hint}</span>
      </button>
    );
  },
);
