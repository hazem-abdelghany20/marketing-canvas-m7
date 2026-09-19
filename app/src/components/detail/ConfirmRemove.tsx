import { X } from "lucide-react";
import { useState } from "react";
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

  if (asking) {
    return (
      <span role="group" aria-label={`${label}?`} className="flex flex-none items-center gap-1">
        <Button
          variant="danger"
          autoFocus
          className="!px-2 !py-0.5 text-[11.5px]"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          Remove
        </Button>
        <Button variant="ghost" className="!px-2 !py-0.5 text-[11.5px]" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      disabledReason={disabledReason}
      onClick={() => setAsking(true)}
      className="!p-1 text-muted"
    >
      <X size={13} aria-hidden="true" />
    </Button>
  );
}
