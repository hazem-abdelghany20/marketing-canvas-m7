import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import type { CanvasNode } from "../types";
import { TYPE_BG, typeLabel } from "./TypeChip";

/** How many nodes the empty query lists. */
export const RECENT_COUNT = 5;

const byRecency = (a: CanvasNode, b: CanvasNode) => b.updatedAt.localeCompare(a.updatedAt);

/** The nodes touched most recently, newest first. */
export function recentNodes(nodes: CanvasNode[], count = RECENT_COUNT): CanvasNode[] {
  return [...nodes].sort(byRecency).slice(0, count);
}

/**
 * Case-insensitive match on title or body, in memory. Title matches come
 * first, then body-only ones; each group newest first.
 */
export function searchNodes(nodes: CanvasNode[], query: string): CanvasNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const inTitle: CanvasNode[] = [];
  const inBody: CanvasNode[] = [];
  for (const node of nodes) {
    if (node.title.toLowerCase().includes(q)) inTitle.push(node);
    else if (node.body.toLowerCase().includes(q)) inBody.push(node);
  }
  return [...inTitle.sort(byRecency), ...inBody.sort(byRecency)];
}

interface SearchOverlayProps {
  onClose: () => void;
  /** Enter or a click on a result: move the camera there and select it. */
  onGo: (node: CanvasNode) => void;
  onCreateNote: (title: string) => void;
}

/** O5 — search and jump to a node. Results update as you type; there is no submit. */
export function SearchOverlay({ onClose, onGo, onCreateNote }: SearchOverlayProps) {
  const nodes = useStore(appStore, (s) => s.nodes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const all = useMemo(() => Object.values(nodes), [nodes]);
  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchNodes(all, query) : recentNodes(all)), [all, query, searching]);
  const current = results[Math.min(active, results.length - 1)];

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // With no matches there is nowhere to go: Enter does nothing.
      if (current) onGo(current);
    }
  }

  const optionId = (node: CanvasNode) => `${listId}-${node.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-[color-mix(in_srgb,var(--fg-primary)_28%,transparent)] px-4 pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search nodes"
        className="h-fit w-[min(520px,100%)] animate-mc-pop overflow-hidden rounded-lg border border-subtle bg-panel shadow-[0_30px_70px_-30px_rgba(0,0,0,.6)]"
      >
        <div className="flex items-center gap-2.5 border-b border-subtle px-4">
          <Search size={16} aria-hidden="true" className="flex-none text-muted" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search nodes by title or body"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search nodes by title or body"
            className="w-full border-0 bg-transparent py-[15px] text-[15.5px] text-primary placeholder:text-muted focus-visible:outline-offset-[-2px]"
          />
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1.5">
          {results.length > 0 ? (
            <>
              <h2
                id={`${listId}-heading`}
                className="m-0 px-[11px] pb-1.5 pt-2 font-mono text-[9.5px] font-normal uppercase tracking-[0.13em] text-muted"
              >
                {searching ? "Matches" : "Recent"}
              </h2>
              <ul id={listId} role="listbox" aria-labelledby={`${listId}-heading`} className="m-0 list-none p-0">
                {results.map((node) => (
                  <li
                    key={node.id}
                    id={optionId(node)}
                    role="option"
                    aria-selected={node === current}
                    data-search-result={node.id}
                    onMouseEnter={() => setActive(results.indexOf(node))}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onGo(node)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-[11px] py-2 ${node === current ? "bg-elevated" : ""}`}
                  >
                    <span aria-hidden="true" className={`size-[7px] flex-none rounded-full ${TYPE_BG[node.type]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-primary">
                        {node.title.trim() || "Untitled"}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {typeLabel(node.type)}
                        {node.body ? ` · ${node.body}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : searching ? (
            <div role="status" className="px-[11px] pb-4 pt-3.5">
              <p className="m-0 mb-2.5 text-[13.5px] text-primary">No nodes match "{query.trim()}".</p>
              <button
                type="button"
                onClick={() => onCreateNote(query.trim())}
                className="rounded-sm border border-strong bg-elevated px-[11px] py-[7px] text-[12.5px] text-primary"
              >
                Create a note with this title
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
