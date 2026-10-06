import { FileUp, MessageSquare, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { TYPE_BG, TYPE_MEANS, typeLabel } from "../components/TypeChip";
import { appStore } from "../store";
import type { NodeType } from "../types";
import { COPY } from "../ui/copy";
import { useSheetDrag } from "./useSheetDrag";

/** The types the sheet makes. An asset is not here: assets come from a file, which is its own choice below. */
const TYPES: NodeType[] = ["goal", "strategy", "campaign", "content", "note"];

interface AddSheetProps {
  onClose: () => void;
  /** A type was chosen: make a node of it. */
  onType: (type: NodeType) => void;
  onFile: () => void;
  onFromChat: () => void;
}

/**
 * P6 — what the Add tab opens: a bottom sheet over the screen shown, to put something on the board. A node of a type (chosen
 * now, where the desktop's menu makes a note and asks later), a file, or a draft from the assistant. Escape, a tap on the
 * scrim, Close and a pull down on the handle all close it and make nothing.
 */
export function AddSheet({ onClose, onType, onFile, onFromChat }: AddSheetProps) {
  const streaming = useStore(appStore, (s) => s.chatStreaming);
  const drag = useSheetDrag(onClose);
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => first.current?.focus(), []);

  /** The dialog is modal: Escape closes it, and Tab walks its controls and comes round, never out to the page behind the scrim. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    const firstControl = controls[0];
    const last = controls.at(-1);
    if (!firstControl || !last) return;
    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      firstControl.focus();
    }
  }

  return (
    <>
      <div
        data-sheet-scrim
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-[44] bg-[color-mix(in_srgb,var(--fg-primary)_28%,transparent)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={COPY.addSheetTitle}
        onKeyDown={onKeyDown}
        style={drag.style}
        className="absolute inset-x-0 bottom-0 z-[45] animate-mc-sheet rounded-t-[22px] border-t border-subtle bg-panel pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-16px_rgba(0,0,0,.45)]"
      >
        <div data-sheet-handle {...drag.handleProps} className="grid h-7 w-full touch-none place-items-center">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>
        <div className="flex items-center justify-between pl-5 pr-2">
          <h2 className="m-0 text-[17px] font-semibold text-primary">{COPY.addSheetTitle}</h2>
          <Button variant="ghost" aria-label="Close" title="Close — Esc" onClick={onClose} className="!size-10 !rounded-md !p-0 text-muted">
            <X size={18} aria-hidden="true" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pt-2">
          {TYPES.map((type, index) => (
            <button
              key={type}
              ref={index === 0 ? first : undefined}
              type="button"
              onClick={() => onType(type)}
              className="flex min-h-[64px] items-center gap-3 rounded-lg border border-subtle bg-elevated p-3 text-left [touch-action:manipulation]"
            >
              <span aria-hidden="true" className={`size-3 flex-none rounded-[3px] ${TYPE_BG[type]}`} />
              <span className="min-w-0">
                <span className="block text-[14.5px] font-medium text-primary">{typeLabel(type)}</span>
                <span className="block text-[11.5px] leading-snug text-muted">{TYPE_MEANS[type]}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 px-5 pt-2">
          <Row icon={FileUp} label={COPY.addSheetImport} hint={COPY.addSheetImportHint} onSelect={onFile} />
          <Row
            icon={MessageSquare}
            label={COPY.addSheetDraft}
            hint={streaming ? COPY.waitForReply : COPY.addSheetDraftHint}
            disabled={streaming}
            onSelect={onFromChat}
          />
        </div>
      </div>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  disabled = false,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  hint: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={`flex min-h-[56px] items-center gap-3 rounded-lg border border-subtle bg-elevated px-3 py-2 text-left [touch-action:manipulation] ${
        disabled ? "cursor-not-allowed" : ""
      }`}
    >
      <Icon size={18} aria-hidden="true" className={`flex-none ${disabled ? "text-muted" : "text-accent"}`} />
      <span className="min-w-0">
        <span className={`block text-[14.5px] font-medium ${disabled ? "text-muted" : "text-primary"}`}>{label}</span>
        <span className="block text-[11.5px] leading-snug text-muted">{hint}</span>
      </span>
    </button>
  );
}
