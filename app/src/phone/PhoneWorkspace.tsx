import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { ChatPanel } from "../chat/ChatRail";
import { startConnect } from "../canvas/connect";
import { ConnectMode } from "../canvas/ConnectMode";
import { AddNodeMenu, MenuItem } from "../components/AddNodeMenu";
import { QuickPeek } from "../components/QuickPeek";
import { ReasonTip } from "../components/ReasonTip";
import { ToastViewport } from "../components/Toast";
import { FILE_ACCEPT } from "../files/importFiles";
import { CanvasStage } from "../routes/CanvasStage";
import type { WorkspaceController } from "../routes/useWorkspace";
import { uiStore, useUi } from "../ui/uiStore";
import { ClearInkDialog } from "../whiteboard/ClearInkDialog";
import { Dock } from "../whiteboard/Dock";
import { InkOptions } from "../whiteboard/InkOptions";
import { ToolHint } from "../whiteboard/ToolHint";
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

/** A screen whose ticket has not landed yet. */
function Soon({ title }: { title: string }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <h2 className="m-0 mb-1 text-[17px] font-semibold text-primary">{title}</h2>
        <p className="m-0 text-sm text-muted">This screen is on its way.</p>
      </div>
    </div>
  );
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
  const { ready, state, addMenuOpen, fileInput, openAddMenu, closeAddMenu, addNote, fromChat, pickFile, onPickFiles } = w;
  const boardShown = tab === "board";

  return (
    <div data-phone-shell data-phone-tab={tab} className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas">
      <main data-canvas-state={state} className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <Screen name="Trace" shown={tab === "trace"}>
          <Soon title="Trace" />
        </Screen>

        <section
          role="region"
          aria-label="Board"
          data-phone-screen="board"
          style={{ visibility: boardShown ? "visible" : "hidden", opacity: boardShown ? 1 : 0 }}
          {...inertWhen(!boardShown)}
          className="absolute inset-0"
        >
          <Dock onClearInk={() => uiStore.getState().setClearInkOpen(true)} />
          <InkOptions />
          <ToolHint />
          <CanvasStage w={w} />
          {ready ? <QuickPeek onConnect={(id) => void startConnect(id)} /> : null}
          {ready ? <ConnectMode /> : null}
        </section>

        <Screen name="Chat" shown={tab === "chat"}>
          <ChatPanel mode="screen" />
        </Screen>

        <Screen name="Find" shown={tab === "find"}>
          <Soon title="Find" />
        </Screen>

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
        <ReasonTip />
        <ToastViewport contained />
      </main>

      <TabBar onAdd={openAddMenu} addOpen={addMenuOpen} />
      {/* A node's detail is the last thing in the shell and above the bar, so it covers it. */}
      <Outlet />
    </div>
  );
}
