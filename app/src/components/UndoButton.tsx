import { Undo2 } from "lucide-react";
import { useStore } from "zustand";
import { undoLast } from "../canvas/actions";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { Button } from "./Button";

/**
 * Undo as an icon, for a phone's headers (the desktop toolbar has its own, with a label). It says why it can't be used,
 * as every control here does: nothing yet, one still running, or the board not there.
 */
export function UndoButton({ ready = true, className = "" }: { ready?: boolean; className?: string }) {
  const hasHistory = useStore(appStore, (s) => s.undoStack.length > 0);
  const undoing = useStore(appStore, (s) => s.undoing);
  const reason = !ready ? COPY.loading : undoing ? COPY.undoing : hasHistory ? null : COPY.nothingToUndo;

  return (
    <Button
      variant="ghost"
      aria-label="Undo"
      title="Undo"
      disabledReason={reason}
      onClick={() => undoLast()}
      className={`!size-10 !rounded-md !p-0 ${className}`}
    >
      <Undo2 size={18} aria-hidden="true" />
    </Button>
  );
}
