import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Network, Search, Spline } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { signInTarget } from "../auth/expired";
import { arrangeBoard, createNote } from "../canvas/actions";
import { ChatRail } from "../chat/ChatRail";
import { Canvas } from "../canvas/Canvas";
import { CONNECT_COPY, exitConnect, startConnect } from "../canvas/connect";
import { ConnectBanner, ConnectMode } from "../canvas/ConnectMode";
import { useCitationHighlight } from "../canvas/useCitationHighlight";
import { useFitToBounds } from "../canvas/useFitToBounds";
import { useGoToNode } from "../canvas/useGoToNode";
import { useViewport } from "../canvas/useViewport";
import { useViewportCenter } from "../canvas/viewportCenter";
import { useWorkspaceShortcuts } from "../canvas/useWorkspaceShortcuts";
import { AddNodeMenu, MenuItem } from "../components/AddNodeMenu";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FileDropZone } from "../components/FileDropZone";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { PANEL_WIDTH } from "../components/detail/ConnectionList";
import { QuickPeek } from "../components/QuickPeek";
import { ReasonTip } from "../components/ReasonTip";
import { SearchOverlay } from "../components/SearchOverlay";
import { ToastViewport } from "../components/Toast";
import { Toolbar, ToolButton } from "../components/Toolbar";
import { isNarrow, useNarrow } from "../lib/useMediaQuery";
import { FILE_ACCEPT, importFiles, ROW_GAP } from "../files/importFiles";
import type { CanvasNode } from "../types";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { ClearInkDialog } from "../whiteboard/ClearInkDialog";
import { Dock } from "../whiteboard/Dock";
import { InkOptions } from "../whiteboard/InkOptions";
import { ToolHint } from "../whiteboard/ToolHint";
import { useToolShortcuts } from "../whiteboard/useToolShortcuts";

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

/** Where a search result lands: close enough to read the card. */
const SEARCH_FOCUS_ZOOM = 1.25;

function WorkspaceScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useStore(appStore, (s) => s.token);
  const status = useStore(appStore, (s) => s.boardStatus);
  const boardError = useStore(appStore, (s) => s.boardError);
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const pendingCount = useUi((s) => s.pendingImports.length);
  const addMenuOpen = useUi((s) => s.addMenuOpen);
  const searchOpen = useUi((s) => s.searchOpen);
  const connecting = useUi((s) => s.connect.active);
  const panelOpen = useMatch("/node/:id") !== null;
  const narrow = useNarrow();
  const sheetOpen = useUi((s) => s.chatSheetOpen);
  const flow = useReactFlow();
  const fileInput = useRef<HTMLInputElement>(null);
  const { initialViewport, onViewportChange } = useViewport();
  const viewportCenter = useViewportCenter();
  const fitToBounds = useFitToBounds();
  useCitationHighlight();

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
    // Opens the rail if it is folded away, then the composer takes focus.
    uiStore.getState().openChat();
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

  // Auto-arrange is an action, never a mode: it runs here and nowhere else.
  const arrange = useCallback(() => {
    // The camera frames what the detail panel leaves uncovered.
    arrangeBoard((bounds) => fitToBounds(bounds, panelOpen && !isNarrow() ? PANEL_WIDTH : 0));
  }, [fitToBounds, panelOpen]);

  const toggleConnect = useCallback(() => {
    if (uiStore.getState().connect.active) exitConnect();
    else startConnect();
  }, []);

  // O5 — focus comes back to where it was, unless a result was chosen: then it goes to that card.
  const searchReturn = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    if (Object.keys(appStore.getState().nodes).length === 0) return false;
    if (!uiStore.getState().searchOpen) {
      const active = document.activeElement;
      searchReturn.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    uiStore.getState().setSearchOpen(true);
    return true;
  }, []);
  const closeSearch = useCallback(() => {
    uiStore.getState().setSearchOpen(false);
    searchReturn.current?.focus();
  }, []);
  const goTo = useGoToNode();
  const goToNode = useCallback(
    (node: CanvasNode) => {
      uiStore.getState().setSearchOpen(false);
      goTo(node, { zoom: SEARCH_FOCUS_ZOOM, focusCard: true });
    },
    [goTo],
  );
  const createFromSearch = useCallback(
    (title: string) => {
      uiStore.getState().setSearchOpen(false);
      void createNote(viewportCenter(), {
        title,
        onCreated: (node) => navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
      });
    },
    [navigate, viewportCenter],
  );

  // Below 900px the open chat sheet covers everything; keys must not act on what is hidden beneath it.
  useWorkspaceShortcuts(ready && !(narrow && sheetOpen), {
    onAdd: openAddMenu,
    onConnect: toggleConnect,
    onSearch: openSearch,
  });

  // The dock's keys (V P H E S T C, Esc). Like the others, they stand down while the sheet covers the canvas.
  useToolShortcuts(ready && !(narrow && sheetOpen));

  // A session that ended while a node was open signs in again and comes back to it.
  if (!token) return <Navigate to={signInTarget(location.pathname)} replace />;

  const state = ready ? "ready" : status === "error" ? "error" : "loading";
  // What the toolbar says to anything pressed before the board is there: still coming, or not coming.
  const waiting = ready ? null : state === "error" ? COPY.boardFailed : COPY.loading;

  return (
    // The rail sits beside the canvas as a column (an overlay below 900px); the canvas fills the rest.
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      <ChatRail />
      {/* One container for every state, so nothing shifts when the data lands. */}
      <main data-canvas-state={state} className="relative h-full min-w-0 flex-1 overflow-hidden bg-canvas">
        {/* First in the document, so Tab reaches the controls before it has to walk every card. */}
        <Toolbar
          ready={ready}
          failed={state === "error"}
          addMenuOpen={addMenuOpen}
          onAdd={openAddMenu}
          besidePanel={panelOpen}
          below={ready ? <ConnectBanner /> : null}
        >
          <ToolButton
            label="Connect"
            icon={<Spline size={14} aria-hidden="true" />}
            aria-label="Connect"
            aria-pressed={connecting}
            variant={connecting ? "active" : "secondary"}
            title={connecting ? "Leave connect mode — Esc" : "Connect two nodes — L"}
            disabledReason={waiting ?? (nodeCount < 2 ? CONNECT_COPY.needsTwo : null)}
            // Trying anyway gets the same explanation as the L key.
            onDisabledClick={() => ready && startConnect()}
            onClick={toggleConnect}
          />
          <ToolButton
            label="Search"
            icon={<Search size={14} aria-hidden="true" />}
            aria-label="Search"
            aria-haspopup="dialog"
            title="Search nodes — ⌘F / Ctrl+F"
            disabledReason={waiting ?? (nodeCount === 0 ? "Nothing to search yet." : null)}
            onClick={() => void openSearch()}
          />
          <ToolButton
            label="Auto-arrange"
            icon={<Network size={14} aria-hidden="true" />}
            aria-label="Auto-arrange"
            title="Auto-arrange — lay the nodes out by lineage"
            disabledReason={waiting ?? (nodeCount === 0 ? COPY.nothingToArrange : null)}
            onClick={arrange}
          />
        </Toolbar>

        <Dock onClearInk={() => uiStore.getState().setClearInkOpen(true)} />
        <InkOptions />
        <ToolHint />

        {/* The panels below are inside the drop zone, so a file dropped on one of them still lands. */}
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

          {state === "loading" ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span
                role="status"
                aria-label="Loading your board"
                className="grid size-6 animate-spin place-items-center rounded-full border-2 border-subtle border-t-accent [animation-duration:0.7s]"
              >
                <span className="sr-only">Loading your board</span>
              </span>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <ErrorState
                message={boardError?.code === "unexpected_response" ? COPY.boardUnreadable : COPY.boardLoadFailed}
                actionLabel="Reload"
                onAction={() => void appStore.getState().loadBoard()}
              />
            </div>
          ) : null}

          {ready && nodeCount === 0 && pendingCount === 0 ? (
            // The backdrop lets canvas gestures through; only the card itself takes clicks.
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <EmptyState
                title="Nothing on the canvas yet."
                body="Six kinds of node live here: goal, strategy, campaign, content, asset and note."
                action={
                  <Button variant="primary" className="mt-2 px-4 py-2 text-[13.5px]" onClick={openAddMenu}>
                    Add your first node
                  </Button>
                }
              />
            </div>
          ) : null}
        </FileDropZone>

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

        {ready ? <ClearInkDialog /> : null}
        {ready ? <QuickPeek onConnect={(id) => void startConnect(id)} /> : null}
        {ready ? <ConnectMode /> : null}
        {ready && searchOpen ? (
          <SearchOverlay onClose={closeSearch} onGo={goToNode} onCreateNote={createFromSearch} />
        ) : null}
        <Outlet />
        <ReasonTip />
        <ToastViewport contained />
      </main>
    </div>
  );
}
