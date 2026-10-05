import { useStore } from "zustand";
import { Markdown } from "../chat/markdown";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import type { CanvasNode, ChatMessage as Message } from "../types";
import { Button } from "./Button";
import { TYPE_BG } from "./TypeChip";

interface ChatMessageProps {
  message: Message;
  /** Another reply is streaming, so asking again has to wait. */
  busy: boolean;
  onRetry: (id: string) => void;
  /** A citation chip was used: go to that node. */
  onCite: (node: CanvasNode) => void;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * One turn of the conversation. A reply is announced to assistive technology once, when
 * it is complete: its words arrive in a plain region, and a separate, visually hidden
 * status region receives the finished text in one go.
 */
export function ChatMessage({ message, busy, onRetry, onCite }: ChatMessageProps) {
  const mine = message.role === "user";
  const streaming = message.status === "streaming";
  const waiting = streaming && message.content === "";
  const label = mine ? "You" : message.mode ? `Assistant · ${message.mode}` : "Assistant";

  return (
    <li
      data-chat-message={message.role}
      data-status={message.status}
      aria-busy={mine ? undefined : streaming}
      className="flex flex-col items-stretch"
    >
      <div className="mb-1.5 flex items-center gap-[7px]">
        <span
          aria-hidden="true"
          className={`grid size-[17px] flex-none place-items-center rounded-full text-[9px] text-inverse ${mine ? "bg-strong" : "bg-accent"}`}
        >
          {mine ? "Y" : "◆"}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">{label}</span>
        <time dateTime={message.createdAt} className="font-mono text-[9.5px] text-muted opacity-70">
          {time(message.createdAt)}
        </time>
      </div>

      {waiting ? (
        <span className="inline-flex gap-1 py-0.5">
          <span className="sr-only">{COPY.chatReplying}</span>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              aria-hidden="true"
              style={{ animationDelay: `${delay}ms` }}
              className="size-[5px] animate-mc-pulse rounded-full bg-muted"
            />
          ))}
        </span>
      ) : null}

      {mine || message.content ? (
        <div
          data-chat-body
          // Once finished, the status region below carries the reply; one copy for a screen reader.
          aria-hidden={!mine && message.status === "done" ? true : undefined}
          className={[
            "text-[13.5px] leading-[1.55] text-primary",
            mine ? "whitespace-pre-wrap rounded-md border border-subtle bg-elevated px-[11px] py-[9px]" : "",
          ].join(" ")}
        >
          {mine ? message.content : <Markdown text={message.content} />}
          {streaming ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-[7px] animate-mc-pulse bg-accent align-[-2px]"
            />
          ) : null}
        </div>
      ) : null}

      {mine ? null : (
        <div role="status" aria-label="Assistant reply" className="sr-only">
          {message.status === "done" ? <Markdown text={message.content} /> : null}
        </div>
      )}

      {message.status === "done" ? <Citations ids={message.citedNodeIds} onCite={onCite} /> : null}

      {message.status === "error" ? (
        <div className="mt-2 flex items-center gap-2.5">
          <span role="alert" className="text-[12.5px] text-danger">
            {COPY.chatReplyFailed}
          </span>
          <Button
            className="!px-[9px] !py-1 text-xs"
            disabledReason={busy ? COPY.waitForReply : null}
            onClick={() => onRetry(message.id)}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * A chip for each node the reply cited, named by the node's title. A node that has been
 * deleted since has no chip; the others are unaffected.
 */
function Citations({ ids, onCite }: { ids: string[]; onCite: (node: CanvasNode) => void }) {
  const nodes = useStore(appStore, (s) => s.nodes);
  const cited = ids.flatMap((id) => (nodes[id] ? [nodes[id]] : []));
  if (cited.length === 0) return null;

  return (
    <ul role="list" aria-label="Cited nodes" className="m-0 mt-[9px] flex list-none flex-wrap gap-1.5 p-0">
      {cited.map((node) => (
        <li key={node.id} className="max-w-full">
          <button
            type="button"
            onClick={() => onCite(node)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-subtle bg-elevated px-2.5 py-1 text-[11.5px] text-primary"
          >
            <span aria-hidden="true" className={`size-1.5 flex-none rounded-full ${TYPE_BG[node.type]}`} />
            <span className="truncate">{node.title.trim() || "Untitled"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
