import { MessageSquare, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "../components/Button";
import { useNarrow } from "../lib/useMediaQuery";
import { uiStore, useUi } from "../ui/uiStore";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

const OPEN_ID = "chat-open";

/** Focus follows the control that replaced the one you used, instead of falling to the page. */
const focusOpenButton = () => requestAnimationFrame(() => document.getElementById(OPEN_ID)?.focus());

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
            focusOpenButton();
          }}
          className="fixed inset-0 z-[69] bg-[color-mix(in_srgb,var(--fg-primary)_28%,transparent)]"
        />
        <Panel mode="sheet" />
      </>
    ) : (
      <Button
        id={OPEN_ID}
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

  return collapsed ? <Strip /> : <Panel mode="column" />;
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
        id={OPEN_ID}
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

function Panel({ mode }: { mode: "column" | "sheet" }) {
  const sheet = mode === "sheet";

  function dismiss() {
    if (sheet) uiStore.getState().setChatSheetOpen(false);
    else uiStore.getState().setRailCollapsed(true);
    focusOpenButton();
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
        "flex flex-col border-r border-subtle bg-rail",
        sheet
          ? "fixed inset-y-0 left-0 z-[70] w-[min(360px,88vw)] animate-mc-rise shadow-[0_0_60px_-18px_rgba(0,0,0,.5)]"
          : "h-full w-[360px] flex-none",
      ].join(" ")}
    >
      <header className="flex flex-none items-center justify-between border-b border-subtle px-4 py-3.5">
        <h2 className="m-0 flex items-center gap-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.13em] text-muted">
          <span aria-hidden="true" className="size-[9px] rounded-full bg-node-goal" />
          <span aria-hidden="true" className="-ml-1.5 size-[9px] rounded-full bg-node-strategy" />
          Assistant
        </h2>
        <Button
          variant="ghost"
          aria-label={sheet ? "Close assistant" : "Collapse assistant"}
          title={sheet ? "Close the assistant — Esc" : "Collapse the assistant"}
          onClick={dismiss}
          className="!size-7 !p-0 text-muted"
        >
          {sheet ? <X size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
        </Button>
      </header>
      <MessageList />
      <Composer />
    </aside>
  );
}
