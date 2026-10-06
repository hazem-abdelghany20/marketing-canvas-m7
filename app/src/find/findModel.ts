import { searchNodes } from "../lib/searchNodes";
import { countUnder, reachesGoal, type Graph } from "../trace/traceModel";
import type { CanvasNode, NodeType } from "../types";

/**
 * The model behind Find (docs/spec.md § P5): what to list, from the board, what was typed and the type chosen. Pure, like
 * Trace's, and it asks the same question the same way: "reaches a goal" is the walk up serves edges that Trace uses.
 */

export type FindFilter = "all" | NodeType;

export const FIND_FILTERS: ReadonlyArray<{ id: FindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "goal", label: "Goals" },
  { id: "strategy", label: "Strategies" },
  { id: "campaign", label: "Campaigns" },
  { id: "content", label: "Content" },
  { id: "asset", label: "Assets" },
  { id: "note", label: "Notes" },
];

/** The groups of the index, in the order of the chain. */
const TYPE_GROUPS: ReadonlyArray<{ id: NodeType; label: string }> = [
  { id: "goal", label: "Goals" },
  { id: "strategy", label: "Strategies" },
  { id: "campaign", label: "Campaigns" },
  { id: "content", label: "Content" },
  { id: "asset", label: "Assets" },
  { id: "note", label: "Notes" },
];
const LOOSE_LABEL = "Not connected to a goal";

/** A body is shown this far, for telling two nodes with like titles apart. */
const SNIPPET = 80;

export interface FindRow {
  node: CanvasNode;
  /** What choosing it does: line Trace up on its chain, or open it, when no goal is above it. */
  goes: "trace" | "open";
  /** How it connects, in a few words: "7 under it", "trace →", or why it can't be traced. */
  note: string;
  /** The start of its body. */
  snippet: string;
}

export interface FindGroup {
  id: NodeType | "loose";
  label: string;
  rows: FindRow[];
}

export type FindView =
  /** Nothing on the board. */
  | { kind: "empty" }
  /** Nothing typed, no type chosen: everything, grouped. */
  | { kind: "index"; groups: FindGroup[] }
  /** Something typed (`searching`), or a type chosen: one list. */
  | { kind: "list"; rows: FindRow[]; searching: boolean };

function snippetOf(node: CanvasNode): string {
  const body = node.body.replace(/\s+/g, " ").trim();
  return body.length > SNIPPET ? `${body.slice(0, SNIPPET)}…` : body;
}

function rowFor(graph: Graph, node: CanvasNode): FindRow {
  const traces = reachesGoal(graph, node.id);
  let note: string;
  if (node.type === "goal") {
    const under = countUnder(graph, node.id);
    note = under > 0 ? `${under} under it` : "";
  } else if (traces) {
    note = "trace →";
  } else if (graph.serves(node.id).length > 0 || graph.servers(node.id).length > 0) {
    // Part of a chain, but not one that reaches a goal.
    note = "no goal above it";
  } else {
    note = graph.related(node.id).length > 0 ? "relates only" : "no links";
  }
  return { node, goes: traces ? "trace" : "open", note, snippet: snippetOf(node) };
}

/**
 * What Find lists. With something typed, one list of matches (titles before bodies, as search does on a desktop), narrowed
 * by the type chosen. With only a type chosen, every node of it, connected or not. With neither, an index: what reaches a goal,
 * by type in the order of the chain, and last, in a group of its own, everything that does not (so a node is listed once).
 */
export function buildFind(graph: Graph, query: string, filter: FindFilter): FindView {
  if (graph.nodes.length === 0) return { kind: "empty" };

  const ofType = (node: CanvasNode) => filter === "all" || node.type === filter;
  const typed = query.trim();
  if (typed) {
    return {
      kind: "list",
      rows: searchNodes(graph.nodes, typed)
        .filter(ofType)
        .map((node) => rowFor(graph, node)),
      searching: true,
    };
  }
  if (filter !== "all") {
    return { kind: "list", rows: graph.nodes.filter(ofType).map((node) => rowFor(graph, node)), searching: false };
  }

  const rows = graph.nodes.map((node) => rowFor(graph, node));
  const groups: FindGroup[] = TYPE_GROUPS.map(({ id, label }) => ({
    id,
    label,
    rows: rows.filter((row) => row.node.type === id && row.goes === "trace"),
  })).filter((group) => group.rows.length > 0);
  const loose = rows.filter((row) => row.goes === "open");
  if (loose.length > 0) groups.push({ id: "loose", label: LOOSE_LABEL, rows: loose });
  return { kind: "index", groups };
}
