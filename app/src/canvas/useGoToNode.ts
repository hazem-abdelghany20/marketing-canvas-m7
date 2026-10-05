import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { useMatch } from "react-router-dom";
import { PANEL_WIDTH } from "../components/detail/ConnectionList";
import { isNarrow } from "../lib/useMediaQuery";
import type { CanvasNode } from "../types";
import { uiStore } from "../ui/uiStore";
import { panToNode } from "./panToNode";

export interface GoToOptions {
  /** Land at this zoom. */
  zoom?: number;
  /** Otherwise keep the current zoom, but never smaller than this, so the card stays readable. */
  minZoom?: number;
  /** Hand keyboard focus to the card. Left off when the person is working elsewhere, as in the chat rail. */
  focusCard?: boolean;
}

/**
 * Selects a node and pans the canvas to it, centred in what the detail panel leaves
 * uncovered. Search and the chat's citation chips both go through this.
 */
export function useGoToNode() {
  const flow = useReactFlow();
  const panelOpen = useMatch("/node/:id") !== null;

  return useCallback(
    (node: CanvasNode, { zoom, minZoom = 0, focusCard = false }: GoToOptions = {}) => {
      uiStore.getState().select([node.id]);
      const covered = panelOpen && !isNarrow() ? PANEL_WIDTH : 0;
      void panToNode(flow, node, { zoom: zoom ?? Math.max(flow.getZoom(), minZoom), coveredRight: covered });
      if (focusCard) {
        document
          .querySelector<HTMLElement>(`[data-node-card="${CSS.escape(node.id)}"]`)
          ?.focus({ preventScroll: true });
      }
    },
    [flow, panelOpen],
  );
}
