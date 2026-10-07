import { useEffect, useRef, type KeyboardEvent } from "react";
import { TYPE_BG, TYPE_MEANS, typeLabel } from "../components/TypeChip";
import type { NodeType } from "../types";
import { COPY } from "../ui/copy";
import { PhoneIcon } from "./icons";
import { useSheetDrag } from "./useSheetDrag";

/** The types the sheet makes. An asset is not here: assets come from a file, which is its own choice below. */
const TYPES: NodeType[] = ["goal", "strategy", "campaign", "content", "note"];

interface AddSheetProps {
  onClose: () => void;
  /** A type was chosen: make a node of it. */
  onType: (type: NodeType) => void;
  onFile: () => void;
}

/**
 * P6 — what the Add tab opens: a bottom sheet over the screen shown, to put something on the board, as
 * design/mobile-direction.html draws it: a node of a type (chosen now, where the desktop's menu makes a note and asks
 * later), or a file. A draft from the assistant is the Chat tab's, one tap away (030). Escape, a tap on the scrim, Close and
 * a pull down on the handle all close it and make nothing.
 */
export function AddSheet({ onClose, onType, onFile }: AddSheetProps) {
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

  const CHOICE =
    "flex items-center gap-2.5 rounded-md border border-subtle bg-elevated p-3 text-left text-[14px] text-primary [touch-action:manipulation]";

  return (
    <>
      <div
        data-sheet-scrim
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-[44] bg-[rgba(20,15,10,.3)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={COPY.addSheetTitle}
        onKeyDown={onKeyDown}
        style={drag.style}
        className="absolute inset-x-0 bottom-0 z-[45] animate-mc-sheet rounded-t-[22px] bg-panel pb-7 shadow-[0_-12px_30px_-14px_rgba(30,20,10,.3)]"
      >
        <div data-sheet-handle {...drag.handleProps} className="flex w-full touch-none justify-center pb-1 pt-2">
          <span aria-hidden="true" className="h-1 w-[38px] rounded-[4px] bg-[var(--border-strong)]" />
        </div>
        <div className="flex items-center pl-5 pr-3">
          <h2 className="m-0 text-[16px] font-bold text-primary">{COPY.addSheetTitle}</h2>
          <button
            type="button"
            aria-label="Close"
            title="Close — Esc"
            onClick={onClose}
            className="ml-auto grid size-10 place-items-center rounded-[12px] border-0 bg-transparent p-0 text-primary [touch-action:manipulation]"
          >
            <PhoneIcon name="x" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pt-2">
          {TYPES.map((type, index) => (
            <button
              key={type}
              ref={index === 0 ? first : undefined}
              type="button"
              title={TYPE_MEANS[type]}
              onClick={() => onType(type)}
              className={CHOICE}
            >
              <span aria-hidden="true" className={`size-2.5 flex-none rounded-[3px] ${TYPE_BG[type]}`} />
              {typeLabel(type)}
            </button>
          ))}
          <button type="button" title={COPY.addSheetImportHint} onClick={onFile} className={CHOICE}>
            <PhoneIcon name="file" />
            {COPY.addSheetImport}
          </button>
        </div>
      </div>
    </>
  );
}
