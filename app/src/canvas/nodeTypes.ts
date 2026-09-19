import type { NodeTypes } from "@xyflow/react";
import { CARD_HEIGHT, CARD_WIDTH, NodeCard, type CardNode } from "../components/NodeCard";
import type { ById } from "../store/records";
import type { Annotation, CanvasNode, Edge } from "../types";

/** Module-level so React Flow never sees a new object and remounts every card. */
export const nodeTypes: NodeTypes = { card: NodeCard };

export interface CardFlags {
  selectedIds: ReadonlySet<string>;
  /** Positions of cards mid-drag, which win over the stored ones until the drop. */
  dragging: Readonly<Record<string, { x: number; y: number }>>;
  highlightedId?: string | null;
  connectSourceId?: string | null;
  flashIds?: ReadonlySet<string>;
}

/** Counts per node, computed once per render rather than once per card. */
export function countsByNode(edges: ById<Edge>, annotations: ById<Annotation>) {
  const edgeCount = new Map<string, number>();
  for (const edge of Object.values(edges)) {
    edgeCount.set(edge.fromId, (edgeCount.get(edge.fromId) ?? 0) + 1);
    edgeCount.set(edge.toId, (edgeCount.get(edge.toId) ?? 0) + 1);
  }
  const annotationCount = new Map<string, number>();
  for (const annotation of Object.values(annotations)) {
    annotationCount.set(annotation.nodeId, (annotationCount.get(annotation.nodeId) ?? 0) + 1);
  }
  return { edgeCount, annotationCount };
}

/** Store nodes → React Flow nodes. Fixed width/height means no measuring pass. */
export function toFlowNodes(
  nodes: ById<CanvasNode>,
  edges: ById<Edge>,
  annotations: ById<Annotation>,
  flags: CardFlags,
): CardNode[] {
  const counts = countsByNode(edges, annotations);
  return Object.values(nodes).map((node) => ({
    id: node.id,
    type: "card",
    position: flags.dragging[node.id] ?? { x: node.x, y: node.y },
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    selected: flags.selectedIds.has(node.id),
    data: {
      node,
      fileCount: node.fileIds.length,
      annotationCount: counts.annotationCount.get(node.id) ?? 0,
      edgeCount: counts.edgeCount.get(node.id) ?? 0,
      highlighted: flags.highlightedId === node.id,
      connectSource: flags.connectSourceId === node.id,
      flashing: flags.flashIds?.has(node.id) ?? false,
    },
  }));
}
