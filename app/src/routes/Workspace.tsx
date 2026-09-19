import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Spline } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { createNote } from "../canvas/actions";
import { Canvas } from "../canvas/Canvas";
import { CONNECT_COPY, exitConnect, startConnect } from "../canvas/connect";
import { ConnectMode } from "../canvas/ConnectMode";
import { useViewport } from "../canvas/useViewport";
import { useViewportCenter } from "../canvas/viewportCenter";
import { useWorkspaceShortcuts } from "../canvas/useWorkspaceShortcuts";
import { AddNodeMenu, MenuItem } from "../components/AddNodeMenu";
import { Button } from "../components/Button";
import { FileDropZone } from "../components/FileDropZone";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { QuickPeek } from "../components/QuickPeek";
import { ToastViewport } from "../components/Toast";
import { Toolbar, ToolButton } from "../components/Toolbar";
import { FILE_ACCEPT, importFiles, ROW_GAP } from "../files/importFiles";
import { appStore } from "../store";
import { uiStore, useUi } from "../ui/uiStore";

/**
 * S3 — the workspace. The canvas fills it; overlays float over it, and the node
 * detail panel (the child route) opens over it without unmounting it.
 */
export default function Workspace() {
  return (
    // The provider spans the overlays too, so they can read and move the camera.
    <ReactFlowProvider>
      <WorkspaceScreen />
    </ReactFlowProvider>
  );
}

function WorkspaceScreen() {
  const navigate = useNavigate();
  const token = useStore(appStore, (s) => s.token);
  const status = useStore(appStore, (s) => s.boardStatus);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const addMenuOpen = useUi((s) => s.addMenuOpen);
  const connecting = useUi((s) => s.connect.active);
  const flow = useReactFlow();
  const fileInput = useRef<HTMLInputElement>(null);
  const { initialViewport, onViewportChange } = useViewport();
  const viewportCenter = useViewportCenter();

  useEffect(() => {
    uiStore.getState().reset();
    void appStore.getState().loadBoard();
  }, []);

  const ready = status === "ready" && initialViewport !== null;

  // Focus goes back where it came from when the menu closes without creating anything.
  const returnFocus = useRef<HTMLElement | null>(null);
  const openAddMenu = useCallback(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
    uiStore.getState().setAddMenuOpen(true);
  }, []);
  const closeAddMenu = useCallback((restoreFocus = true) => {
    uiStore.getState().setAddMenuOpen(false);
    if (!restoreFocus) return;
    const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById("toolbar-add");
    target?.focus();
  }, []);

  const addNote = useCallback(() => {
    closeAddMenu(false);
    void createNote(viewportCenter(), {
      onCreated: (node) => navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
    });
  }, [closeAddMenu, navigate, viewportCenter]);

  const fromChat = useCallback(() => {
    closeAddMenu(false);
    // The chat rail (ticket 012) marks its composer; until then there is nothing to focus.
    document.querySelector<HTMLElement>("[data-chat-composer]")?.focus();
  }, [closeAddMenu]);

  const runImport = useCallback(async (files: File[], origin: { x: number; y: number }) => {
    const { messages } = await importFiles(files, origin, { store: appStore, ui: uiStore });
    if (messages.length > 0) uiStore.getState().toast({ message: messages.join(" "), tone: "warn", durationMs: 9000 });
  }, []);

  // Dropped files centre on the drop point; picked files centre on the viewport.
  const onDropFiles = useCallback(
    (files: File[], at: { clientX: number; clientY: number }) => {
      const point = flow.screenToFlowPosition({ x: at.clientX, y: at.clientY });
      void runImport(files, { x: point.x - CARD_WIDTH / 2, y: point.y - CARD_HEIGHT / 2 });
    },
    [flow, runImport],
  );
  const onPickFiles = useCallback(
    (files: File[]) => {
      const center = viewportCenter();
      const rowWidth = (files.length - 1) * (CARD_WIDTH + ROW_GAP);
      void runImport(files, { x: center.x - rowWidth / 2, y: center.y });
    },
    [runImport, viewportCenter],
  );
  const pickFile = useCallback(() => {
    closeAddMenu(false);
    fileInput.current?.click();
  }, [closeAddMenu]);

  const toggleConnect = useCallback(() => {
    if (uiStore.getState().connect.active) exitConnect();
    else startConnect();
  }, []);

  useWorkspaceShortcuts(ready, { onAdd: openAddMenu, onConnect: toggleConnect });

  if (!token) return <Navigate to="/signin" replace />;

  const state = ready ? "ready" : status === "error" ? "error" : "loading";

  return (
    // One container for every state, so nothing shifts when the data lands.
    <main data-canvas-state={state} className="relative h-screen w-screen overflow-hidden bg-canvas">
      <FileDropZone enabled={ready && !connecting} onFiles={onDropFiles}>
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
      </FileDropZone>

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
        // The backdrop lets canvas gestures through; only the card itself takes clicks.
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-7 py-6 text-center">
            <h1 className="text-base font-semibold text-primary">Nothing on the canvas yet.</h1>
            <p className="text-[13px] leading-relaxed text-muted">
              Six kinds of node live here: goal, strategy, campaign, content, asset and note.
            </p>
            <Button variant="primary" className="mt-2 px-4 py-2 text-[13.5px]" onClick={openAddMenu}>
              Add your first node
            </Button>
          </div>
        </div>
      ) : null}

      <Toolbar ready={ready} addMenuOpen={addMenuOpen} onAdd={openAddMenu}>
        <ToolButton
          label="Connect"
          icon={<Spline size={14} aria-hidden="true" />}
          aria-label="Connect"
          aria-pressed={connecting}
          variant={connecting ? "active" : "secondary"}
          title={connecting ? "Leave connect mode — Esc" : "Connect two nodes — C"}
          disabledReason={!ready ? "Waiting for the board." : nodeCount < 2 ? CONNECT_COPY.needsTwo : null}
          // Trying anyway gets the same explanation as the C key.
          onDisabledClick={() => ready && startConnect()}
          onClick={toggleConnect}
        />
      </Toolbar>
      {addMenuOpen && ready ? (
        <AddNodeMenu onClose={closeAddMenu} onNote={addNote} onFromChat={fromChat}>
          <MenuItem label="File" hint="Images, PDF, text, Office · 25MB" onSelect={pickFile} />
        </AddNodeMenu>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        hidden
        data-file-input
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onPickFiles(files);
        }}
      />

      {ready ? <QuickPeek onConnect={(id) => void startConnect(id)} /> : null}
      {ready ? <ConnectMode /> : null}
      <Outlet />
      <ToastViewport />
    </main>
  );
}
