import { useStore as useFlowStore, useViewport as useFlowViewport } from "@xyflow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { deleteNodes } from "../canvas/actions";
import { plural } from "../lib/format";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { Button } from "./Button";
import { CARD_HEIGHT, CARD_WIDTH } from "./NodeCard";
import { TypeChip } from "./TypeChip";

export const PEEK_WIDTH = 250;
/** Space between the card and its peek, and between the peek and the viewport edge. */
export const PEEK_GAP = 12;
/** Used until the peek has been measured once. */
const PEEK_HEIGHT_GUESS = 150;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PeekPlacement {
  left: number;
  top: number;
  side: "right" | "left";
}

/**
 * Puts the peek beside its node: right by default, flipped to the left when
 * the right would run off the viewport, and held inside it vertically.
 */
export function placePeek(
  anchor: Rect,
  peek: { width: number; height: number },
  bounds: { width: number; height: number },
): PeekPlacement {
  const right = anchor.left + anchor.width + PEEK_GAP;
  const left = anchor.left - PEEK_GAP - peek.width;
  const fitsRight = right + peek.width <= bounds.width - PEEK_GAP;
  const fitsLeft = left >= PEEK_GAP;
  const side = fitsRight || !fitsLeft ? "right" : "left";

  const maxTop = Math.max(PEEK_GAP, bounds.height - peek.height - PEEK_GAP);
  const top = Math.min(maxTop, Math.max(PEEK_GAP, anchor.top));
  return { left: side === "right" ? right : left, top, side };
}

/** O4 — a floating card beside the one selected node. */
export function QuickPeek({ onConnect }: { onConnect: (sourceId: string) => void }) {
  const selectedIds = useStore(uiStore, (s) => s.selectedIds);
  const connecting = useStore(uiStore, (s) => s.connect.active);
  const id = selectedIds.length === 1 ? selectedIds[0]! : null;
  const node = useStore(appStore, (s) => (id ? s.nodes[id] : undefined));
  const nodeCount = useStore(appStore, (s) => Object.keys(s.nodes).length);
  const edgeCount = useStore(appStore, (s) =>
    id ? Object.values(s.edges).filter((e) => e.fromId === id || e.toId === id).length : 0,
  );

  if (!node || connecting) return null;
  return (
    <PeekCard key={node.id} nodeId={node.id} edgeCount={edgeCount} onlyNode={nodeCount < 2} onConnect={onConnect} />
  );
}

function PeekCard({
  nodeId,
  edgeCount,
  onlyNode,
  onConnect,
}: {
  nodeId: string;
  edgeCount: number;
  onlyNode: boolean;
  onConnect: (sourceId: string) => void;
}) {
  const navigate = useNavigate();
  const node = useStore(appStore, (s) => s.nodes[nodeId])!;
  const { x, y, zoom } = useFlowViewport();
  const bounds = useFlowStore(
    (s) => ({ width: s.width, height: s.height }),
    (a, b) => a.width === b.width && a.height === b.height,
  );
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PEEK_HEIGHT_GUESS);

  useLayoutEffect(() => {
    const measured = ref.current?.offsetHeight;
    if (measured && measured !== height) setHeight(measured);
  });

  const placement = placePeek(
    { left: node.x * zoom + x, top: node.y * zoom + y, width: CARD_WIDTH * zoom, height: CARD_HEIGHT * zoom },
    { width: PEEK_WIDTH, height },
    bounds,
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Quick look: ${node.title || "Untitled"}`}
      data-quick-peek={nodeId}
      data-side={placement.side}
      style={{ left: placement.left, top: placement.top, width: PEEK_WIDTH }}
      className="absolute z-20 animate-mc-pop rounded-md border border-subtle bg-panel p-[13px] shadow-[0_16px_40px_-22px_rgba(0,0,0,.55)]"
    >
      <TypeChip type={node.type} className="mb-1.5" />
      <div className="mb-[5px] text-sm font-semibold leading-tight text-primary">{node.title || "Untitled"}</div>
      <p className="mb-2 line-clamp-3 text-[12.5px] leading-[1.45] text-muted">{node.body || COPY.noDescription}</p>
      <p className="mb-[11px] font-mono text-[10px] tracking-[0.06em] text-muted">{plural(edgeCount, "connection")}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="primary" onClick={() => navigate(`/node/${encodeURIComponent(nodeId)}`)}>
          Open
        </Button>
        <Button disabledReason={onlyNode ? COPY.connectNeedsAnother : null} onClick={() => onConnect(nodeId)}>
          Connect from here
        </Button>
        <Button variant="danger" onClick={() => void deleteNodes([nodeId])}>
          Delete
        </Button>
      </div>
    </div>
  );
}
