import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { NodeType } from "../../types";
import { COPY } from "../../ui/copy";
import { Button } from "../Button";
import { NODE_TYPES, TYPE_BG, TYPE_MEANS, typeLabel } from "../TypeChip";

/**
 * S4 — changes a node's type. Non-interactive while a save is in flight, so a
 * type change never races an edit that is still landing.
 */
export function TypePicker({
  type,
  saving,
  onChange,
}: {
  type: NodeType;
  saving: boolean;
  onChange: (type: NodeType) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
  }, [open]);
  useEffect(() => {
    if (saving) setOpen(false);
  }, [saving]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }

  return (
    <div className="relative">
      <Button
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Type: ${typeLabel(type)}. Change type`}
        disabledReason={saving ? COPY.typeWhileSaving : null}
        onClick={() => setOpen((o) => !o)}
        className="!rounded-full !px-2.5 !py-1"
      >
        <span aria-hidden="true" className={`size-2 flex-none rounded-full ${TYPE_BG[type]}`} />
        <span className="text-xs font-medium">{typeLabel(type)}</span>
        <ChevronDown size={12} aria-hidden="true" className="text-muted" />
      </Button>
      {open ? (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            ref={menu}
            role="menu"
            aria-label="Node type"
            onKeyDown={onKeyDown}
            className="absolute left-0 top-[calc(100%+6px)] z-20 w-[250px] animate-mc-pop rounded-md border border-subtle bg-panel p-[5px] shadow-[0_18px_44px_-22px_rgba(0,0,0,.5)]"
          >
            {NODE_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === type}
                onClick={() => {
                  close();
                  if (option !== type) onChange(option);
                }}
                className="flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 text-left hover:bg-elevated focus-visible:bg-elevated"
              >
                <span aria-hidden="true" className={`mt-1 size-2 flex-none rounded-full ${TYPE_BG[option]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-primary">{typeLabel(option)}</span>
                  <span className="block text-[11px] text-muted">{TYPE_MEANS[option]}</span>
                </span>
                {option === type ? <Check size={13} aria-hidden="true" className="mt-0.5 text-accent" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
