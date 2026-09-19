import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { Viewport } from "../types";
import { MAX_ZOOM, MIN_ZOOM } from "./useViewport";

/** Spacing of the dot grid, shared with the loading placeholder so the two match. */
export const GRID_GAP = 26;

interface CanvasProps {
  initialViewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
}

/**
 * The pan/zoom surface. Dragging empty space pans; scroll and pinch zoom,
 * clamped by React Flow to 0.25x–2x. Nodes and edges arrive in later tickets.
 */
export function Canvas({ initialViewport, onViewportChange }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={[]}
        edges={[]}
        defaultViewport={initialViewport}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onMove={(_event, viewport) => onViewportChange(viewport)}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        aria-label="Canvas"
        // React Flow's credit ships with a white chip; restyle it with the tokens.
        className="[&_.react-flow\_\_attribution]:bg-transparent [&_.react-flow\_\_attribution_a]:!text-muted"
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={1.2} color="var(--grid-dot)" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
