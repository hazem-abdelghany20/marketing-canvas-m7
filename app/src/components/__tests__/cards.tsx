import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { CanvasActionsContext, type CanvasActions } from "../../canvas/canvasActions";
import { nodeTypes, toFlowNodes } from "../../canvas/nodeTypes";
import { byId } from "../../store/records";
import type { Annotation, CanvasNode, Edge } from "../../types";

// React Flow measures its container; jsdom has no layout engine to observe.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const T = "2026-09-01T00:00:00.000Z";

export function makeNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, "id">): CanvasNode {
  return { type: "note", title: "A node", body: "", fileIds: [], x: 0, y: 0, createdAt: T, updatedAt: T, ...overrides };
}

/** Mounts real cards inside a real React Flow, the way the canvas does. */
export function renderCards(
  nodes: CanvasNode[],
  { edges = [], annotations = [], selected = [] }: { edges?: Edge[]; annotations?: Annotation[]; selected?: string[] } = {},
  children?: ReactNode,
) {
  const actions: CanvasActions = { open: vi.fn(), nudge: vi.fn() };
  const flowNodes = toFlowNodes(byId(nodes), byId(edges), byId(annotations), {
    selectedIds: new Set(selected),
    dragging: {},
  });
  const utils = render(
    <ReactFlowProvider>
      <CanvasActionsContext.Provider value={actions}>
        <div style={{ width: 1000, height: 800 }}>
          <ReactFlow nodes={flowNodes} edges={[]} nodeTypes={nodeTypes} nodesFocusable={false} disableKeyboardA11y />
        </div>
        {children}
      </CanvasActionsContext.Provider>
    </ReactFlowProvider>,
  );
  return { actions, ...utils };
}
