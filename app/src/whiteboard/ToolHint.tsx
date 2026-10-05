import { useUi } from "../ui/uiStore";
import { toolHint } from "./toolMode";
import { escapeTool } from "./useToolShortcuts";

/**
 * A pill naming the tool in hand and how to put it away. Select has none: it is the resting
 * state, not a mode to escape. Sits bottom-right of the canvas, clear of the dock and the toasts.
 */
export function ToolHint() {
  const hint = toolHint(useUi((s) => s.tool));
  if (!hint) return null;

  return (
    <div
      data-tool-hint
      role="status"
      className="absolute bottom-3.5 right-3.5 z-[45] flex max-w-[calc(100%-28px)] animate-mc-rise items-center gap-2.5 rounded-full bg-primary px-4 py-[7px] text-[12.5px] text-inverse shadow-[0_8px_24px_-14px_rgba(0,0,0,.6)]"
    >
      <span className="min-w-0">
        <strong className="font-semibold">{hint.label}</strong> — {hint.text}
      </span>
      <button
        type="button"
        aria-label={`Put ${hint.label} away (Esc)`}
        onClick={escapeTool}
        className="flex-none rounded-sm border-0 bg-transparent p-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-inherit opacity-70 hover:opacity-100 focus-visible:outline-inverse"
      >
        Esc
      </button>
    </div>
  );
}
