import type { KeyboardEvent, RefObject } from "react";

/** The menu's items, in order. */
export function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>("[role=menuitem]")) : [];
}

/**
 * The keys of a menu: the arrows move through its items (and wrap), Escape closes it, and Tab leaves it, closing it too.
 * Spread the result's handler on the element with `role="menu"`.
 */
export function useMenuKeys(menu: RefObject<HTMLElement | null>, onClose: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const list = menuItems(menu.current);
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (event.key === "Tab") {
      onClose();
    }
  };
}
