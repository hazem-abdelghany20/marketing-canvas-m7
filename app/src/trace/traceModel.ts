import type { ById } from "../store/records";
import type { Annotation, CanvasNode, Edge, NodeType } from "../types";

/**
 * The model behind Trace and Find (docs/spec.md § P2): pure functions over the nodes and edges, with no React, no
 * DOM and no stores, so every case is a plain call. A `serves` edge points from the node that serves to the node it
 * serves; `relates-to` has no direction and never leads anywhere.
 */

/** Rows stop here, however deep the serves edges go. */
export const MAX_TRACE_ROWS = 8;

/**
 * What goes in a row when nothing serves the card above it yet: the canonical chain, content → campaign → strategy → goal
 * (docs/spec.md § Data model). Nothing is expected to serve content, an asset or a note.
 */
export const NEXT_LAYER: Partial<Record<NodeType, NodeType>> = {
  goal: "strategy",
  strategy: "campaign",
  campaign: "content",
};

export interface GraphInput {
  nodes: ById<CanvasNode>;
  edges: ById<Edge>;
  annotations: ById<Annotation>;
}

/** The board as questions: who serves this, what does it serve, what is it joined to. All in board order. */
export interface Graph {
  /** Every node, in the order the API gave them. */
  nodes: CanvasNode[];
  node: (id: string) => CanvasNode | undefined;
  /** Nodes that serve `id`, directly. */
  servers: (id: string) => CanvasNode[];
  /** Nodes `id` serves, directly. */
  serves: (id: string) => CanvasNode[];
  /** Nodes joined to `id` by a relates-to edge, from either end. */
  related: (id: string) => CanvasNode[];
  /** How many notes (annotations) `id` carries. */
  notes: (id: string) => number;
}

export function buildGraph({ nodes, edges, annotations }: GraphInput): Graph {
  const list = Object.values(nodes);
  const order = new Map(list.map((node, index) => [node.id, index]));
  const servers = new Map<string, Set<string>>();
  const serves = new Map<string, Set<string>>();
  const related = new Map<string, Set<string>>();
  const notes = new Map<string, number>();

  const link = (map: Map<string, Set<string>>, from: string, to: string) => {
    const set = map.get(from) ?? new Set<string>();
    set.add(to);
    map.set(from, set);
  };
  for (const edge of Object.values(edges)) {
    // An edge to a node that is gone, or to itself, says nothing about the board.
    if (!nodes[edge.fromId] || !nodes[edge.toId] || edge.fromId === edge.toId) continue;
    if (edge.kind === "serves") {
      link(servers, edge.toId, edge.fromId);
      link(serves, edge.fromId, edge.toId);
    } else {
      link(related, edge.fromId, edge.toId);
      link(related, edge.toId, edge.fromId);
    }
  }
  for (const annotation of Object.values(annotations))
    notes.set(annotation.nodeId, (notes.get(annotation.nodeId) ?? 0) + 1);

  const inBoardOrder = (map: Map<string, Set<string>>, id: string): CanvasNode[] =>
    [...(map.get(id) ?? [])].sort((a, b) => order.get(a)! - order.get(b)!).map((other) => nodes[other]!);

  return {
    nodes: list,
    node: (id) => nodes[id],
    servers: (id) => inBoardOrder(servers, id),
    serves: (id) => inBoardOrder(serves, id),
    related: (id) => inBoardOrder(related, id),
    notes: (id) => notes.get(id) ?? 0,
  };
}

/** What a card says about its node, beyond the node itself. */
export interface TraceCard {
  node: CanvasNode;
  /** How many nodes serve this one, directly. */
  serving: number;
  /** For a goal: every node under it, at any depth. Zero for the rest. */
  under: number;
  /** The one type shared by what serves this node, or null if they differ, or nothing does. */
  servingType: NodeType | null;
  related: CanvasNode[];
  notes: number;
}

export interface TraceRow {
  /** 0 is the goals. */
  depth: number;
  /** The card on screen in the row above, which this row hangs from. Null for the goals. */
  parentId: string | null;
  cards: TraceCard[];
  /** The card on screen. */
  selected: number;
  /** The one type every card shares, or null if the row mixes them (or is empty). */
  type: NodeType | null;
  /** For an empty row: the layer that would go in it. */
  addType: NodeType | null;
}

