import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../Button";

interface ConfirmRemoveProps {
  /** Names what goes, e.g. "Remove connection to Linen drop". */
  label: string;
  onConfirm: () => void;
  disabledReason?: string | null;
}

/** A remove control that asks once, inline, before it does anything. */
export function ConfirmRemove({ label, onConfirm, disabledReason }: ConfirmRemoveProps) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const backToTrigger = useRef(false);

  // Whatever put the question away, the question's own buttons are gone: focus goes back to the control.
  useEffect(() => {
    if (asking || !backToTrigger.current) return;
    backToTrigger.current = false;
    trigger.current?.focus();
  }, [asking]);

  // Starting connect mode takes the control away mid-question; the question goes with it.
  useEffect(() => {
    if (disabledReason) setAsking(false);
  }, [disabledReason]);

  function cancel() {
    backToTrigger.current = true;
    setAsking(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    // Escape answers the question and nothing else: the panel behind it stays open.
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  if (asking) {
    return (
      <span role="group" aria-label={`${label}?`} onKeyDown={onKeyDown} className="flex flex-none items-center gap-1">
        <Button
          variant="danger"
          autoFocus
          className="!px-2 !py-0.5 text-[11.5px]"
          onClick={(event) => {
            // The row goes with its control; focus stays in the panel rather than falling to the page.
            event.currentTarget.closest<HTMLElement>("[data-node-detail]")?.focus({ preventScroll: true });
            setAsking(false);
            onConfirm();
          }}
        >
          Remove
        </Button>
        <Button variant="ghost" className="!px-2 !py-0.5 text-[11.5px]" onClick={cancel}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button
      ref={trigger}
      variant="ghost"
      aria-label={label}
      title={label}
      disabledReason={disabledReason}
      onClick={() => setAsking(true)}
      className="!p-1.5 text-muted"
    >
      <X size={13} aria-hidden="true" />
    </Button>
  );
}
