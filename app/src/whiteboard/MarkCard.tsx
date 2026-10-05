import { useReactFlow } from "@xyflow/react";
import { GripHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useStore } from "zustand";
import { undoLast } from "../canvas/actions";
import { appStore } from "../store";
import { isLocal } from "../store/marks";
import type { Mark } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/** How far the arrow keys move a mark, in board units. Cards nudge by the same. */
const NUDGE = 8;
const STICKY_WIDTH = 200;
const TEXT_WIDTH = 240;

/** Toast with Retry for a mark whose save failed. The mark itself stays on screen with its own Retry. */
function reportSaveFailed(id: string) {
  uiStore.getState().toast({
    message: COPY.noteSaveFailed,
    tone: "danger",
    actionLabel: "Retry",
    onAction: () => retry(id),
  });
}

function retry(id: string) {
  // Deleted in the meantime: there is nothing left to send.
  if (!appStore.getState().marks[id]) return;
  appStore
    .getState()
    .retryMark(id)
    .catch(() => reportSaveFailed(id));
}

function remove(id: string) {
  appStore
    .getState()
    .deleteMark(id)
    .then((undoable) => {
      if (!undoable) return;
      uiStore.getState().toast({
        message: COPY.noteDeleted,
        tone: "success",
        actionLabel: "Undo",
        onAction: () => undoLast(),
        durationMs: 8000,
      });
    })
    .catch(() =>
      uiStore.getState().toast({
        message: COPY.noteDeleteFailed,
        tone: "danger",
        actionLabel: "Retry",
        onAction: () => remove(id),
      }),
    );
}

/**
 * A sticky note or a piece of board text: one positioned text box, and the only difference between the
 * two is whether a card is painted behind the text. The text is saved when the mark is left, never per
 * keystroke; the position when a drag ends, never per pointer move. While a save is in flight the mark
 * stays at full strength (the text is already real to whoever typed it) with a small pending dot; if it
 * fails the text stays, and Retry appears on the mark itself.
 */
export function MarkCard({ mark }: { mark: Mark }) {
  const flow = useReactFlow();
  const sync = useStore(appStore, (s) => s.markSync[mark.id]);
  const [value, setValue] = useState(mark.body);
  const [focused, setFocused] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const gesture = useRef<{ pointer: number; from: { x: number; y: number }; origin: { x: number; y: number }; moved: boolean } | null>(null);
  const sticky = mark.variant === "sticky";

  // A mark that mounts as a draft has just been dropped: it takes the keyboard without a second click.
  useEffect(() => {
    if (sync === "draft") field.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  // What is on the board changes under an idle mark (a retry, an undo): show it. Not under one being typed in.
  useEffect(() => {
    if (!focused) setValue(mark.body);
  }, [mark.body, focused]);

  // The box grows with its text.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function leave() {
    setFocused(false);
    // Emptying a saved mark is deleting it, and says so, with Undo. A draft left empty just goes quietly.
    if (!isLocal(mark.id) && value.trim() === "") return remove(mark.id);
    appStore
      .getState()
      .commitMark(mark.id, value)
      .catch(() => reportSaveFailed(mark.id));
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Escape leaves the mark (which saves it). It is not claimed: the tool in hand is put away by it too.
    if (event.key === "Escape") event.currentTarget.blur();
  }

  function grab(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || gesture.current) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* a synthetic pointer has nothing to capture */
    }
    gesture.current = {
      pointer: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      origin: { x: mark.x, y: mark.y },
      moved: false,
    };
  }

  function carry(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointer) return;
    const zoom = flow.getViewport().zoom || 1;
    active.moved = true;
    setDrag({
      x: active.origin.x + (event.clientX - active.from.x) / zoom,
      y: active.origin.y + (event.clientY - active.from.y) / zoom,
    });
  }

  function drop(event: PointerEvent<HTMLElement>, keep: boolean) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointer) return;
    gesture.current = null;
    const at = drag;
    setDrag(null);
    if (!keep || !active.moved || !at) return;
    appStore
      .getState()
      .moveMark(mark.id, at.x, at.y)
      .catch(() => reportSaveFailed(mark.id));
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const by = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[event.key];
    if (!by) return;
    event.preventDefault();
    appStore
      .getState()
      .moveMark(mark.id, mark.x + by[0]!, mark.y + by[1]!)
      .catch(() => reportSaveFailed(mark.id));
  }

  const at = drag ?? mark;
  return (
    <div
      data-mark-id={mark.id}
      data-mark-variant={mark.variant}
      data-mark-color={mark.color ?? "default"}
      data-mark-sync={sync}
      // Over the canvas's own gestures: a drag in here selects text or moves the mark, never pans the canvas.
      className="nopan group absolute animate-mc-pop"
      style={{ left: at.x, top: at.y, width: sticky ? STICKY_WIDTH : TEXT_WIDTH, pointerEvents: "auto" }}
    >
      <div
        data-mark-handle
        role="button"
        tabIndex={0}
        aria-label="Move note"
        title="Drag to move — or use the arrow keys"
        onPointerDown={grab}
        onPointerMove={carry}
        onPointerUp={(event) => drop(event, true)}
        onPointerCancel={(event) => drop(event, false)}
        onKeyDown={onHandleKeyDown}
        className="absolute -top-[22px] left-0 right-0 flex h-[22px] cursor-grab touch-none items-center justify-between rounded-t-sm px-1 text-muted opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripHorizontal size={14} aria-hidden="true" />
      </div>

      <div
        data-mark-card={sticky ? "" : undefined}
        className={
          sticky
            ? "relative rounded-[3px] border border-subtle px-3 pb-4 pt-3 shadow-[0_6px_16px_-10px_rgba(0,0,0,.55)]"
            : "relative rounded-md border border-dashed border-transparent px-2 py-1.5 focus-within:border-strong"
        }
        style={sticky ? { backgroundColor: mark.color ?? "var(--sticky-1)", color: "var(--sticky-fg)" } : undefined}
      >
        <textarea
          ref={field}
          aria-label={sticky ? "Sticky note" : "Board text"}
          rows={1}
          value={value}
          placeholder={COPY.typeANote}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={leave}
          onKeyDown={onFieldKeyDown}
          className={[
            "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-[1.45] outline-none placeholder:opacity-60",
            sticky ? "text-[13.5px]" : "text-[17px] font-semibold tracking-[-0.01em] text-primary",
          ].join(" ")}
        />
        {sync === "saving" ? (
          <span
            data-mark-pending
            role="status"
            aria-label="Saving"
            className="absolute bottom-1 right-1.5 size-1.5 animate-mc-pulse rounded-full bg-accent"
          />
        ) : null}
        {sync === "failed" ? (
          <button
            type="button"
            aria-label="Retry saving this note"
            onClick={() => retry(mark.id)}
            className="absolute -bottom-3 right-1.5 rounded-full border border-danger bg-elevated px-2 py-px text-[11px] text-danger"
          >
            Retry
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Delete note"
        title="Delete"
        onClick={() => remove(mark.id)}
        className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full border border-strong bg-elevated p-0 text-muted opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <X size={11} aria-hidden="true" />
      </button>
    </div>
  );
}
