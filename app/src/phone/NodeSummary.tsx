import { useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { useGoToNode } from "../canvas/useGoToNode";
import { typeLabel } from "../components/TypeChip";
import { appStore } from "../store";
import { buildGraph } from "../trace/traceModel";
import type { CanvasNode } from "../types";
import { uiStore } from "../ui/uiStore";
import { PhoneIcon } from "./icons";

const ICON_BUTTON =
  "grid size-10 flex-none place-items-center rounded-[12px] border-0 bg-transparent p-0 text-primary [touch-action:manipulation]";
const LABEL = "mt-4 block font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-muted";
const GHOST =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-strong bg-transparent px-3.5 text-[13.5px] font-medium text-primary [touch-action:manipulation]";

/** Where a phone goes from a node: to it on the board, or to the assistant with a question about it. */
export function useNodeExits(node: CanvasNode, onClose: () => void) {
  const goTo = useGoToNode();
  return {
    showOnBoard() {
      uiStore.getState().setPhoneTab("board");
      goTo(node, { minZoom: 0.75 });
      onClose();
    },
    askAboutIt() {
      const title = node.title.trim();
      uiStore.getState().setPhoneTab("chat");
      uiStore.getState().prefillChat(title ? `Tell me about “${title}”.` : "Tell me about this node.");
      onClose();
    },
  };
}

/**
 * P6 — a node on a phone, as the half sheet design/mobile-direction.html draws it: its type, title and summary, what it
 * serves, what serves it and what it relates to (each a row that opens that node), and where to go from here. Reading,
 * not editing: Edit, or pulling the sheet up, opens the full editor.
 */
export function NodeSummary({ node, onClose, onEdit }: { node: CanvasNode; onClose: () => void; onEdit: () => void }) {
  const navigate = useNavigate();
  const nodes = useStore(appStore, (s) => s.nodes);
  const edges = useStore(appStore, (s) => s.edges);
  const annotations = useStore(appStore, (s) => s.annotations);
  const graph = useMemo(() => buildGraph({ nodes, edges, annotations }), [nodes, edges, annotations]);
  const exits = useNodeExits(node, onClose);
  const up = graph.serves(node.id);
  const down = graph.servers(node.id);
  const related = graph.related(node.id);

  const rows = (list: CanvasNode[]) =>
    list.map((other) => (
      <button
        key={other.id}
        type="button"
        onClick={() => navigate(`/node/${encodeURIComponent(other.id)}`)}
        className="flex w-full items-center gap-2.5 border-0 border-b border-solid border-subtle bg-transparent px-0 py-2.5 text-left text-[13.5px] text-primary [touch-action:manipulation]"
      >
        <span aria-hidden="true" className="w-[3px] self-stretch rounded-[2px]" style={{ background: `var(--node-${other.type})` }} />
        {other.title.trim() || "Untitled"}
        <PhoneIcon name="right" className="ml-auto flex-none text-muted" />
      </button>
    ));

  return (
    <div className="max-h-[430px] overflow-auto px-5 pt-1">
      <div className="flex items-center">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.04em] text-[var(--t)] before:size-2 before:rounded-[2px] before:bg-[var(--t)] before:content-['']"
          style={{ "--t": `var(--node-${node.type})` } as CSSProperties}
        >
          {typeLabel(node.type)}
        </span>
        <button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className={`ml-auto ${ICON_BUTTON}`}>
          <PhoneIcon name="pen" />
        </button>
        <button type="button" aria-label="Close" title="Close — Esc" onClick={onClose} className={ICON_BUTTON}>
          <PhoneIcon name="x" />
        </button>
      </div>
      <h2 className="mb-1.5 mt-2 text-[19px] font-semibold leading-[1.25] tracking-[-0.01em] text-primary">
        {node.title.trim() || "Untitled"}
      </h2>
      {node.body ? <p className="m-0 text-[14px] text-muted">{node.body}</p> : null}
      {up.length ? (
        <>
          <span className={LABEL}>Serves</span>
          {rows(up)}
        </>
      ) : null}
      {down.length ? (
        <>
          <span className={LABEL}>{`Served by · ${down.length}`}</span>
          {rows(down)}
        </>
      ) : null}
      {related.length ? (
        <>
          <span className={LABEL}>Relates to</span>
          {rows(related)}
        </>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={exits.showOnBoard} className={GHOST}>
          Show on board
        </button>
        <button type="button" onClick={exits.askAboutIt} className={GHOST}>
          Ask about it
        </button>
      </div>
    </div>
  );
}
