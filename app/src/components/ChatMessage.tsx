import { Check } from "lucide-react";
import { useId } from "react";
import { useStore } from "zustand";
import { Markdown } from "../chat/markdown";
import { appStore } from "../store";
import { isProposalApplied } from "../store/chat";
import { COPY } from "../ui/copy";
import { useUi } from "../ui/uiStore";
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
  /** Add to canvas was used. Resolves once the proposal has been applied, or refused, or has failed. */
  onApply: (message: Message) => Promise<void>;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * One turn of the conversation. A reply is announced to assistive technology once, when
 * it is complete: its words arrive in a plain region, and a separate, visually hidden
 * status region receives the finished text in one go.
 */
export function ChatMessage({ message, busy, onRetry, onCite, onApply }: ChatMessageProps) {
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

      {mine && message.image ? (
        <img
          src={message.image}
          alt="Your board, as sent"
          data-chat-image
          className="mt-2 max-h-44 w-full rounded-md border border-subtle bg-canvas object-contain"
        />
      ) : null}

      {mine ? null : (
        <div role="status" aria-label="Assistant reply" className="sr-only">
          {message.status === "done" ? <Markdown text={message.content} /> : null}
        </div>
      )}

      {message.status === "done" ? <Citations ids={message.citedNodeIds} onCite={onCite} /> : null}

      {message.status === "done" && message.proposal ? <ProposalCard message={message} onApply={onApply} /> : null}

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

/** A reply's suggestion, with the one action that turns it into something on the canvas. */
function ProposalCard({ message, onApply }: { message: Message; onApply: (message: Message) => Promise<void> }) {
  const nodes = useStore(appStore, (s) => s.nodes);
  const applied = useStore(appStore, (s) => isProposalApplied(s, message.id));
  const applying = useUi((s) => s.applyingProposals.includes(message.id));
  const labelId = useId();
  const proposal = message.proposal!;

  const titleOf = (id: string | undefined) =>
    (id && (nodes[id]?.title.trim() || message.proposalTitles?.[id])) || "Untitled";
  const isNode = proposal.kind === "create-node";
  const label = isNode
    ? proposal.payload.title?.trim() || "Untitled"
    : `${titleOf(proposal.payload.fromId)} \u2192 ${titleOf(proposal.payload.toId)}`;
  const preview = isNode ? proposal.payload.body?.trim() : "";

  return (
    <div data-chat-proposal className="mt-2.5 rounded-md border border-dashed border-strong bg-rail px-3 py-[11px]">
      <div className="mb-[5px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
        {isNode ? COPY.proposalNode : COPY.proposalConnection}
      </div>
      <div id={labelId} className="text-[13.5px] font-semibold leading-snug text-primary">
        {label}
      </div>
      {preview ? (
        <div className="mt-[5px] line-clamp-4 whitespace-pre-wrap text-[12.5px] text-muted">{preview}</div>
      ) : null}
      {applied ? (
        // Disabled, but not dimmed: "Added" is a confirmation, and has to stay readable.
        <Button className="mt-2.5 !opacity-100" aria-describedby={labelId} disabledReason={COPY.proposalAddedReason}>
          <Check size={13} aria-hidden="true" />
          {COPY.proposalAdded}
        </Button>
      ) : applying ? (
        <Button
          variant="primary"
          className="mt-2.5"
          aria-describedby={labelId}
          disabledReason={COPY.proposalAddingReason}
        >
          {COPY.proposalAdding}
        </Button>
      ) : (
        <Button variant="primary" className="mt-2.5" aria-describedby={labelId} onClick={() => void onApply(message)}>
          {COPY.proposalAdd}
        </Button>
      )}
    </div>
  );
}
