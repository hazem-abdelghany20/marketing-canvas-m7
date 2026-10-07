import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { addServing } from "../canvas/actions";
import { Button } from "../components/Button";
import { UndoButton } from "../components/UndoButton";
import { BoardFailed, BoardLoading } from "../routes/CanvasStage";
import type { WorkspaceController } from "../routes/useWorkspace";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { TraceRowView } from "./TraceRowView";
import { buildGraph, buildTrace } from "./traceModel";

/**
 * P2 — Trace, the phone's home screen. A column of rows from a goal down, one for each layer of what serves the card on
 * screen above it; swipe a row and everything under it is redrawn. It answers the one question the app is for: why does
 * this piece of content exist?
 */
export function TraceScreen({ w }: { w: WorkspaceController }) {
  const navigate = useNavigate();
  const nodes = useStore(appStore, (s) => s.nodes);
  const edges = useStore(appStore, (s) => s.edges);
  const annotations = useStore(appStore, (s) => s.annotations);
  const path = useUi((s) => s.tracePath);

  const graph = useMemo(() => buildGraph({ nodes, edges, annotations }), [nodes, edges, annotations]);
  const rows = useMemo(() => buildTrace(graph, path), [graph, path]);

  /** The card on screen in each row, which is what is kept: a choice lower down keeps the choices above it. */
  const shown = rows.map((row) => row.cards[row.selected]?.node.id).filter((id): id is string => id !== undefined);
  function choose(depth: number, index: number) {
    const id = rows[depth]?.cards[index]?.node.id;
    if (id) uiStore.getState().setTracePath([...shown.slice(0, depth), id]);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-2 pb-1 pl-[18px] pr-3 pt-[max(14px,calc(env(safe-area-inset-top)+4px))]">
        <h1 className="m-0 flex-1 text-[20px] font-semibold leading-normal tracking-[-0.015em] text-primary">{COPY.traceTitle}</h1>
        <UndoButton ready={w.ready} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[18px] pt-1 [scrollbar-width:none]">
        {w.ready && rows.length === 0 ? (
          <div className="mx-4 mt-6 flex flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-7 py-6 text-center">
            <h2 className="m-0 text-base font-semibold text-primary">{COPY.traceNoGoals}</h2>
            <p className="m-0 text-[13px] leading-relaxed text-muted">{COPY.traceNoGoalsBody}</p>
            <Button variant="primary" className="mt-2 px-4 py-2 text-[13.5px]" onClick={w.openAddMenu}>
              {COPY.traceAddGoal}
            </Button>
          </div>
        ) : (
          rows.map((row) => (
            <TraceRowView
              // A new parent makes a new row, which starts at its first card instead of wherever the last one was.
              key={`${row.depth}:${row.parentId ?? "goals"}`}
              row={row}
              parentTitle={row.parentId ? nodes[row.parentId]?.title.trim() || "Untitled" : null}
              onChoose={(index) => choose(row.depth, index)}
              onOpen={(id) => navigate(`/node/${encodeURIComponent(id)}`)}
              onAdd={() => {
                if (!row.parentId || !row.addType) return;
                // Made under the card above and joined to it; then opened, with its title ready to be typed.
                void addServing(row.parentId, row.addType, {
                  onCreated: (node) =>
                    navigate(`/node/${encodeURIComponent(node.id)}`, { state: { focusTitle: true } }),
                });
              }}
            />
          ))
        )}
        {rows.length > 0 ? <p className="mx-[18px] mb-0 mt-3.5 text-center text-[12px] text-muted">{COPY.traceSwipeHint}</p> : null}
      </div>

      {w.state === "loading" ? <BoardLoading /> : null}
      {w.state === "error" ? <BoardFailed unreadable={w.boardError?.code === "unexpected_response"} /> : null}
    </div>
  );
}
