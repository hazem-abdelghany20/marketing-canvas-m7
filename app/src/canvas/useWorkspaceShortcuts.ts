import { useEffect, useRef } from "react";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";
import { deleteNodes, undoLast } from "./actions";

/**
 * Delete acts on the canvas selection, so it only counts while the canvas (or
 * nothing in particular) has focus — never from a button in a panel or menu.
 */
function focusIsOnCanvas(target: EventTarget | null): boolean {
  return target === document.body || (target instanceof Element && target.closest("[data-drop-zone]") !== null);
}

/** Keys typed into a field belong to the field, not to the canvas. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface ShortcutHandlers {
  /** N — open the add-node menu. */
  onAdd: () => void;
  /** C — enter connect mode, or leave it. */
  onConnect: () => void;
  /** Cmd/Ctrl+F — open search. Returns false when there is nothing to search, so the browser's find runs instead. */
  onSearch: () => boolean;
}

/** The workspace's global keys, from docs/spec.md § S3 Behavior. */
export function useWorkspaceShortcuts(enabled: boolean, handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Search works from anywhere, a text field included.
      if (mod && key === "f" && !event.shiftKey && !event.altKey) {
        if (latest.current.onSearch()) event.preventDefault();
        return;
      }
      if (isTypingTarget(event.target)) return;

      if (mod && key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (appStore.getState().undoStack.length > 0) undoLast();
        return;
      }
      if (mod || event.altKey) return;

      if (event.key === "Escape" && uiStore.getState().connect.active) {
        event.preventDefault();
        uiStore.getState().exitConnect();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        latest.current.onAdd();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        latest.current.onConnect();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && focusIsOnCanvas(event.target)) {
        const { selectedIds } = uiStore.getState();
        if (selectedIds.length > 0) {
          event.preventDefault();
          void deleteNodes(selectedIds);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
