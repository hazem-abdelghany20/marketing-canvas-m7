import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import { useMatch } from "react-router-dom";
import { rectInView } from "../canvas/ensureInView";
import { panToNode } from "../canvas/panToNode";
import { useFitToBounds } from "../canvas/useFitToBounds";
import { MIN_ZOOM } from "../canvas/useViewport";
import { useViewportCenter } from "../canvas/viewportCenter";
import { CARD_HEIGHT, CARD_WIDTH } from "../components/NodeCard";
import { PANEL_WIDTH } from "../components/detail/ConnectionList";
import { isNarrow } from "../lib/useMediaQuery";
import { appStore } from "../store";
import type { ChatMessage } from "../types";
import { uiStore } from "../ui/uiStore";
import { applyProposal } from "./applyProposal";
import { focusChatOpenButton } from "./focus";

const rectOf = (node: { x: number; y: number }) => ({ x: node.x, y: node.y, width: CARD_WIDTH, height: CARD_HEIGHT });

/**
 * Applies a reply's proposal where the person is looking: a new node lands in the middle of
 * the part of the canvas the detail panel leaves uncovered, and if what was added is not
 * wholly on screen afterwards the camera moves to it (instantly under reduced motion).
 */
export function useApplyProposal() {
  const flow = useReactFlow();
  const canvas = useStoreApi();
  const viewportCenter = useViewportCenter();
  const fit = useFitToBounds();
  const panelOpen = useMatch("/node/:id") !== null;

  return useCallback(
    async (message: ChatMessage) => {
      const covered = panelOpen && !isNarrow() ? PANEL_WIDTH : 0;
      const centre = viewportCenter();
      // The centre of the whole canvas, moved left by half of what is covered.
      const at = { x: Math.round(centre.x - covered / 2 / flow.getZoom()), y: centre.y };

      const outcome = await applyProposal(message, { store: appStore, ui: uiStore, at });
      if (outcome.status !== "applied") return;

      // Below 900px the open sheet covers the canvas, and what was just added is there. Close it
      // (only now that it worked, so a failure and its action stay in view).
      if (isNarrow() && uiStore.getState().chatSheetOpen) {
        uiStore.getState().setChatSheetOpen(false);
        focusChatOpenButton();
      }

      const { nodes } = appStore.getState();
      const rects =
        outcome.kind === "node"
          ? [rectOf(outcome.node)]
          : [outcome.edge.fromId, outcome.edge.toId].flatMap((id) => (nodes[id] ? [rectOf(nodes[id])] : []));
      const { width, height, transform } = canvas.getState();
      const camera = { x: transform[0], y: transform[1], zoom: transform[2] };
      if (rects.every((rect) => rectInView(rect, camera, { width, height }, covered))) return;

      if (outcome.kind === "node") {
        void panToNode(flow, outcome.node, { coveredRight: covered });
      } else {
        const left = Math.min(...rects.map((r) => r.x));
        const top = Math.min(...rects.map((r) => r.y));
        // Never closer than it already is: adding a connection must not make the canvas lurch in.
        fit(
          {
            x: left,
            y: top,
            width: Math.max(...rects.map((r) => r.x + r.width)) - left,
            height: Math.max(...rects.map((r) => r.y + r.height)) - top,
          },
          covered,
          Math.max(flow.getZoom(), MIN_ZOOM),
        );
      }
    },
    [flow, canvas, viewportCenter, fit, panelOpen],
  );
}
