import { LoaderCircle, SendHorizontal } from "lucide-react";
import { PhoneIcon } from "../phone/icons";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { explainWhy, useSendBoard } from "../whiteboard/useBoardActions";
import { ModePicker } from "./ModePicker";

/** The API refuses a message longer than this (api/README.md § Chat), so the box stops there. */
export const MAX_MESSAGE = 5000;

/** The compact field grows with what is written, to about four lines, and scrolls after that. */
const MAX_FIELD_HEIGHT = 120;

/**
 * The message box. Enter sends and Shift+Enter starts a new line. While a reply is
 * streaming it stays focusable (so focus is not thrown away mid-conversation) but
 * is read-only and says it is busy: nothing can be sent until the reply is done.
 *
 * On a phone it is `compact`: one row of a button that sends the board, a 16px field (so the browser does not zoom
 * the page when it takes focus) that grows to a few lines, and Send. Shift+Enter is out of reach of a phone's keyboard, so
 * Enter adds a line there and Send is how a message goes; the reply modes are shown by the screen, above the conversation.
 */
export function Composer({ compact = false }: { compact?: boolean }) {
  const draft = useUi((s) => s.chatDraft);
  const focusPending = useUi((s) => s.composerFocusPending);
  const streaming = useStore(appStore, (s) => s.chatStreaming);
  const board = useSendBoard();
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = draft.trim() === "";

  // "From chat" asks for focus before this exists (a collapsed rail, a closed sheet) as often as after.
  useEffect(() => {
    if (!focusPending) return;
    field.current?.focus();
    uiStore.getState().consumeComposerFocus();
  }, [focusPending]);

  // The compact field is as tall as what is in it, up to a point.
  useLayoutEffect(() => {
    const el = field.current;
    if (!compact || !el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  }, [draft, compact]);

  function send() {
    if (streaming || empty) return;
    uiStore.getState().setChatDraft("");
    void appStore.getState().sendChat(draft, uiStore.getState().chatMode);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (compact) return; // Enter is a new line here; Send sends
    // Enter while an input method is composing confirms the composition; it is not "send".
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  const sendReason = streaming ? COPY.waitForReply : empty ? COPY.chatWriteFirst : null;

  if (compact) {
    return (
      // The mockup's composer: two 42px rounds either side of a 43px pill. The field's text stays 16px, as every field on a
      // phone does, so the browser does not zoom the page when it takes focus.
      <div className="flex flex-none items-end gap-2 border-t border-subtle bg-panel px-3 pb-2.5 pt-2">
        <Button
          variant="secondary"
          aria-label="Send the board"
          aria-busy={board.preparing || undefined}
          title={COPY.sendBoard}
          disabledReason={board.reason}
          onDisabledClick={() => explainWhy(board.reason)}
          onClick={board.send}
          className="!size-[42px] flex-none !rounded-full !border-strong !bg-transparent !p-0 !text-muted"
        >
          {board.preparing ? (
            <LoaderCircle size={18} aria-hidden="true" className="animate-spin" />
          ) : (
            <PhoneIcon name="scan" />
          )}
        </Button>
        <textarea
          ref={field}
          data-chat-composer
          aria-label="Message"
          aria-disabled={streaming || undefined}
          readOnly={streaming}
          rows={1}
          maxLength={MAX_MESSAGE}
          value={draft}
          placeholder={COPY.chatPlaceholderPhone}
          onChange={(event) => uiStore.getState().setChatDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className={`block min-h-[43px] min-w-0 flex-1 resize-none rounded-[21px] border bg-elevated px-3.5 py-[10px] text-base leading-[21px] text-primary placeholder:text-muted ${
            streaming ? "border-subtle opacity-60" : "border-strong"
          }`}
        />
        <Button
          variant="primary"
          aria-label="Send"
          disabledReason={sendReason}
          onDisabledClick={() => explainWhy(sendReason)}
          onClick={send}
          className="!size-[42px] flex-none !rounded-full !border-0 !p-0 !text-white"
        >
          <PhoneIcon name="send" />
        </Button>
      </div>
    );
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
          <Button variant="primary" className="flex-none" disabledReason={sendReason} onClick={send}>
            <SendHorizontal size={13} aria-hidden="true" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
