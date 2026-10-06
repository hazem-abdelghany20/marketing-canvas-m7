import {
  Eraser,
  Download,
  Highlighter,
  LoaderCircle,
  MessageCirclePlus,
  MousePointer2,
  Pencil,
  ScanEye,
  StickyNote,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { useUi } from "../ui/uiStore";
import { TOOLS, availability, type Tool } from "./toolMode";
import { explainWhy, useSavePng, useSendBoard } from "./useBoardActions";
import { pickTool } from "./useToolShortcuts";

const ICONS: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  pen: Pencil,
  highlighter: Highlighter,
  eraser: Eraser,
  sticky: StickyNote,
  text: Type,
  comment: MessageCirclePlus,
};

/** What each tool does, for its tooltip. The key follows. */
const DESCRIPTION: Record<Tool, string> = {
  select: "Select, drag and pan",
  pen: "Draw on the board",
  highlighter: "Highlight",
  eraser: "Erase ink",
  sticky: "Drop a sticky note",
  text: "Type text on the board",
  comment: "Pin a comment",
};

interface DockProps {
  /** Clearing all ink. Offered only while there is ink to clear, and only when a handler is given. */
  onClearInk?: () => void;
  /**
   * `column` is the desktop's: down the left of the canvas, with Send, Save and Clear ink under the tools. `bar` is the
   * phone's: one row of the seven tools along the bottom, above the tab bar, each 40px across. The three actions are in
   * the board's menu there, and a tool that can't be used says why when it is tapped, since a touch screen has no tooltip.
   */
  layout?: "column" | "bar";
}

/**
 * O7 — the whiteboard dock: seven tools down the left of the canvas. It holds its place while the
 * board loads (every tool waiting, and saying so) so nothing shifts when the data lands. A tool
 * that can't be used says why in its tooltip rather than vanishing; Clear ink alone is hidden when
 * there is no ink, because a control for erasing nothing is noise.
 */
export function Dock({ onClearInk, layout = "column" }: DockProps) {
  const tool = useUi((s) => s.tool);
  const connecting = useUi((s) => s.connect.active);
  const boardReady = useStore(appStore, (s) => s.boardStatus === "ready");
  const hasInk = useStore(appStore, (s) => Object.keys(s.strokes).length > 0);
  const { reason: sendReason, preparing, send } = useSendBoard();
  const { reason: saveReason, exporting, save } = useSavePng();
  const ctx = { boardReady, connecting, hasInk };
  const bar = layout === "bar";

  return (
    <div
      role="group"
      aria-label="Whiteboard tools"
      data-dock
      data-layout={layout}
      className={
        bar
          ? "absolute inset-x-0 bottom-3 z-40 mx-auto flex w-fit items-center gap-0.5 rounded-lg border border-subtle bg-panel p-1 shadow-[0_8px_26px_-18px_rgba(0,0,0,.5)]"
          : "absolute left-3.5 top-[66px] z-40 flex flex-col items-center gap-0.5 rounded-lg border border-subtle bg-panel p-[5px] shadow-[0_8px_26px_-18px_rgba(0,0,0,.5)] max-[899px]:top-[100px]"
      }
    >
      {TOOLS.map((def) => {
        const { reason } = availability(def.id, ctx);
        const Icon = ICONS[def.id];
        const active = tool === def.id;
        return (
          <Button
            key={def.id}
            variant={active ? "active" : "ghost"}
            aria-label={def.label}
            aria-pressed={active}
            data-tool={def.id}
            title={`${DESCRIPTION[def.id]} — ${def.key}`}
            disabledReason={reason}
            onDisabledClick={bar ? () => explainWhy(reason) : undefined}
            onClick={() => pickTool(def.id)}
            className={bar ? "!size-10 !rounded-md !p-0" : "!size-8 !rounded-md !p-0"}
          >
            <Icon size={bar ? 18 : 15} aria-hidden="true" />
          </Button>
        );
      })}
      {bar ? null : (
        <>
          <span aria-hidden="true" className="my-1 h-px w-5 bg-[var(--border-subtle)]" />
          <Button
            variant="ghost"
            aria-label="Send board to the assistant"
            aria-busy={preparing || undefined}
            title={COPY.sendBoard}
            disabledReason={sendReason}
            onClick={send}
            className="!size-8 !rounded-md !p-0 text-muted"
          >
            {preparing ? <LoaderCircle size={15} aria-hidden="true" className="animate-spin" /> : <ScanEye size={15} aria-hidden="true" />}
          </Button>
          <Button
            variant="ghost"
            aria-label="Save as PNG"
            aria-busy={exporting || undefined}
            title={COPY.saveImage}
            disabledReason={saveReason}
            onClick={save}
            className="!size-8 !rounded-md !p-0 text-muted"
          >
            {exporting ? <LoaderCircle size={15} aria-hidden="true" className="animate-spin" /> : <Download size={15} aria-hidden="true" />}
          </Button>
          {hasInk && onClearInk ? (
            <Button
              variant="ghost"
              aria-label="Clear ink"
              title="Clear all ink"
              onClick={onClearInk}
              className="!size-8 !rounded-md !p-0 text-muted"
            >
              <Trash2 size={15} aria-hidden="true" />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
