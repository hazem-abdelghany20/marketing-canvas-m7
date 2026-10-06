import { usePhone } from "../lib/useMediaQuery";
import { useUi } from "../ui/uiStore";
import { toolHint } from "./toolMode";
import { escapeTool } from "./useToolShortcuts";

/**
 * A pill naming the tool in hand and how to put it away. Select has none: it is the resting
 * state, not a mode to escape. Sits bottom-right of the canvas, clear of the dock and the toasts.
 */
export function ToolHint() {
  const phone = usePhone();
  const hint = toolHint(useUi((s) => s.tool), phone);
  if (!hint) return null;

  return (
    <div
      data-tool-hint
      role="status"
      className={`absolute z-[45] flex animate-mc-rise items-center gap-2.5 rounded-full bg-primary px-4 py-[7px] text-[12.5px] text-inverse shadow-[0_8px_24px_-14px_rgba(0,0,0,.6)] ${
        // On a phone it stands under the top bar, in the middle; the corner is where the dock and the toasts are.
        phone
          ? "inset-x-0 top-[max(68px,calc(env(safe-area-inset-top)+56px))] mx-auto w-fit max-w-[calc(100%-24px)]"
          : "bottom-3.5 right-3.5 max-w-[calc(100%-28px)]"
      }`}
    >
      <span className="min-w-0">
        <strong className="font-semibold">{hint.label}</strong> — {hint.text}
      </span>
      <button
        type="button"
        aria-label={phone ? `Put ${hint.label} away` : `Put ${hint.label} away (Esc)`}
        onClick={escapeTool}
        className={`flex-none rounded-sm border-0 bg-transparent font-mono uppercase tracking-[0.1em] text-inherit hover:opacity-100 focus-visible:outline-inverse ${
          phone ? "-my-1 px-1 py-1 text-[11px] opacity-90" : "p-0 text-[9.5px] opacity-70"
        }`}
      >
        {phone ? "Done" : "Esc"}
      </button>
    </div>
  );
}
