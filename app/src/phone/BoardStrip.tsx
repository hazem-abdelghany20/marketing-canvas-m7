import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { useFitToBounds } from "../canvas/useFitToBounds";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { TYPE_BG, typeLabel } from "../components/TypeChip";
import { plural } from "../lib/format";
import { appStore } from "../store";
import { uiStore, useUi } from "../ui/uiStore";
import { STRIP_CHIP, STRIP_DOT, stripScene, type StripSize } from "./stripLayout";

/** What the strip is drawn into until it has been measured: a phone's width, less the screen's margins. */
const FALLBACK: StripSize = { width: 336, height: 120 };

/**
 * P4 — the strip of the board above the conversation on the Chat screen. While nothing is cited it is an outline of the
 * whole board; when a reply cites nodes it is those, and what they connect to, with the cited ones marked, and a tap on
 * one opens it. Open board goes to the Board tab, with what was cited in view.
 */
export function BoardStrip() {
  const navigate = useNavigate();
  const nodes = useStore(appStore, (s) => s.nodes);
  const edges = useStore(appStore, (s) => s.edges);
  const citedIds = useUi((s) => s.citedIds);
  const fitToBounds = useFitToBounds();
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<StripSize>(FALLBACK);

  // Drawn at the size it really is, whatever the phone: positions are scaled to it.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0)
        setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const all = useMemo(() => Object.values(nodes), [nodes]);
  const scene = useMemo(() => stripScene(all, Object.values(edges), citedIds, size), [all, edges, citedIds, size]);

  function openBoard() {
    uiStore.getState().setPhoneTab("board");
    const cited = scene.items.filter((item) => item.cited).map((item) => item.node);
    if (cited.length === 0) return;
    const left = Math.min(...cited.map((n) => n.x));
    const top = Math.min(...cited.map((n) => n.y));
    const right = Math.max(...cited.map((n) => n.x + CARD_WIDTH));
    const bottom = Math.max(...cited.map((n) => n.y + CARD_HEIGHT));
    fitToBounds({ x: left, y: top, width: right - left, height: bottom - top }, 0, 1);
  }

  const heading =
    scene.mode === "cited" ? `${scene.cited} cited` : scene.mode === "overview" ? plural(all.length, "node") : "";

  return (
    <section
      role="region"
      aria-label="Board overview"
      data-strip-mode={scene.mode}
      // With little height left (the keyboard is up) the conversation matters more than the picture.
      className="mx-3 mt-3 flex-none [@media(max-height:520px)]:hidden"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted">{heading}</span>
        <button
          type="button"
          onClick={openBoard}
          className="-my-1 inline-flex h-10 items-center rounded-md border-0 bg-transparent px-2.5 text-[13px] font-medium text-accent [touch-action:manipulation]"
        >
          Open board
        </button>
      </div>

      <div
        ref={frame}
        className="relative h-[120px] overflow-hidden rounded-lg border border-subtle bg-canvas bg-[radial-gradient(var(--grid-dot)_1.2px,transparent_1.2px)] bg-[length:18px_18px]"
      >
        {scene.mode === "empty" ? (
          <p className="absolute inset-0 m-0 grid place-items-center px-4 text-center text-[13px] text-muted">
            Nothing on the board yet.
          </p>
        ) : (
          <>
            <svg aria-hidden="true" className="absolute inset-0 size-full">
              {scene.lines.map((line) => (
                <line
                  key={line.id}
                  x1={line.from.x}
                  y1={line.from.y}
                  x2={line.to.x}
                  y2={line.to.y}
                  strokeWidth={1.5}
                  strokeDasharray={line.kind === "serves" ? undefined : "3 3"}
                  style={{ stroke: line.kind === "serves" ? "var(--edge-serves)" : "var(--edge-relates)" }}
                />
              ))}
            </svg>

            {scene.items.map((item) =>
              scene.mode === "cited" ? (
                <button
                  key={item.node.id}
                  type="button"
                  data-strip-node={item.node.id}
                  data-cited={item.cited ? "true" : undefined}
                  aria-label={`${item.node.title.trim() || "Untitled"}, ${typeLabel(item.node.type)}`}
                  onClick={() => navigate(`/node/${encodeURIComponent(item.node.id)}`)}
                  style={{
                    left: item.x - STRIP_CHIP.width / 2,
                    top: item.y - STRIP_CHIP.height / 2,
                    width: STRIP_CHIP.width,
                    height: STRIP_CHIP.height,
                  }}
                  className={`absolute flex items-center gap-1.5 overflow-hidden rounded-md border bg-elevated px-1.5 text-left text-[10.5px] leading-tight text-primary [touch-action:manipulation] ${
                    item.cited
                      ? "border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
                      : "border-subtle opacity-75"
                  }`}
                >
                  <span aria-hidden="true" className={`size-[6px] flex-none rounded-full ${TYPE_BG[item.node.type]}`} />
                  <span className="min-w-0 truncate">{item.node.title.trim() || "Untitled"}</span>
                </button>
              ) : (
                <span
                  key={item.node.id}
                  aria-hidden="true"
                  style={{
                    left: item.x - STRIP_DOT.width / 2,
                    top: item.y - STRIP_DOT.height / 2,
                    width: STRIP_DOT.width,
                    height: STRIP_DOT.height,
                  }}
                  className={`absolute rounded-sm opacity-80 ${TYPE_BG[item.node.type]}`}
                />
              ),
            )}
          </>
        )}
      </div>
    </section>
  );
}
