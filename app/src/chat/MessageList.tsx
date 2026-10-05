import { useLayoutEffect, useRef } from "react";
import { useStore } from "zustand";
import { useGoToNode } from "../canvas/useGoToNode";
import { ChatMessage } from "../components/ChatMessage";
import { isNarrow } from "../lib/useMediaQuery";
import { appStore } from "../store";
import { CHAT_EXAMPLES, COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { focusChatOpenButton } from "./focus";
import { useApplyProposal } from "./useApplyProposal";

/** Within this many pixels of the bottom counts as "following along". */
const FOLLOW_SLACK = 80;

/** The conversation, kept scrolled to the newest words unless you have scrolled up to read. */
export function MessageList() {
  const messages = useStore(appStore, (s) => s.chatMessages);
  const streaming = useStore(appStore, (s) => s.chatStreaming);
  const goTo = useGoToNode();
  const apply = useApplyProposal();
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const count = useRef(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // A message you just sent always scrolls into view.
    if (messages.length > count.current) following.current = true;
    count.current = messages.length;
    // Set directly, never smoothly: tokens arrive faster than a smooth scroll can follow.
    if (following.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages.length === 0) return <EmptyChat />;

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK;
      }}
      // Focusable so the arrow keys can scroll a long conversation that has nothing else to tab to.
      tabIndex={0}
      role="region"
      aria-label="Conversation history"
      className="min-h-0 flex-1 overflow-y-auto p-4"
    >
      <ol role="list" aria-label="Conversation" className="m-0 flex list-none flex-col gap-4 p-0">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            busy={streaming}
            onApply={apply}
            // Focus stays on the chip: the person is reading the conversation, not working the canvas.
            onCite={(node) => {
              // Below 900px the sheet covers the canvas; the pan is no use to anyone behind it.
              if (isNarrow() && uiStore.getState().chatSheetOpen) {
                uiStore.getState().setChatSheetOpen(false);
                focusChatOpenButton();
              }
              goTo(node, { minZoom: 0.75 });
            }}
            onRetry={(id) => {
              // The Retry button is replaced by the streaming reply; focus goes to the composer, not the page.
              uiStore.getState().prefillChatFocus();
              void appStore.getState().retryChat(id);
            }}
          />
        ))}
      </ol>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-3 pt-1.5">
        <p className="m-0 text-sm leading-[1.55] text-muted">{COPY.chatEmptyPrompt}</p>
        <ul role="list" aria-label="Example prompts" className="m-0 flex list-none flex-col gap-3 p-0">
          {CHAT_EXAMPLES.map((example) => (
            <li key={example.mode}>
              <button
                type="button"
                onClick={() => uiStore.getState().prefillChat(example.text)}
                className="block w-full rounded-md border border-subtle bg-elevated px-3 py-2.5 text-left text-[13px] leading-snug text-primary"
              >
                <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                  {example.mode}
                </span>
                <span>{example.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
