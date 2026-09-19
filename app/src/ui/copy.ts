/**
 * User-facing copy for the workspace, from docs/state-matrix.md. Every error
 * says what failed and what to do; not-found and save failures never share words.
 */
export const COPY = {
  // S3 — Workspace
  saveFailed: "Couldn't save that change. Check your connection and try again.",
  undoFailed: "Couldn't undo that. Check your connection and try again.",
  loading: "Waiting for the board.",

  // O4 — Quick-peek
  noDescription: "No description yet",
  connectNeedsAnother: "Add another node to connect to.",
} as const;
