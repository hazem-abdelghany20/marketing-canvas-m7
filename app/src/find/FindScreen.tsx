import { Search } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { TYPE_BG, typeLabel } from "../components/TypeChip";
import { BoardFailed, BoardLoading } from "../routes/CanvasStage";
import type { WorkspaceController } from "../routes/useWorkspace";
import { appStore } from "../store";
import { buildGraph, tracePathTo } from "../trace/traceModel";
import { COPY, findNoMatch, findNoneOfType } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { buildFind, FIND_FILTERS, type FindFilter, type FindRow } from "./findModel";

/**
 * P5 — Find: search, and an index of the board by type. Choosing a node that reaches a goal lines Trace up on its chain;
 * choosing one that does not opens it. It is where the gaps show: what no goal is above is listed on its own.
 */
export function FindScreen({ w }: { w: WorkspaceController }) {
  const navigate = useNavigate();
  const nodes = useStore(appStore, (s) => s.nodes);
  const edges = useStore(appStore, (s) => s.edges);
  const annotations = useStore(appStore, (s) => s.annotations);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FindFilter>("all");
  const filters = useRef<HTMLDivElement>(null);

  const graph = useMemo(() => buildGraph({ nodes, edges, annotations }), [nodes, edges, annotations]);
  const view = useMemo(() => buildFind(graph, query, filter), [graph, query, filter]);

  function choose(row: FindRow) {
    if (row.goes === "open") {
      navigate(`/node/${encodeURIComponent(row.node.id)}`);
      return;
    }
    // The chain from a goal down to the node, so Trace lines up on it and shows what is under it.
    const path = tracePathTo(graph, row.node.id);
    if (path) uiStore.getState().setTracePath(path);
    uiStore.getState().setPhoneTab("trace");
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    // With something typed, Enter takes the first match; with nothing, there is no first match to take.
    if (view.kind === "list" && view.searching && view.rows[0]) choose(view.rows[0]);
  }

  // The filters are a radio group, like the reply modes: the chosen one is the only tab stop, and the arrows move it.
  function onFilterKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const radios = Array.from(filters.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = radios.findIndex((radio) => radio === document.activeElement);
    if (at === -1) return;
    event.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length]!;
    next.focus();
    next.click();
  }

  const rowButton = (row: FindRow, detail: boolean) => (
    <li key={row.node.id}>
      <button
        type="button"
        onClick={() => choose(row)}
        className="flex min-h-[52px] w-full items-center gap-3 border-0 border-b border-subtle bg-transparent py-2 text-left [touch-action:manipulation]"
      >
        <span aria-hidden="true" className={`size-2 flex-none rounded-full ${TYPE_BG[row.node.type]}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-primary">{row.node.title.trim() || "Untitled"}</span>
          {detail ? (
            <span className="block truncate text-[12px] text-muted">
              {typeLabel(row.node.type)}
              {row.snippet ? ` · ${row.snippet}` : ""}
            </span>
          ) : null}
        </span>
        {row.note ? (
          <span
            className={`flex-none font-mono text-[11px] ${
              row.note === "no links" || row.note === "no goal above it" ? "text-danger" : "text-muted"
            }`}
          >
            {row.note}
          </span>
        ) : null}
      </button>
    </li>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex-none pb-2 pl-[18px] pr-3 pt-[max(14px,env(safe-area-inset-top))]">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.015em] text-primary">{COPY.findTitle}</h1>
      </header>

      <div className="flex-none px-4">
        <label className="flex items-center gap-2 rounded-lg border border-strong bg-elevated px-3">
          <Search size={16} aria-hidden="true" className="flex-none text-muted" />
          <input
            type="search"
            aria-label="Find a node"
            placeholder={COPY.findPlaceholder}
            value={query}
            enterKeyHint="search"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className="min-h-11 w-full border-0 bg-transparent py-2 text-base text-primary placeholder:text-muted"
          />
        </label>

        <div
          ref={filters}
          role="radiogroup"
          aria-label="Type"
          onKeyDown={onFilterKeyDown}
          className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {FIND_FILTERS.map(({ id, label }) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setFilter(id)}
                className={`inline-flex min-h-10 flex-none items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] [touch-action:manipulation] ${
                  on ? "border-primary bg-primary font-semibold text-inverse" : "border-strong bg-panel text-primary"
                }`}
              >
                {id === "all" ? `All ${graph.nodes.length}` : label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-1">
        {view.kind === "empty" ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-7 py-6 text-center">
            <h2 className="m-0 text-base font-semibold text-primary">{COPY.findNothing}</h2>
            <Button variant="primary" className="mt-1 px-4 py-2 text-[13.5px]" onClick={w.openAddMenu}>
              {COPY.findAddFirst}
            </Button>
          </div>
        ) : null}

        {view.kind === "index"
          ? view.groups.map((group) => (
              <section key={group.id} aria-label={group.label} className="mt-4">
                <h2 className="m-0 font-mono text-[10.5px] font-normal uppercase tracking-[0.13em] text-muted">{group.label}</h2>
                <ul role="list" className="m-0 list-none p-0">
                  {group.rows.map((row) => rowButton(row, false))}
                </ul>
              </section>
            ))
          : null}

        {view.kind === "list" && view.rows.length > 0 ? (
          <ul role="list" className="m-0 mt-2 list-none p-0">
            {view.rows.map((row) => rowButton(row, true))}
          </ul>
        ) : null}

        {view.kind === "list" && view.rows.length === 0 ? (
          <div role="status" className="px-1 pt-5">
            {view.searching ? (
              <>
                <p className="m-0 mb-2.5 text-[14px] text-primary">{findNoMatch(query)}</p>
                <Button className="px-3.5 py-2 text-[13px]" onClick={() => w.createFromSearch(query.trim())}>
                  {COPY.findCreateNote}
                </Button>
              </>
            ) : (
              <p className="m-0 text-[14px] text-muted">
                {findNoneOfType(FIND_FILTERS.find((f) => f.id === filter)?.label ?? "nodes")}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {w.state === "loading" ? <BoardLoading /> : null}
      {w.state === "error" ? <BoardFailed unreadable={w.boardError?.code === "unexpected_response"} /> : null}
    </div>
  );
}
