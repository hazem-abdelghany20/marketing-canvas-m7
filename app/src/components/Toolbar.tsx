import { useReactFlow, useStore as useFlowStore } from "@xyflow/react";
import { Maximize, Minus, Plus, Undo2 } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { undoLast } from "../canvas/actions";
import { MAX_ZOOM, MIN_ZOOM } from "../canvas/useViewport";
import { motionMs } from "../lib/motion";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { Button, type ButtonProps } from "./Button";

interface ToolbarProps {
  /** False while the board loads: the toolbar renders, but nothing in it works yet. */
  ready: boolean;
  addMenuOpen: boolean;
  onAdd: () => void;
  /** The detail panel is open on the right: sit to its left rather than under it. */
  besidePanel?: boolean;
  /** Slots for controls that arrive with later tickets (connect, search, arrange). */
  children?: ReactNode;
}

/**
 * Floats top-right over the canvas and never pushes layout. Below 900px the
 * labels collapse to icons; the accessible names stay.
 */
export function Toolbar({ ready, addMenuOpen, onAdd, besidePanel, children }: ToolbarProps) {
  const flow = useReactFlow();
  const zoom = useFlowStore((s) => s.transform[2]);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const canUndo = useStore(appStore, (s) => s.undoStack.length > 0 && !s.undoing);

  const waiting = ready ? null : COPY.loading;
  const empty = nodeCount === 0 ? COPY.nothingToFit : null;

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className={`absolute ${besidePanel ? "right-[494px] max-[899px]:right-3.5" : "right-3.5"} top-3.5 z-30 flex max-w-[calc(100%-28px)] items-center gap-1.5 rounded-md border border-subtle bg-panel p-[5px] shadow-[0_6px_20px_-14px_rgba(0,0,0,.4)]`}
    >
      <ToolButton
        id="toolbar-add"
        variant="primary"
        label="Add"
        icon={<Plus size={14} aria-hidden="true" />}
        aria-label="Add node"
        aria-haspopup="menu"
        aria-expanded={addMenuOpen}
        title="Add node — N"
        disabledReason={waiting}
        onClick={onAdd}
      />
      {children}
      <Divider />
      <ToolButton
        label="Fit"
        icon={<Maximize size={14} aria-hidden="true" />}
        aria-label="Fit to screen"
        title="Zoom to fit every node"
        disabledReason={waiting ?? empty}
        onClick={() => void flow.fitView({ padding: 0.2, maxZoom: 1.5, duration: motionMs(300) })}
      />
      <ToolButton
        icon={<Minus size={14} aria-hidden="true" />}
        aria-label="Zoom out"
        title="Zoom out"
        disabledReason={waiting ?? (zoom <= MIN_ZOOM + 1e-6 ? COPY.minZoom : null)}
        onClick={() => void flow.zoomOut({ duration: motionMs(150) })}
      />
      <span aria-live="polite" className="min-w-[38px] flex-none text-center font-mono text-[10.5px] text-muted">
        {Math.round(zoom * 100)}%
      </span>
      <ToolButton
        icon={<Plus size={14} aria-hidden="true" />}
        aria-label="Zoom in"
        title="Zoom in"
        disabledReason={waiting ?? (zoom >= MAX_ZOOM - 1e-6 ? COPY.maxZoom : null)}
        onClick={() => void flow.zoomIn({ duration: motionMs(150) })}
      />
      <Divider />
      <ToolButton
        label="Undo"
        icon={<Undo2 size={14} aria-hidden="true" />}
        aria-label="Undo"
        title="Undo — ⌘Z / Ctrl+Z"
        disabledReason={waiting ?? (canUndo ? null : COPY.nothingToUndo)}
        onClick={() => undoLast()}
      />
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px flex-none bg-subtle" />;
}

interface ToolButtonProps extends ButtonProps {
  label?: string;
  icon: ReactNode;
}

/** An icon plus a label that hides below 900px. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { label, icon, className = "", ...rest },
  ref,
) {
  return (
    <Button ref={ref} className={`flex-none ${className}`} {...rest}>
      {icon}
      {label ? <span className="max-[899px]:sr-only">{label}</span> : null}
    </Button>
  );
});
