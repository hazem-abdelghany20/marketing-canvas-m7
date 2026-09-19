import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useStore } from "zustand";
import { Canvas } from "../canvas/Canvas";
import { useViewport } from "../canvas/useViewport";
import { useWorkspaceShortcuts } from "../canvas/useWorkspaceShortcuts";
import { QuickPeek } from "../components/QuickPeek";
import { ToastViewport } from "../components/Toast";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";

/**
 * S3 — the workspace. The canvas fills it; overlays float over it, and the node
 * detail panel (the child route) opens over it without unmounting it.
 */
export default function Workspace() {
  const token = useStore(appStore, (s) => s.token);
  const status = useStore(appStore, (s) => s.boardStatus);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const { initialViewport, onViewportChange } = useViewport();

  useEffect(() => {
    uiStore.getState().reset();
    void appStore.getState().loadBoard();
  }, []);

  const ready = status === "ready" && initialViewport !== null;
  useWorkspaceShortcuts(ready);

  if (!token) return <Navigate to="/signin" replace />;

  const state = ready ? "ready" : status === "error" ? "error" : "loading";

  return (
    // The provider spans the overlays too, so they can read and move the camera.
    <ReactFlowProvider>
      {/* One container for every state, so nothing shifts when the data lands. */}
      <main data-canvas-state={state} className="relative h-screen w-screen overflow-hidden bg-canvas">
        {ready ? (
          <Canvas initialViewport={initialViewport} onViewportChange={onViewportChange} />
        ) : (
          // The same dots as the canvas (GRID_GAP apart), dimmed while the board loads.
          <div
            data-grid
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(var(--grid-dot)_1.2px,transparent_1.2px)] bg-[length:26px_26px] opacity-50"
          />
        )}

        {state === "loading" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span
              role="status"
              aria-label="Loading your board"
              className="size-6 animate-spin rounded-full border-2 border-subtle border-t-accent [animation-duration:0.7s]"
            />
          </div>
        ) : null}

        {state === "error" ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-sm text-primary">We couldn't load your board. Check your connection, then reload.</p>
              <button
                type="button"
                onClick={() => void appStore.getState().loadBoard()}
                className="rounded-md border border-strong bg-elevated px-3 py-1.5 text-sm font-medium text-primary"
              >
                Reload
              </button>
            </div>
          </div>
        ) : null}

        {ready && nodeCount === 0 ? (
          // The panel sits over the canvas without taking its gestures.
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-7 py-6 text-center">
              <h1 className="text-base font-semibold text-primary">Nothing on the canvas yet.</h1>
              <p className="text-[13px] leading-relaxed text-muted">
                Six kinds of node live here: goal, strategy, campaign, content, asset and note.
              </p>
            </div>
          </div>
        ) : null}

        {ready ? <QuickPeek onConnect={() => {}} /> : null}
        {ready ? <Outlet /> : null}
        <ToastViewport />
      </main>
    </ReactFlowProvider>
  );
}
