import { useReactFlow } from "@xyflow/react";
import { useStore } from "zustand";
import { reportSaveFailure, undoLast } from "../../canvas/actions";
import { startConnect } from "../../canvas/connect";
import { panToNode } from "../../canvas/panToNode";
import { appStore } from "../../store";
import { groupConnections, otherEnd } from "../../store/edges";
import type { Edge } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore, useUi } from "../../ui/uiStore";
import { Button } from "../Button";
import { TYPE_BG, typeLabel } from "../TypeChip";
import { ConfirmRemove } from "./ConfirmRemove";
import { Section } from "./Section";

/** Width of the panel on wide screens, which covers that much of the canvas. */
export const PANEL_WIDTH = 480;

/**
 * S4 — every edge touching this node, grouped by relationship. One stored edge
 * shows here and on the other node's panel, from the other side.
 */
export function ConnectionList({ nodeId }: { nodeId: string }) {
  const edges = useStore(appStore, (s) => s.edges);
  const nodes = useStore(appStore, (s) => s.nodes);
  const connecting = useUi((s) => s.connect.active);
  const flow = useReactFlow();
  const groups = groupConnections(edges, nodeId);

  const sections: Array<{ label: string; edges: Edge[] }> = [
    { label: "Serves →", edges: groups.serves },
    { label: "← Served by", edges: groups.servedBy },
    { label: "Related", edges: groups.related },
  ].filter((g) => g.edges.length > 0);

  // The panel stays on this node; only the camera moves, and the other node is selected.
  function goTo(otherId: string) {
    const other = appStore.getState().nodes[otherId];
    if (!other) return;
    uiStore.getState().select([otherId]);
    const covered = window.innerWidth >= 900 ? PANEL_WIDTH : 0;
    void panToNode(flow, other, { coveredRight: covered });
  }

  function remove(edge: Edge, otherTitle: string) {
    appStore
      .getState()
      .deleteEdge(edge.id)
      .then(() =>
        uiStore.getState().toast({
          message: `Removed the connection to ${otherTitle}.`,
          tone: "success",
          actionLabel: "Undo",
          onAction: () => undoLast(),
        }),
      )
      .catch(() => reportSaveFailure(() => remove(edge, otherTitle)));
  }

  const connect = () => startConnect(nodeId);

  return (
    <Section
      title="Connections"
      action={
        <Button className="!px-2 !py-1 text-xs" onClick={connect}>
          + Connect
        </Button>
      }
    >
      {sections.length === 0 ? (
        <div className="rounded-md border border-dashed border-strong p-3.5 text-center">
          <p className="m-0 mb-2 text-[13px] text-primary">{COPY.noConnections}</p>
          <Button variant="primary" className="text-[12.5px]" onClick={connect}>
            Connect
          </Button>
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.label} className="mb-3 last:mb-0">
            <h3 className="m-0 mb-1.5 font-mono text-[9.5px] font-normal uppercase tracking-[0.12em] text-muted">
              {section.label}
            </h3>
            <ul aria-label={section.label.replace(/[←→]/g, "").trim()} className="m-0 list-none p-0">
              {section.edges.map((edge) => {
                const other = nodes[otherEnd(edge, nodeId)];
                if (!other) return null;
                const title = other.title.trim() || "Untitled";
                return (
                  <li
                    key={edge.id}
                    data-connection={other.id}
                    className="mb-1.5 flex items-center gap-2 rounded-sm border border-subtle bg-elevated px-2 py-1.5"
                  >
                    <span aria-hidden="true" className={`size-[7px] flex-none rounded-full ${TYPE_BG[other.type]}`} />
                    <button
                      type="button"
                      onClick={() => goTo(other.id)}
                      aria-label={`${title}, ${typeLabel(other.type)}. Show on canvas`}
                      className="min-w-0 flex-1 truncate rounded-sm text-left text-[13px] text-primary"
                    >
                      {title}
                    </button>
                    <ConfirmRemove
                      label={`Remove connection to ${title}`}
                      disabledReason={connecting ? COPY.finishConnecting : null}
                      onConfirm={() => remove(edge, title)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </Section>
  );
}
