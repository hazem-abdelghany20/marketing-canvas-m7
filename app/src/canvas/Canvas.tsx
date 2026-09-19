import { Background, BackgroundVariant, ReactFlow, type NodeChange, type OnNodeDrag } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import type { CardNode, PendingNode } from "../components/NodeCard";
import { appStore } from "../store";
import { omit } from "../store/records";
import type { Viewport } from "../types";
import { uiStore } from "../ui/uiStore";
import { moveNode, nudgeNode } from "./actions";
import { CanvasActionsContext, type CanvasActions } from "./canvasActions";
import { nodeTypes, toFlowNodes, toPendingNodes } from "./nodeTypes";
import { MAX_ZOOM, MIN_ZOOM } from "./useViewport";

/** Spacing of the dot grid, shared with the loading placeholder so the two match. */
export const GRID_GAP = 26;

interface CanvasProps {
  initialViewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
}

type Point = { x: number; y: number };
type FlowNode = CardNode | PendingNode;

/**
 * The pan/zoom surface and the cards on it. Dragging empty space pans; scroll
 * and pinch zoom, clamped by React Flow to 0.25x–2x. The store owns positions:
 * a card being dragged follows the pointer locally and is written once, on drop.
 */
export function Canvas({ initialViewport, onViewportChange }: CanvasProps) {
  const navigate = useNavigate();
  const nodes = useStore(appStore, (s) => s.nodes);
  const edges = useStore(appStore, (s) => s.edges);
  const annotations = useStore(appStore, (s) => s.annotations);
  const files = useStore(appStore, (s) => s.files);
  const objectUrls = useStore(appStore, (s) => s.objectUrls);
  const pending = useStore(uiStore, (s) => s.pendingImports);
  const selectedIds = useStore(uiStore, (s) => s.selectedIds);
  const openId = useMatch("/node/:id")?.params.id ?? null;
  const [dragging, setDragging] = useState<Record<string, Point>>({});

  // A selection that points at a node deleted elsewhere clears itself, silently.
  useEffect(() => {
    const live = selectedIds.filter((id) => nodes[id]);
    if (live.length !== selectedIds.length) uiStore.getState().select(live);
  }, [nodes, selectedIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const flowNodes = useMemo<FlowNode[]>(
    () => [
      ...toFlowNodes(
        nodes,
        edges,
        annotations,
        { selectedIds: selectedSet, dragging, highlightedId: openId },
        { files, objectUrls },
      ),
      ...toPendingNodes(pending),
    ],
    [nodes, edges, annotations, selectedSet, dragging, openId, files, objectUrls, pending],
  );

  const actions = useMemo<CanvasActions>(
    () => ({
      open: (id) => navigate(`/node/${encodeURIComponent(id)}`),
      nudge: nudgeNode,
    }),
    [navigate],
  );

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    let selection: Set<string> | null = null;
    const moved: Record<string, Point> = {};
    for (const change of changes) {
      if (change.type === "select") {
        selection ??= new Set(uiStore.getState().selectedIds);
        if (change.selected) selection.add(change.id);
        else selection.delete(change.id);
      } else if (change.type === "position" && change.dragging && change.position) {
        moved[change.id] = change.position;
      }
    }
    if (selection) uiStore.getState().select([...selection]);
    if (Object.keys(moved).length > 0) setDragging((d) => ({ ...d, ...moved }));
  }, []);

  const onNodeDragStop = useCallback<OnNodeDrag<FlowNode>>((_event, _node, dragged) => {
    const stored = appStore.getState().nodes;
    for (const { id, position } of dragged) {
      const x = Math.round(position.x);
      const y = Math.round(position.y);
      if (stored[id] && (stored[id].x !== x || stored[id].y !== y)) moveNode(id, x, y);
    }
    // The store now holds the optimistic position, so the local override can go.
    const ids = dragged.map((n) => n.id);
    setDragging((d) => omit(d, ids));
  }, []);

  return (
    <CanvasActionsContext.Provider value={actions}>
      <ReactFlow<FlowNode>
        nodes={flowNodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={(_event, node) => actions.open(node.id)}
        defaultViewport={initialViewport}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onMove={(_event, viewport) => onViewportChange(viewport)}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        // Cards are the focus targets and handle their own keys (Enter, arrows);
        // deletion goes through the store so it can be undone.
        nodesFocusable={false}
        edgesFocusable={false}
        disableKeyboardA11y
        deleteKeyCode={null}
        aria-label="Canvas"
        // React Flow's credit ships with a white chip; restyle it with the tokens.
        className="[&_.react-flow\_\_attribution]:bg-transparent [&_.react-flow\_\_attribution_a]:!text-muted"
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={1.2} color="var(--grid-dot)" />
      </ReactFlow>
    </CanvasActionsContext.Provider>
  );
}
