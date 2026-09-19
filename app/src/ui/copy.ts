/**
 * User-facing copy for the workspace, from docs/state-matrix.md. Every error
 * says what failed and what to do; not-found and save failures never share words.
 */
export const COPY = {
  // S3 — Workspace
  saveFailed: "Couldn't save that change. Check your connection and try again.",
  undoFailed: "Couldn't undo that. Check your connection and try again.",
  loading: "Waiting for the board.",
  nothingToFit: "Nothing to fit yet.",
  nothingToUndo: "Nothing to undo yet.",
  maxZoom: "Already zoomed in as far as it goes (200%).",
  minZoom: "Already zoomed out as far as it goes (25%).",

  // O1 — Add-node menu
  addNodeFailed: "Couldn't add the node. Check your connection and try again.",
  waitForReply: "Wait for the current reply to finish.",

  // S4 — Node detail
  nodeMissingTitle: "That node doesn't exist.",
  nodeMissingBody: "It may have been deleted.",
  nodeDeletedElsewhere: "That node no longer exists — it was deleted.",
  autosaveFailed:
    "Changes aren't saving. Check your connection — your text is still here, and we'll retry when you next edit.",
  noBody: "Add a description.",
  noFiles: "No files attached",
  noConnections: "Not connected to anything yet",
  noAnnotations: "No notes yet.",
  fileMissing: "File not available after reload",
  typeWhileSaving: "Saving — the type can change once this save lands.",
  finishConnecting: "Finish connecting first.",
  emptyAnnotation: "Write something first.",

  // O4 — Quick-peek
  noDescription: "No description yet",
  connectNeedsAnother: "Add another node to connect to.",
} as const;
