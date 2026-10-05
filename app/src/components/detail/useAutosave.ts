import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ApiError } from "../../api/client";
import { reportSaveFailure } from "../../canvas/actions";
import { appStore } from "../../store";
import type { NodePatch } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long "Saved" stays up before it fades. */
export const SAVED_MS = 1500;

/**
 * Saves edits to one node and reports how that is going. A failed save keeps
 * its patch and folds it into the next one, so the next edit retries it. If the
 * panel is closed while a patch is still unsent, nothing is lost silently: a
 * toast offers to try the save again.
 */
export function useAutosave(nodeId: string) {
  const navigate = useNavigate();
  const [inFlight, setInFlight] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const unsent = useRef<NodePatch>({});
  const mounted = useRef(true);
  const idRef = useRef(nodeId);
  idRef.current = nodeId;

  /** Offers Retry for a patch that has nowhere left to wait: the panel it was typed in is gone. */
  const offerRetry = useCallback((id: string, patch: NodePatch) => {
    reportSaveFailure(() => {
      appStore
        .getState()
        .updateNode(id, patch)
        .catch(() => offerRetry(id, patch));
    });
  }, []);

  const save = useCallback(
    async (patch: NodePatch) => {
      const merged = { ...unsent.current, ...patch };
      unsent.current = {};
      setInFlight((n) => n + 1);
      setStatus("saving");
      try {
        await appStore.getState().updateNode(nodeId, merged);
        setStatus("saved");
      } catch (error) {
        if ((error as ApiError).code === "node_not_found") {
          // Deleted somewhere else: not a connection problem, and nothing here can save it.
          uiStore.getState().toast({ message: COPY.nodeDeletedElsewhere, tone: "warn" });
          navigate("/", { replace: true });
        } else if (mounted.current) {
          unsent.current = { ...merged, ...unsent.current };
          setStatus("error");
        } else {
          offerRetry(nodeId, merged);
        }
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [nodeId, navigate, offerRetry],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (Object.keys(unsent.current).length > 0) offerRetry(idRef.current, unsent.current);
    };
  }, [offerRetry]);

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
