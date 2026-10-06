import { MessageSquare, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "../components/Button";
import { useNarrow } from "../lib/useMediaQuery";
import { uiStore, useUi } from "../ui/uiStore";
import { BoardStrip } from "../phone/BoardStrip";
import { Composer } from "./Composer";
import { CHAT_OPEN_ID, focusChatOpenButton } from "./focus";
import { MessageList } from "./MessageList";
import { ModePicker } from "./ModePicker";

/**
 * O6 — the assistant. A 360px column beside the canvas that folds down to a 48px strip,
 * and below 900px an overlay sheet over the canvas, opened from a floating button.
 */
export function ChatRail() {
  const narrow = useNarrow();
  const collapsed = useUi((s) => s.railCollapsed);
  const sheetOpen = useUi((s) => s.chatSheetOpen);

  if (narrow) {
    return sheetOpen ? (
      <>
        <div
          aria-hidden="true"
          onClick={() => {
            uiStore.getState().setChatSheetOpen(false);
            focusChatOpenButton();
          }}
          className="fixed inset-0 z-[69] bg-[color-mix(in_srgb,var(--fg-primary)_28%,transparent)]"
        />
        <ChatPanel mode="sheet" />
      </>
    ) : (
      <Button
        id={CHAT_OPEN_ID}
        variant="primary"
        aria-label="Open assistant"
        title="Open the assistant"
        onClick={() => uiStore.getState().openChat()}
        className="fixed bottom-3.5 left-3.5 z-[35] !p-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,.5)]"
      >
        <MessageSquare size={17} aria-hidden="true" />
      </Button>
    );
  }

  return collapsed ? <Strip /> : <ChatPanel mode="column" />;
}

function Strip() {
  return (
    <aside
      aria-label="Assistant"
      data-chat-rail
      data-mode="column"
      data-collapsed="true"
      className="flex h-full w-12 flex-none flex-col items-center border-r border-subtle bg-rail pt-3.5"
    >
      <Button
        id={CHAT_OPEN_ID}
        variant="secondary"
        aria-label="Open assistant"
        title="Open the assistant"
        onClick={() => uiStore.getState().openChat()}
        className="!size-8 !p-0"
      >
        <PanelLeftOpen size={15} aria-hidden="true" />
      </Button>
    </aside>
  );
}

/**
 * What the assistant is shown as: a column beside the canvas, a sheet over it (tablet widths), or, on a
 * phone, a screen of its own with no way to close it: the tab bar is how you leave.
 */
export type ChatPanelMode = "column" | "sheet" | "screen";

export function ChatPanel({ mode }: { mode: ChatPanelMode }) {
  const sheet = mode === "sheet";
  const screen = mode === "screen";

  function dismiss() {
    if (sheet) uiStore.getState().setChatSheetOpen(false);
    else uiStore.getState().setRailCollapsed(true);
    focusChatOpenButton();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!sheet || event.key !== "Escape" || event.defaultPrevented) return;
    // Claimed here so the detail panel's own Escape does not close as well.
    event.preventDefault();
    dismiss();
  }

  return (
    <aside
      aria-label="Assistant"
      data-chat-rail
      data-mode={mode}
      onKeyDown={onKeyDown}
      className={[
        "flex flex-col bg-rail",
        screen ? "h-full" : "border-r border-subtle",
        sheet
          ? "fixed inset-y-0 left-0 z-[70] w-[min(360px,88vw)] animate-mc-rise shadow-[0_0_60px_-18px_rgba(0,0,0,.5)]"
          : screen
            ? ""
            : "h-full w-[360px] flex-none",
      ].join(" ")}
    >
      <header
        className={`flex flex-none items-center justify-between border-b border-subtle px-4 ${
          // The page draws to the screen's edge on a phone: its first line starts below the notch.
          screen ? "pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]" : "py-3.5"
        }`}
      >
        <h2 className="m-0 flex items-center gap-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.13em] text-muted">
          <span aria-hidden="true" className="size-[9px] rounded-full bg-node-goal" />
          <span aria-hidden="true" className="-ml-1.5 size-[9px] rounded-full bg-node-strategy" />
          Assistant
        </h2>
        {screen ? null : (
          <Button
            variant="ghost"
            aria-label={sheet ? "Close assistant" : "Collapse assistant"}
            title={sheet ? "Close the assistant — Esc" : "Collapse the assistant"}
            onClick={dismiss}
            className="!size-7 !p-0 text-muted"
          >
            {sheet ? <X size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
          </Button>
        )}
      </header>
      {/* On a phone the picture of the board and the reply modes sit above the conversation, and the composer is a row. */}
      {screen ? <BoardStrip /> : null}
      {screen ? (
        <div className="flex-none px-3 pt-2.5">
          <ModePicker />
        </div>
      ) : null}
      <MessageList />
      <Composer compact={screen} />
    </aside>
  );
}
