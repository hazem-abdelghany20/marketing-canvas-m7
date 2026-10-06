import { useEffect, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { menuItems, useMenuKeys } from "./useMenuKeys";

interface AddNodeMenuProps {
  onClose: () => void;
  onNote: () => void;
  onFromChat: () => void;
  /** Extra items, e.g. File once ticket 007 lands. */
  children?: ReactNode;
}

/**
 * O1 — Note · File · From chat. Creation is one click; the type is chosen in
 * the detail panel afterwards. Escape or a click outside closes it and creates nothing.
 */
export function AddNodeMenu({ onClose, onNote, onFromChat, children }: AddNodeMenuProps) {
  const streaming = useStore(appStore, (s) => s.chatStreaming);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuItems(menu.current)[0]?.focus();
  }, []);

  const onKeyDown = useMenuKeys(menu, onClose);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menu}
        role="menu"
        aria-label="Add node"
        onKeyDown={onKeyDown}
        className="fixed right-3.5 top-[60px] z-[41] w-[232px] animate-mc-pop rounded-md border border-subtle bg-panel p-1.5 shadow-[0_18px_44px_-22px_rgba(0,0,0,.5)]"
      >
        <MenuItem label="Note" hint="Blank node, set its type after" onSelect={onNote} />
        {children}
        <MenuItem
          label="From chat"
          hint="Ask the assistant to draft one"
          disabledReason={streaming ? COPY.waitForReply : null}
          onSelect={onFromChat}
        />
      </div>
    </>
  );
}

interface MenuItemProps {
  label: string;
  hint: string;
  onSelect: () => void;
  disabledReason?: string | null;
  /** Say why the item can't be used in place of its hint, for a screen where there is no tooltip to read. */
  reasonAsHint?: boolean;
}

export function MenuItem({ label, hint, onSelect, disabledReason, reasonAsHint = false }: MenuItemProps) {
  // When the reason is the hint it is the one thing to read: only the name steps back, not the whole item.
  const dimWhole = Boolean(disabledReason) && !reasonAsHint;
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason ?? undefined}
      onClick={disabledReason ? undefined : onSelect}
      className={[
        "block w-full rounded-sm px-2.5 py-[9px] text-left text-[13.5px] text-primary",
        disabledReason ? "cursor-not-allowed" : "hover:bg-elevated focus-visible:bg-elevated",
        dimWhole ? "opacity-45" : "",
      ].join(" ")}
    >
      <span className={disabledReason && reasonAsHint ? "opacity-55" : ""}>{label}</span>
      <span className="block text-[11.5px] text-muted">{reasonAsHint && disabledReason ? disabledReason : hint}</span>
    </button>
  );
}
