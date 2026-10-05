import { useEffect } from "react";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Marks the nodes an assistant reply cites, from the moment it completes until the
 * selection moves somewhere else. Selecting a cited node (as a chip does) keeps the
 * marks; selecting anything else, or nothing, ends them. So does asking again, or
 * retrying a reply. Mount it once, with the canvas: a reply that was already finished
 * when it mounts is not marked again, because nothing about it changes.
 */
export function useCitationHighlight() {
  useEffect(() => {
    const stopChat = appStore.subscribe((state, previous) => {
      if (state.chatMessages === previous.chatMessages) return;
      const before = new Map(previous.chatMessages.map((m) => [m.id, m.status]));
      for (const message of state.chatMessages) {
        if (message.role !== "assistant" || before.get(message.id) === message.status) continue;
        const ui = uiStore.getState();
        if (message.status === "streaming") {
          // A new question, or a retry: the old answer's marks no longer belong to anything on screen.
          if (ui.citedIds.length > 0) ui.setCited([]);
        } else if (message.status === "done") {
          ui.setCited(message.citedNodeIds);
        }
      }
    });

    const stopSelection = uiStore.subscribe((state, previous) => {
      if (state.citedIds.length === 0 || sameIds(state.selectedIds, previous.selectedIds)) return;
      const cited = new Set(state.citedIds);
      const stillOnTheCitations = state.selectedIds.length > 0 && state.selectedIds.every((id) => cited.has(id));
      if (!stillOnTheCitations) state.setCited([]);
    });

    return () => {
      stopChat();
      stopSelection();
    };
  }, []);
}
