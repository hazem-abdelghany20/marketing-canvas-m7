import { useRef, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import type { ChatMode } from "../types";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";

/**
 * The four ways to ask. `operator` is not one of them: it acts on two named nodes, which Auto notices by
 * itself, and choosing it beforehand would leave you in a mode that cannot act (api/README.md § Chat).
 */
export const CHAT_MODE_OPTIONS: ReadonlyArray<{ id: ChatMode; label: string; tip: string }> = [
  { id: "auto", label: "Auto", tip: "Pick the right mode from what you type" },
  { id: "generator", label: "Generator", tip: "Draft new work: scripts, captions, briefs" },
  { id: "librarian", label: "Librarian", tip: "Find and trace what is already on the board" },
  { id: "reasoner", label: "Reasoner", tip: "Audit the board: what is disconnected, and what no goal reaches" },
];

/**
 * Chooses how the next message is answered. A radio group: the chosen one is the only tab stop and the
 * arrow keys move the choice. While a reply is streaming it can't be changed (a reply in flight was asked
 * one way), and says to wait.
 */
export function ModePicker() {
  const chosen = useUi((s) => s.chatMode);
  const busy = useStore(appStore, (s) => s.chatStreaming);
  const group = useRef<HTMLDivElement>(null);

  function choose(mode: ChatMode) {
    if (!busy) uiStore.getState().setChatMode(mode);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || busy) return;
    const radios = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = radios.findIndex((r) => r === document.activeElement);
    if (at === -1) return;
    event.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length]!;
    next.focus();
    next.click();
  }

  return (
    <div ref={group} role="radiogroup" aria-label="Reply mode" onKeyDown={onKeyDown} className="mb-2 flex gap-1">
      {CHAT_MODE_OPTIONS.map((mode) => {
        const on = chosen === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={busy || undefined}
            tabIndex={on ? 0 : -1}
            title={busy ? COPY.waitForReply : mode.tip}
            onClick={() => choose(mode.id)}
            className={[
              "flex-1 rounded-sm border px-1 py-[5px] text-[11px]",
              on ? "border-primary bg-primary font-semibold text-inverse" : "border-subtle bg-elevated text-muted",
              busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            ].join(" ")}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
