import { useEffect } from "react";
import { isTypingTarget } from "../canvas/useWorkspaceShortcuts";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";
import { reduceTool, toolForKey, type Tool, type ToolAction, type ToolContext } from "./toolMode";

/** What decides which tools can be used, read from the stores as they are right now. */
export function toolContext(): ToolContext {
  const app = appStore.getState();
  return {
    boardReady: app.boardStatus === "ready",
    connecting: uiStore.getState().connect.active,
    hasInk: Object.keys(app.strokes).length > 0,
  };
}

/** Runs an action through the reducer and stores the result. The only way the tool in hand changes. */
export function dispatchTool(action: ToolAction) {
  const ui = uiStore.getState();
  const next = reduceTool(ui.tool, action, toolContext());
  if (next !== ui.tool) ui.setTool(next);
}

export const pickTool = (tool: Tool) => dispatchTool({ type: "pick", tool });
export const escapeTool = () => dispatchTool({ type: "escape" });

/**
 * The dock's keys: V P H E S T C pick a tool, Escape puts it away. Typed into a field they are
 * letters, and with a modifier they are somebody else's shortcut. Escape yields to anything that
 * has already used it (a thread, a menu, a text mark in edit), and while Select is active it is
 * left alone entirely, so it can still close whatever it closes today.
 *
 * Mounting this also keeps the tool honest as the world changes: connect mode starting under
 * the Pen, or the last stroke being erased under the Eraser, puts the tool back in the dock.
 */
export function useToolShortcuts(enabled: boolean) {
  useEffect(() => {
    const sync = () => dispatchTool({ type: "context" });
    const stopApp = appStore.subscribe(sync);
    const stopUi = uiStore.subscribe(sync);
    return () => {
      stopApp();
      stopUi();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        if (uiStore.getState().tool === "select") return;
        event.preventDefault();
        escapeTool();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const tool = toolForKey(event.key);
      if (!tool) return;
      event.preventDefault();
      pickTool(tool);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
