import { LayoutGrid, MessageSquare, Plus, Route, Search, type LucideIcon } from "lucide-react";
import { uiStore, useUi, type PhoneTab } from "../ui/uiStore";

/** The Add tab's id, so focus can come back to it when its sheet closes. */
export const ADD_TAB_ID = "phone-tab-add";

interface TabBarProps {
  /** Opens the add menu: the Add tab is an action over the screen shown, not a screen. */
  onAdd: () => void;
  addOpen: boolean;
}

const SIDE_TABS: Record<"left" | "right", Array<{ id: PhoneTab; label: string; icon: LucideIcon }>> = {
  left: [
    { id: "trace", label: "Trace", icon: Route },
    { id: "board", label: "Board", icon: LayoutGrid },
  ],
  right: [{ id: "find", label: "Find", icon: Search }],
};

/** Every tab is a target a thumb can't miss: tall, and a fifth of the width. How its contents sit is each tab's own. */
const TAB = "relative flex min-h-[48px] flex-1 flex-col items-center gap-0.5 rounded-md border-0 bg-transparent px-1 text-[11px] text-muted [touch-action:manipulation] aria-[current=page]:font-semibold aria-[current=page]:text-primary";
const CENTRED = "justify-center";

/**
 * P1 — the phone's tab bar. Trace, Board, Chat, Find and Add, with the assistant raised in the middle
 * where the thumb rests. Trace, Board, Chat and Find are screens; Add opens a sheet over the one shown.
 * It clears the home indicator itself (the page asks for the whole screen with viewport-fit=cover).
 */
export function TabBar({ onAdd, addOpen }: TabBarProps) {
  const current = useUi((s) => s.phoneTab);
  const show = (tab: PhoneTab) => uiStore.getState().setPhoneTab(tab);

  const screenTab = ({ id, label, icon: Icon }: { id: PhoneTab; label: string; icon: LucideIcon }) => (
    <button
      key={id}
      type="button"
      aria-current={current === id ? "page" : undefined}
      onClick={() => show(id)}
      className={`${TAB} ${CENTRED}`}
    >
      <Icon size={20} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <nav
      aria-label="Main"
      data-phone-bar
      className="relative z-20 flex flex-none items-stretch border-t border-subtle bg-panel px-1.5 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5"
    >
      {SIDE_TABS.left.map(screenTab)}

      <button
        type="button"
        data-raised
        aria-current={current === "chat" ? "page" : undefined}
        onClick={() => show("chat")}
        // The label sits at the foot of the tab, in line with the others; the disc stands above it.
        className={`${TAB} justify-end pb-[5px]`}
      >
        <span
          data-disc
          aria-hidden="true"
          className={`absolute -top-[30px] left-1/2 grid size-[54px] -translate-x-1/2 place-items-center rounded-full shadow-[0_0_0_5px_var(--bg-panel),0_10px_20px_-10px_var(--accent)] ${
            current === "chat" ? "bg-primary text-inverse" : "bg-accent text-inverse"
          }`}
        >
          <MessageSquare size={22} />
        </span>
        Chat
      </button>

      {SIDE_TABS.right.map(screenTab)}

      <button
        type="button"
        id={ADD_TAB_ID}
        aria-haspopup="dialog"
        aria-expanded={addOpen}
        onClick={onAdd}
        className={`${TAB} ${CENTRED}`}
      >
        <Plus size={20} aria-hidden="true" />
        Add
      </button>
    </nav>
  );
}
