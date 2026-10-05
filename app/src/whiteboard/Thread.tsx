import { Trash2, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { formatTimestamp, plural, relativeTime } from "../lib/format";
import { appStore } from "../store";
import { isLocalPin } from "../store/pins";
import type { ApiError } from "../api/client";
import type { Comment } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { ThreadComposer } from "./ThreadComposer";
import { closeThread, threadWasDeleted } from "./threadActions";
import { THREAD_HEIGHT_GUESS, THREAD_WIDTH, placeThread, type Placement } from "./threadPlacement";

interface ThreadProps {
  pinId: string;
  /** Where the pin's tip is, in canvas pixels. */
  anchor: { x: number; y: number };
}

/**
 * A pin's thread, opened beside it. Comments arrive with the pins, so it is there at once with nothing
 * to wait for. The first comment stands alone and the rest are nested beneath it; each shows its own
 * author, who is only ever a name to read (nothing here changes with who wrote what). Deleting asks first.
 */
export function Thread({ pinId, anchor }: ThreadProps) {
  const pin = useStore(appStore, (s) => s.pins[pinId]);
  const commentSync = useStore(appStore, (s) => s.commentSync);
  const panel = useRef<HTMLDivElement>(null);
  // Before it has been measured it is placed by a guess at its size, so it is never hidden (a hidden field
  // cannot take focus) and the corrected position lands before the first paint.
  const [placement, setPlacement] = useState<Placement>(() =>
    placeThread({
      anchor,
      container: { width: window.innerWidth, height: window.innerHeight },
      panel: { width: THREAD_WIDTH, height: THREAD_HEIGHT_GUESS },
    }),
  );
  const [asking, setAsking] = useState<"thread" | string | null>(null);

  const count = pin?.comments.length ?? 0;
  // Measured where it is, so it flips when it would leave the canvas, and again as it grows with its comments.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const container = el.parentElement!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setPlacement(
      placeThread({
        anchor,
        container: { width: container.width || window.innerWidth, height: container.height || window.innerHeight },
        panel: { width: box.width || THREAD_WIDTH, height: box.height || THREAD_HEIGHT_GUESS },
      }),
    );
  }, [anchor.x, anchor.y, count, asking]);

  if (!pin) return null;
  const draft = pin.comments.length === 0;
  const failed = pin.comments.some((c) => commentSync[c.id] === "failed");
  const canResolve = !draft && !isLocalPin(pin.id);

  function handle(error: ApiError, otherwise?: () => void) {
    if (error.code === "pin_not_found") threadWasDeleted();
    else otherwise?.();
  }

  const post = (text: string) =>
    appStore
      .getState()
      .postComment(pin!.id, text)
      .catch((error: ApiError) => {
        handle(error);
        throw error;
      });

  function resolve() {
    appStore
      .getState()
      .setResolved(pin!.id, !pin!.resolved)
      .catch((error: ApiError) =>
        handle(error, () => uiStore.getState().toast({ message: COPY.threadUpdateFailed, tone: "danger" })),
      );
  }

  function removeThread() {
    const id = pin!.id;
    setAsking(null);
    closeThread();
    appStore
      .getState()
      .deletePin(id)
      .catch(() =>
        uiStore.getState().toast({
          message: COPY.threadDeleteFailed,
          tone: "danger",
          actionLabel: "Retry",
          onAction: () => void appStore.getState().deletePin(id).catch(() => {}),
        }),
      );
  }

  function removeComment(id: string) {
    setAsking(null);
    appStore
      .getState()
      .deleteComment(pin!.id, id)
      .catch(() => uiStore.getState().toast({ message: COPY.commentDeleteFailed, tone: "danger" }));
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Comment thread"
      data-thread
      data-side={placement.side}
      style={{ left: placement.left, top: placement.top, width: THREAD_WIDTH, pointerEvents: "auto" }}
      className="absolute z-[60] animate-mc-rise rounded-lg border border-subtle bg-panel p-3.5 shadow-[0_18px_50px_-24px_rgba(0,0,0,.6)]"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
          {draft ? "New thread" : plural(pin.comments.length, "comment")}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" aria-label="Close thread" title="Close — Esc" onClick={closeThread} className="!size-6 !p-0 text-muted">
          <X size={14} aria-hidden="true" />
        </Button>
      </div>

      {draft ? <p className="mb-2.5 mt-0 text-[13px] leading-normal text-muted">{COPY.newThread}</p> : null}

      {draft ? null : (
        <ol className="m-0 mb-2.5 flex max-h-[260px] list-none flex-col gap-2.5 overflow-y-auto p-0">
          {pin.comments.map((comment, index) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              nested={index > 0}
              sync={commentSync[comment.id]}
              asking={asking === comment.id}
              onAsk={() => setAsking(comment.id)}
              onCancel={() => setAsking(null)}
              onDelete={() => removeComment(comment.id)}
              onRetry={() => void appStore.getState().retryComment(pin.id, comment.id).catch((error: ApiError) => handle(error))}
            />
          ))}
        </ol>
      )}

      {failed ? (
        <p role="alert" className="mb-2 mt-0 text-[12.5px] text-danger">
          {COPY.commentPostFailed}
        </p>
      ) : null}

      <ThreadComposer placeholder={draft ? "What about this?" : "Reply…"} onPost={post} />

      <div className="mt-2.5 flex items-center gap-2 border-t border-subtle pt-2.5">
        {asking === "thread" ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-primary">{COPY.deleteThreadAsk}</span>
            <Button className="!px-2.5 !py-1" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button variant="danger" className="!border-danger !px-2.5 !py-1" onClick={removeThread}>
              Delete
            </Button>
          </div>
        ) : (
          <>
            <Button
              className="!px-2.5 !py-1 text-muted"
              disabledReason={canResolve ? null : COPY.nothingToResolve}
              onClick={resolve}
            >
              {pin.resolved ? "Reopen" : "Resolve"}
            </Button>
            <span className="flex-1" />
            <Button
              variant="ghost"
              aria-label="Delete thread"
              title="Delete thread"
              onClick={() => (isLocalPin(pin.id) && draft ? closeThread() : setAsking("thread"))}
              className="!size-6 !p-0 text-muted"
            >
              <Trash2 size={13} aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface CommentRowProps {
  comment: Comment;
  nested: boolean;
  sync: "sending" | "failed" | undefined;
  asking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

function CommentRow({ comment, nested, sync, asking, onAsk, onCancel, onDelete, onRetry }: CommentRowProps) {
  return (
    <li
      data-comment-id={comment.id}
      data-comment-nested={nested}
      data-comment-sync={sync}
      className={nested ? "ml-3 border-l-2 border-subtle pl-2.5" : undefined}
    >
      <div className="flex items-center gap-[7px]">
        <span data-comment-author className="text-[12.5px] font-semibold text-primary">
          {comment.author.name}
        </span>
        <time
          dateTime={comment.createdAt}
          title={formatTimestamp(comment.createdAt)}
          className="font-mono text-[9.5px] text-muted"
        >
          {relativeTime(comment.createdAt)}
        </time>
        {sync === "sending" ? <span className="font-mono text-[9.5px] text-muted">Sending…</span> : null}
        <span className="flex-1" />
        {sync === undefined && !asking ? (
          <Button variant="ghost" aria-label="Delete comment" title="Delete comment" onClick={onAsk} className="!size-5 !p-0 text-muted">
            <X size={11} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-[13px] leading-[1.55] text-primary">{comment.body}</div>
      {sync === "failed" ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[12px] text-danger">Not sent</span>
          <Button className="!px-2 !py-0.5 text-[11.5px]" onClick={onRetry}>
            Retry
          </Button>
          <Button variant="ghost" aria-label="Delete comment" title="Delete comment" onClick={onDelete} className="!size-5 !p-0 text-muted">
            <X size={11} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {asking ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-primary">{COPY.deleteCommentAsk}</span>
          <Button className="!px-2 !py-0.5" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" className="!border-danger !px-2 !py-0.5" onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </li>
  );
}
