import { useEffect, useRef } from "react";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";
import { deleteNodes, undoLast } from "./actions";

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
}

/** The workspace's global keys, from docs/spec.md § S3 Behavior. */
export function useWorkspaceShortcuts(enabled: boolean, handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

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
      if (event.key === "Delete" || event.key === "Backspace") {
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
