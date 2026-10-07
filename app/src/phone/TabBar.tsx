import { uiStore, useUi, type PhoneTab } from "../ui/uiStore";
import { PhoneIcon, type PhoneIconName } from "./icons";

/** The Add tab's id, so focus can come back to it when its sheet closes. */
export const ADD_TAB_ID = "phone-tab-add";

interface TabBarProps {
  /** Opens the add menu: the Add tab is an action over the screen shown, not a screen. */
  onAdd: () => void;
  addOpen: boolean;
}

const SIDE_TABS: Record<"left" | "right", Array<{ id: PhoneTab; label: string; icon: PhoneIconName }>> = {
  left: [
    { id: "trace", label: "Trace", icon: "trace" },
    { id: "board", label: "Board", icon: "board" },
  ],
  right: [{ id: "find", label: "Find", icon: "search" }],
};

/** A fifth of the width each, icon over label, as the mockup lays them. The tab shown is semibold, its icon the accent. */
const TAB =
  "relative flex flex-1 flex-col items-center gap-[3px] rounded-md border-0 bg-transparent p-0 pt-0.5 text-[11px] leading-normal text-muted [touch-action:manipulation] aria-[current=page]:font-semibold aria-[current=page]:text-primary [&[aria-current=page]>svg]:text-accent";

/**
 * P1 — the phone's tab bar. Trace, Board, Chat, Find and Add, with the assistant raised in the middle
 * where the thumb rests. Trace, Board, Chat and Find are screens; Add opens a sheet over the one shown.
 * It clears the home indicator itself (the page asks for the whole screen with viewport-fit=cover).
 */
export function TabBar({ onAdd, addOpen }: TabBarProps) {
  const current = useUi((s) => s.phoneTab);
  const show = (tab: PhoneTab) => uiStore.getState().setPhoneTab(tab);

  const screenTab = ({ id, label, icon }: { id: PhoneTab; label: string; icon: PhoneIconName }) => (
    <button
      key={id}
      type="button"
      aria-current={current === id ? "page" : undefined}
      onClick={() => show(id)}
      className={TAB}
    >
      <PhoneIcon name={icon} />
      {label}
    </button>
  );

  return (
    <nav
      aria-label="Main"
      data-phone-bar
      // 58px and the home indicator under it: 82px on a phone that has one.
      className="relative z-20 flex h-[calc(58px+max(8px,env(safe-area-inset-bottom)))] flex-none items-start border-t border-subtle bg-panel px-1.5 pb-[max(8px,env(safe-area-inset-bottom))] pt-2"
    >
      {SIDE_TABS.left.map(screenTab)}

      <button
        type="button"
        data-raised
        aria-current={current === "chat" ? "page" : undefined}
        onClick={() => show("chat")}
        className={TAB}
      >
        {/* The disc stands 26px above the others' icons, ringed in the bar's colour; the label sits under it. */}
        <span
          data-disc
          aria-hidden="true"
          className={`-mt-[26px] grid size-[54px] place-items-center rounded-full shadow-[0_0_0_5px_var(--bg-panel),0_10px_20px_-8px_var(--accent)] ${
            current === "chat" ? "bg-primary text-inverse" : "bg-accent text-white"
          }`}
        >
          <PhoneIcon name="chat" size={22} />
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
        className={TAB}
      >
        <PhoneIcon name="plus" />
        Add
      </button>
    </nav>
  );
}
