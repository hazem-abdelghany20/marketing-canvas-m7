import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { ModePicker } from "./ModePicker";

/** The API refuses a message longer than this (api/README.md § Chat), so the box stops there. */
export const MAX_MESSAGE = 5000;

/**
 * The message box. Enter sends and Shift+Enter starts a new line. While a reply is
 * streaming it stays focusable (so focus is not thrown away mid-conversation) but
 * is read-only and says it is busy: nothing can be sent until the reply is done.
 */
export function Composer() {
  const draft = useUi((s) => s.chatDraft);
  const focusPending = useUi((s) => s.composerFocusPending);
  const streaming = useStore(appStore, (s) => s.chatStreaming);
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = draft.trim() === "";

  // "From chat" asks for focus before this exists (a collapsed rail, a closed sheet) as often as after.
  useEffect(() => {
    if (!focusPending) return;
    field.current?.focus();
    uiStore.getState().consumeComposerFocus();
  }, [focusPending]);

  function send() {
    if (streaming || empty) return;
    uiStore.getState().setChatDraft("");
    void appStore.getState().sendChat(draft, uiStore.getState().chatMode);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while an input method is composing confirms the composition; it is not "send".
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  return (
    <div className="flex-none border-t border-subtle p-3">
      <ModePicker />
      <div
        className={`rounded-md border bg-elevated p-[11px] ${streaming ? "border-subtle opacity-60" : "border-strong"}`}
      >
        <textarea
          ref={field}
          data-chat-composer
          aria-label="Message"
          aria-disabled={streaming || undefined}
          readOnly={streaming}
          rows={2}
          maxLength={MAX_MESSAGE}
          value={draft}
          placeholder={COPY.chatPlaceholder}
          onChange={(event) => uiStore.getState().setChatDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-normal text-primary placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[9.5px] text-muted">
            {streaming ? COPY.chatHintBusy : COPY.chatHint}
          </span>
          <Button
            variant="primary"
            className="flex-none"
            disabledReason={streaming ? COPY.waitForReply : empty ? COPY.chatWriteFirst : null}
            onClick={send}
          >
            <SendHorizontal size={13} aria-hidden="true" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
