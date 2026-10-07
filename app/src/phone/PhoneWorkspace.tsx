import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { ChatPanel } from "../chat/ChatRail";
import { startConnect } from "../canvas/connect";
import { ConnectMode } from "../canvas/ConnectMode";
import { FIT_MAX_ZOOM, FIT_PADDING } from "../canvas/useViewport";
import { CARD_WIDTH } from "../components/NodeCard";
import { QuickPeek } from "../components/QuickPeek";
import { ReasonTip } from "../components/ReasonTip";
import { ToastViewport } from "../components/Toast";
import { FILE_ACCEPT } from "../files/importFiles";
import { FindScreen } from "../find/FindScreen";
import { CanvasStage } from "../routes/CanvasStage";
import type { WorkspaceController } from "../routes/useWorkspace";
import { appStore } from "../store";
import { TraceScreen } from "../trace/TraceScreen";
import { uiStore, useUi } from "../ui/uiStore";
import { ClearInkDialog } from "../whiteboard/ClearInkDialog";
import { Dock } from "../whiteboard/Dock";
import { InkOptions } from "../whiteboard/InkOptions";
import { ToolHint } from "../whiteboard/ToolHint";
import { AddSheet } from "./AddSheet";
import { BoardBar } from "./BoardBar";
import { boardOutOfView } from "./boardView";
import { TabBar } from "./TabBar";

/** React 18 has no `inert` prop; the attribute still works when it is written out. */
const inertWhen = (inert: boolean): Record<string, string> => (inert ? { inert: "" } : {});

/**
 * One screen of the phone layout. The ones that are not shown are hidden with the `hidden` attribute, on a
 * wrapper that carries no `display` utility of its own: Tailwind's `.flex` would beat `[hidden]`.
 */
function Screen({ name, shown, children }: { name: string; shown: boolean; children: ReactNode }) {
  return (
    <section
      role="region"
      aria-label={name}
      data-phone-screen={name.toLowerCase()}
      hidden={!shown}
      className="absolute inset-0"
    >
      {children}
    </section>
  );
}

/**
 * The camera is the board's, one for every screen that opens it, so a phone can be handed one that a wider screen left,
 * zoomed out past reading on a phone, or on a corner with no card in it. The first time the Board is shown with such a
 * camera, it is brought to the goal being traced, at 100%, centred under the top bar, as design/mobile-direction.html shows
 * the board (with no goal, to all the cards). Show on board's own camera (at least 75%) is kept. Inside the canvas.
 */
/** Below this a card's text is too small to read on a phone; Show on board zooms to it at least. */
const PHONE_MIN_ZOOM = 0.75;

function BringBoardIntoView({ shown, ready }: { shown: boolean; ready: boolean }) {
  const flow = useReactFlow();
  const store = useStoreApi();
  const done = useRef(false);

  useEffect(() => {
    if (!shown || !ready || done.current) return;
    done.current = true;
    const { width, height, transform, domNode } = store.getState();
    const camera = { x: transform[0], y: transform[1], zoom: transform[2] };
    const nodes = Object.values(appStore.getState().nodes);
    const unreadable = camera.zoom < PHONE_MIN_ZOOM;
    if (!unreadable && !boardOutOfView(nodes, camera, { width, height }, 1 / Math.max(1, nodes.length))) return;
    const traced = uiStore.getState().tracePath[0];
    const goal = nodes.find((node) => node.id === traced && node.type === "goal") ?? nodes.find((node) => node.type === "goal");
    if (!goal) {
      void flow.fitView({ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: 0 });
      return;
    }
    // The goal's top edge tucks 8px under the top bar, the way the mockup crops it.
    const top = domNode?.getBoundingClientRect().top ?? 0;
    const bar = document.querySelector("[data-board-title]")?.getBoundingClientRect().bottom ?? top + 88;
    void flow.setViewport({ x: width / 2 - (goal.x + CARD_WIDTH / 2), y: bar - top - 8 - goal.y, zoom: 1 }, { duration: 0 });
  }, [shown, ready, flow, store]);

  return null;
}

/**
 * P1 — the phone layout (below 640px): four screens and a tab bar. The canvas is never unmounted, so the
 * camera, the selection and any file still being read survive a trip to another tab. It is hidden without
 * `display: none`, so React Flow keeps the size it measured: `inert` takes it out of Tab, touch and the
 * accessibility tree, and `opacity` out of sight. (`visibility: hidden` alone is not enough: React Flow
 * sets `visibility: visible` on every node, and a child may say so over its parent.)
 */
export function PhoneWorkspace({ w }: { w: WorkspaceController }) {
  const tab = useUi((s) => s.phoneTab);
  const {
    ready,
    state,
    addMenuOpen,
    fileInput,
    openAddMenu,
    closeAddMenu,
    addOfType,
    fromChat,
    pickFile,
    onPickFiles,
  } = w;
  const boardShown = tab === "board";

  return (
    <div
      data-phone-shell
      data-phone-tab={tab}
      // 15px is the mockup's body size, which every phone screen inherits.
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas text-[15px]"
    >
      <main data-canvas-state={state} className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <Screen name="Trace" shown={tab === "trace"}>
          <TraceScreen w={w} />
        </Screen>

        <section
          role="region"
          aria-label="Board"
          data-phone-screen="board"
          style={{ visibility: boardShown ? "visible" : "hidden", opacity: boardShown ? 1 : 0 }}
          {...inertWhen(!boardShown)}
          className="absolute inset-0"
        >
          <CanvasStage w={w} />
          <BringBoardIntoView shown={boardShown} ready={ready} />
          <BoardBar w={w} />
          <InkOptions layout="bar" />
          <Dock layout="bar" />
          <ToolHint />
          {ready ? <QuickPeek onConnect={(id) => void startConnect(id)} /> : null}
          {ready ? <ConnectMode /> : null}
        </section>

        <Screen name="Chat" shown={tab === "chat"}>
          <ChatPanel mode="screen" />
        </Screen>

        <Screen name="Find" shown={tab === "find"}>
          <FindScreen w={w} />
        </Screen>

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
        <ReasonTip />
        <ToastViewport contained />
      </main>

      <TabBar onAdd={openAddMenu} addOpen={addMenuOpen} />
      {/* The Add sheet rises over the bar, as a node's detail does. */}
      {addMenuOpen && ready ? (
        <AddSheet onClose={closeAddMenu} onType={addOfType} onFile={pickFile} onFromChat={fromChat} />
      ) : null}
      {/* A node's detail is the last thing in the shell and above the bar, so it covers it. */}
      <Outlet />
    </div>
  );
}
