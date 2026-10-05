import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "../components/Button";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";

/** Clears every stroke, once confirmed. A failed request puts the ink back and offers to try again. */
export function clearInk() {
  appStore
    .getState()
    .clearStrokes()
    .catch(() =>
      uiStore.getState().toast({
        message: COPY.clearInkFailed,
        tone: "danger",
        actionLabel: "Retry",
        onAction: clearInk,
      }),
    );
}

/**
 * "Clear all ink?" — removing every stroke is not undoable as one step, so it is confirmed instead.
 * It opens on Cancel, so the safe answer is the default one; Escape and a click outside both cancel.
 */
export function ClearInkDialog() {
  const open = useUi((s) => s.clearInkOpen);
  const cancel = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
    cancel.current?.focus();
  }, [open]);

  if (!open) return null;

  function close(restoreFocus = true) {
    uiStore.getState().setClearInkOpen(false);
    if (restoreFocus) returnTo.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      // Answered here, so nothing behind it (the tool in hand, a panel) also gives way to this Escape.
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="absolute inset-0 z-[60] grid place-items-center p-6" onKeyDown={onKeyDown}>
      <div
        aria-hidden="true"
        onClick={() => close()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--fg-primary)_28%,transparent)]"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={COPY.clearInkTitle}
        aria-describedby="clear-ink-body"
        className="relative w-[min(380px,100%)] animate-mc-pop rounded-lg border border-subtle bg-panel p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,.6)]"
      >
        <h2 className="m-0 text-[15px] font-semibold text-primary">{COPY.clearInkTitle}</h2>
        <p id="clear-ink-body" className="mb-4 mt-1.5 text-[13px] leading-snug text-muted">
          {COPY.clearInkBody}
        </p>
        <div className="flex justify-end gap-2">
          <Button ref={cancel} onClick={() => close()}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="!border-danger"
            onClick={() => {
              close(false);
              clearInk();
            }}
          >
            Clear ink
          </Button>
        </div>
      </div>
    </div>
  );
}
