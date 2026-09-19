import { useCallback, useEffect, useRef, useState } from "react";
import { appStore } from "../../store";
import type { NodePatch } from "../../types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long "Saved" stays up before it fades. */
export const SAVED_MS = 1500;

/**
 * Saves edits to one node and reports how that is going. A failed save keeps
 * its patch and folds it into the next one, so the next edit retries it.
 */
export function useAutosave(nodeId: string) {
  const [inFlight, setInFlight] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const unsent = useRef<NodePatch>({});

  const save = useCallback(
    async (patch: NodePatch) => {
      const merged = { ...unsent.current, ...patch };
      unsent.current = {};
      setInFlight((n) => n + 1);
      setStatus("saving");
      try {
        await appStore.getState().updateNode(nodeId, merged);
        setStatus("saved");
      } catch {
        unsent.current = { ...merged, ...unsent.current };
        setStatus("error");
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [nodeId],
  );

  useEffect(() => {
    if (status !== "saved" || inFlight > 0) return;
    const timer = setTimeout(() => setStatus("idle"), SAVED_MS);
    return () => clearTimeout(timer);
  }, [status, inFlight]);

  return {
    save,
    status: inFlight > 0 ? "saving" : status,
    saving: inFlight > 0,
    /** Fields keep their own text while this is set, rather than follow a store that may roll back. */
    hold: inFlight > 0 || status === "error",
  };
}

export type Autosave = ReturnType<typeof useAutosave>;
