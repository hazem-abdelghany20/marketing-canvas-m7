import { useReactFlow } from "@xyflow/react";
import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useStore } from "zustand";
import { CONNECT_COPY } from "../canvas/connect";
import { FIT_MAX_ZOOM, FIT_PADDING } from "../canvas/useViewport";
import { ConnectBanner } from "../canvas/ConnectMode";
import { MenuItem } from "../components/AddNodeMenu";
import { Button } from "../components/Button";
import { UndoButton } from "../components/UndoButton";
import { menuItems, useMenuKeys } from "../components/useMenuKeys";
import { motionMs } from "../lib/motion";
import type { WorkspaceController } from "../routes/useWorkspace";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { availability } from "../whiteboard/toolMode";
import { pickTool } from "../whiteboard/useToolShortcuts";
import { explainWhy, useSavePng, useSendBoard } from "../whiteboard/useBoardActions";
import { PhoneIcon } from "./icons";

/**
 * P3 — the Board tab's top bar, as design/mobile-direction.html draws it: a pill with the board's name and Undo, and Ask
 * about this, which sends the board to the assistant. The name is a button: it opens the board's actions, what the desktop
 * toolbar and the dock's lower half held (Connect, Auto-arrange, Fit, Save as PNG, Clear ink) and the Text tool, which
 * the mockup's dock has no room for. It is one toolbar, so the layout specs that look for "Canvas tools" find it here as they do on a desktop.
 */
export function BoardBar({ w }: { w: WorkspaceController }) {
  const board = useStore(appStore, (s) => s.board);
  const send = useSendBoard();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) more.current?.focus();
  }

  return (
    <div className="absolute inset-x-3 top-[max(12px,calc(env(safe-area-inset-top)+6px))] z-30 flex flex-col items-stretch gap-2">
      <div role="toolbar" aria-label="Canvas tools" className="flex items-center gap-2">
        <div
          data-board-title
          className="flex h-[42px] min-w-0 flex-1 items-center gap-1 rounded-[14px] border border-subtle bg-panel pl-3.5 pr-1 shadow-[0_6px_18px_-8px_rgba(30,20,10,.25)]"
        >
          <button
            ref={more}
            type="button"
            aria-label={`${board?.name ?? "Board"}, more board actions`}
            aria-haspopup="menu"
            aria-expanded={open}
            title="More board actions"
            onClick={() => setOpen((was) => !was)}
            className="h-full min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[14.5px] font-semibold text-primary [touch-action:manipulation]"
          >
            {board?.name ?? ""}
          </button>
          <UndoButton ready={w.ready} className="!size-[34px]" />
        </div>
        <Button
          variant="primary"
          aria-busy={send.preparing || undefined}
          title={COPY.sendBoard}
          disabledReason={send.reason}
          // A touch screen has no tooltip: tapping what can't be used says why.
          onDisabledClick={() => explainWhy(send.reason)}
          onClick={send.send}
          className="h-[42px] flex-none !gap-1.5 !rounded-[14px] !border-0 !px-3.5 !py-0 !text-[13.5px] !font-medium !text-white"
        >
          {send.preparing ? (
            <LoaderCircle size={18} aria-hidden="true" className="animate-spin" />
          ) : (
            <PhoneIcon name="scan" />
          )}
          Ask about this
        </Button>
      </div>

      {w.ready ? (
        <div className="flex justify-center">
          <ConnectBanner />
        </div>
      ) : null}

      {open ? <BoardMenu w={w} onClose={close} /> : null}
    </div>
  );
}

function BoardMenu({ w, onClose }: { w: WorkspaceController; onClose: (restoreFocus?: boolean) => void }) {
  const flow = useReactFlow();
  const menu = useRef<HTMLDivElement | null>(null);
  const save = useSavePng();
  const connecting = useUi((s) => s.connect.active);
  const hasInk = useStore(appStore, (s) => Object.keys(s.strokes).length > 0);
  const onKeyDown = useMenuKeys(menu, onClose);

  // The first item takes focus as the menu opens, as the add menu's does.
  const focused = useRef(false);
  const place = (el: HTMLDivElement | null) => {
    menu.current = el;
    if (el && !focused.current) {
      focused.current = true;
      menuItems(el)[0]?.focus();
    }
  };

  /** Closes the menu, then does the thing: focus goes back to More first, so an action that moves it can have the last word. */
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };

  const { waiting, nodeCount } = w;
  const textReason = availability("text", { boardReady: w.ready, connecting, hasInk }).reason;
  return (
    <>
      <div aria-hidden="true" data-menu-backdrop className="fixed inset-0 z-40" onClick={() => onClose(false)} />
      <div
        ref={place}
        role="menu"
        aria-label="Board actions"
        onKeyDown={onKeyDown}
        className="absolute left-0 top-[50px] z-[41] w-[min(260px,100%)] animate-mc-pop rounded-md border border-subtle bg-panel p-1.5 shadow-[0_18px_44px_-22px_rgba(0,0,0,.5)]"
      >
        {/* What can't be used says why in the item itself: there is no tooltip under a finger. */}
        <MenuItem
          label={connecting ? "Leave connect mode" : "Connect"}
          hint={connecting ? "Stop picking nodes" : "Pick two nodes to join"}
          reasonAsHint
          disabledReason={connecting ? null : (waiting ?? (nodeCount < 2 ? CONNECT_COPY.needsTwo : null))}
          onSelect={choose(w.toggleConnect)}
        />
        <MenuItem
          label="Text"
          hint="Type text on the board"
          reasonAsHint
          disabledReason={textReason}
          onSelect={choose(() => pickTool("text"))}
        />
        <MenuItem
          label="Auto-arrange"
          hint="Lay the nodes out by lineage"
          reasonAsHint
          disabledReason={waiting ?? (nodeCount === 0 ? COPY.nothingToArrange : null)}
          onSelect={choose(w.arrange)}
        />
        <MenuItem
          label="Fit to screen"
          hint="Zoom to show every node"
          reasonAsHint
          disabledReason={waiting ?? (nodeCount === 0 ? COPY.nothingToFit : null)}
          onSelect={choose(
            () => void flow.fitView({ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: motionMs(300) }),
          )}
        />
        <MenuItem
          label="Save as PNG"
          hint="Download the board as a picture"
          reasonAsHint
          disabledReason={save.reason}
          onSelect={choose(save.save)}
        />
        {hasInk ? (
          <MenuItem
            label="Clear ink"
            hint="Remove every stroke of ink"
            onSelect={choose(() => uiStore.getState().setClearInkOpen(true))}
          />
        ) : null}
      </div>
    </>
  );
}
