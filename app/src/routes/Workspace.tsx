import { ReactFlowProvider } from "@xyflow/react";
import { Network, Search, Spline } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { signInTarget } from "../auth/expired";
import { ChatRail } from "../chat/ChatRail";
import { CONNECT_COPY, startConnect } from "../canvas/connect";
import { ConnectBanner, ConnectMode } from "../canvas/ConnectMode";
import { AddNodeMenu, MenuItem } from "../components/AddNodeMenu";
import { QuickPeek } from "../components/QuickPeek";
import { ReasonTip } from "../components/ReasonTip";
import { SearchOverlay } from "../components/SearchOverlay";
import { ToastViewport } from "../components/Toast";
import { Toolbar, ToolButton } from "../components/Toolbar";
import { FILE_ACCEPT } from "../files/importFiles";
import { usePhone } from "../lib/useMediaQuery";
import { PhoneWorkspace } from "../phone/PhoneWorkspace";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { ClearInkDialog } from "../whiteboard/ClearInkDialog";
import { Dock } from "../whiteboard/Dock";
import { InkOptions } from "../whiteboard/InkOptions";
import { ToolHint } from "../whiteboard/ToolHint";
import { CanvasStage } from "./CanvasStage";
import { useWorkspace, type WorkspaceController } from "./useWorkspace";

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
  const location = useLocation();
  const workspace = useWorkspace();
  const phone = usePhone();

  // A session that ended while a node was open signs in again and comes back to it.
  if (!workspace.token) return <Navigate to={signInTarget(location.pathname)} replace />;

  // Below 640px the workspace is four screens and a bar; from there up it is the canvas with panels over it.
  return phone ? <PhoneWorkspace w={workspace} /> : <DesktopWorkspace w={workspace} />;
}

/** The wide layout: the rail beside the canvas, the toolbar and the dock floating over it. */
function DesktopWorkspace({ w }: { w: WorkspaceController }) {
  const {
    ready,
    state,
    waiting,
    nodeCount,
    addMenuOpen,
    searchOpen,
    connecting,
    panelOpen,
    fileInput,
    openAddMenu,
    closeAddMenu,
    addNote,
    fromChat,
    pickFile,
    onPickFiles,
    arrange,
    toggleConnect,
    openSearch,
    closeSearch,
    goToNode,
    createFromSearch,
  } = w;

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

        <CanvasStage w={w} />

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