/** The type every node shares, or null if they differ or there are none. */
export function sharedType(nodes: CanvasNode[]): NodeType | null {
  const first = nodes[0]?.type;
  return first && nodes.every((node) => node.type === first) ? first : null;
}

/** How many nodes sit under `id`, at any depth: everything that serves it, and what serves that, and so on. */
export function countUnder(graph: Graph, id: string): number {
  const seen = new Set<string>([id]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    for (const below of graph.servers(queue[i]!)) {
      if (seen.has(below.id)) continue;
      seen.add(below.id);
      queue.push(below.id);
    }
  }
  return seen.size - 1;
}

function cardFor(graph: Graph, node: CanvasNode): TraceCard {
  const servers = graph.servers(node.id);
  return {
    node,
    serving: servers.length,
    under: node.type === "goal" ? countUnder(graph, node.id) : 0,
    servingType: sharedType(servers),
    related: graph.related(node.id),
    notes: graph.notes(node.id),
  };
}

/**
 * The rows of a trace: the goals, then one row for each layer of what serves the card on screen above it. `path` is the
 * card chosen in each row, from the goals down; a row whose choice is not among its cards (it was made under another
 * parent, or the node has gone) starts at its first. Built from depth, not from node type, so a board that does not follow
 * the canonical chain still shows everything that reaches a goal; a node never appears twice in one chain.
 */
export function buildTrace(graph: Graph, path: readonly string[] = []): TraceRow[] {
  const goals = graph.nodes.filter((node) => node.type === "goal");
  if (goals.length === 0) return [];

  const rows: TraceRow[] = [];
  const chain = new Set<string>();
  let parentId: string | null = null;
  let nodes = goals;

  for (let depth = 0; depth < MAX_TRACE_ROWS; depth++) {
    const cards = nodes.map((node) => cardFor(graph, node));
    const chosen = cards.findIndex((card) => card.node.id === path[depth]);
    const selected = chosen === -1 ? 0 : chosen;
    rows.push({ depth, parentId, cards, selected, type: sharedType(nodes), addType: null });

    const here = nodes[selected]!;
    chain.add(here.id);
    const below = graph.servers(here.id).filter((node) => !chain.has(node.id));
    if (below.length === 0) {
      const addType = NEXT_LAYER[here.type];
      if (addType && depth + 1 < MAX_TRACE_ROWS) {
        rows.push({ depth: depth + 1, parentId: here.id, cards: [], selected: 0, type: null, addType });
      }
      break;
    }
    parentId = here.id;
    nodes = below;
  }
  return rows;
}

const layerName = (type: NodeType) => type.charAt(0).toUpperCase() + type.slice(1);

/** What a row is called: the one type it holds (or would hold), and "Served by" when it holds several. */
export function rowLabel(row: TraceRow): string {
  if (row.type) return layerName(row.type);
  if (row.cards.length === 0 && row.addType) return layerName(row.addType);
  return "Served by";
}

/**
 * The chain from a goal down to `id`, goal first and `id` last: the way up the serves edges that reaches a goal soonest,
 * and among equals the one through the node that comes first on the board. A goal is its own chain. Null for a node that
 * serves nothing that leads to a goal (a relates-to edge does not), and for a node that is not there.
 */
export function tracePathTo(graph: Graph, id: string): string[] | null {
  if (!graph.node(id)) return null;
  const from = new Map<string, string | null>([[id, null]]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const current = graph.node(queue[i]!)!;
    if (current.type === "goal") {
      // Walked back from the goal to `id`, so it reads goal first.
      const path: string[] = [];
      for (let at: string | null = current.id; at !== null; at = from.get(at) ?? null) path.push(at);
      return path;
    }
    for (const next of graph.serves(current.id)) {
      if (from.has(next.id)) continue;
      from.set(next.id, current.id);
      queue.push(next.id);
    }
  }
  return null;
}

/** Whether a chain of serves edges leads from `id` to a goal: the same walk as {@link tracePathTo}. */
export function reachesGoal(graph: Graph, id: string): boolean {
  return tracePathTo(graph, id) !== null;
}
