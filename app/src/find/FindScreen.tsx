import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { Button } from "../components/Button";
import { TYPE_BG, typeLabel } from "../components/TypeChip";
import { PhoneIcon } from "../phone/icons";
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

  // The mockup's index row: the type's square, the title, and what it leads to at the right.
  const rowButton = (row: FindRow, detail: boolean) => (
    <li key={row.node.id}>
      <button
        type="button"
        onClick={() => choose(row)}
        className="flex w-full items-center gap-2.5 border-0 border-b border-solid border-subtle bg-transparent px-0 py-[11px] text-left text-[14px] text-primary [touch-action:manipulation]"
      >
        <span aria-hidden="true" className={`size-2 flex-none rounded-[2px] ${TYPE_BG[row.node.type]}`} />
        <span className="min-w-0 flex-1">
          {row.node.title.trim() || "Untitled"}
          {detail ? (
            <span className="block truncate text-[12px] text-muted">
              {typeLabel(row.node.type)}
              {row.snippet ? ` · ${row.snippet}` : ""}
            </span>
          ) : null}
        </span>
        {row.note ? (
          <span className={`ml-auto flex-none whitespace-nowrap text-[12px] ${row.goes === "open" ? "text-danger" : "text-muted"}`}>
            {row.note}
          </span>
        ) : null}
      </button>
    </li>
  );

  return (
    // One scrolling page, as the mockup has it: the search box and the chips go up with the list.
    <div className="h-full overflow-y-auto px-[18px] pb-5 pt-[max(14px,calc(env(safe-area-inset-top)+8px))] [scrollbar-width:none]">
      <h1 className="sr-only">{COPY.findTitle}</h1>
      <label
        data-search-box
        className="flex h-11 items-center gap-2 rounded-[12px] border border-strong bg-elevated px-3 text-muted"
      >
        <PhoneIcon name="search" />
        {/* The text typed is 16px, so the browser never zooms to the field; the placeholder is the mockup's 14px. */}
        <input
          type="search"
          aria-label="Find a node"
          placeholder={COPY.findPlaceholder}
          value={query}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFieldKeyDown}
          className="h-full w-full min-w-0 border-0 bg-transparent p-0 text-base text-primary placeholder:text-[14px] placeholder:text-muted"
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
              className={`inline-flex flex-none items-center gap-[5px] whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[12px] [touch-action:manipulation] ${
                on ? "border-primary bg-primary text-inverse" : "border-strong bg-panel text-primary"
              }`}
            >
              {id === "all" ? null : <span aria-hidden="true" className={`size-[7px] rounded-full ${TYPE_BG[id]}`} />}
              {id === "all" ? `All ${graph.nodes.length}` : label}
            </button>
          );
        })}
      </div>

      <div>
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
              <section key={group.id} className="mt-4">
                <h2 className="m-0 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-muted">
                  {group.label}
                </h2>
                <ul role="list" aria-label={group.label} className="m-0 list-none p-0">
                  {group.rows.map((row) => rowButton(row, false))}
                </ul>
              </section>
            ))
          : null}

        {view.kind === "list" && view.rows.length > 0 ? (
          <ul role="list" aria-label={view.searching ? "Matches" : "Nodes"} className="m-0 mt-2 list-none p-0">
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
