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
  nothingToArrange: "Nothing to arrange yet.",
  nothingToUndo: "Nothing to undo yet.",
  maxZoom: "Already zoomed in as far as it goes (200%).",
  minZoom: "Already zoomed out as far as it goes (25%).",

  // O6 — Chat rail
  chatEmptyPrompt: "Ask about your canvas, or ask me to draft something.",
  chatReplyFailed: "That reply didn't finish. Try again.",
  chatWriteFirst: "Write a message first.",
  chatReplying: "Assistant is replying",
  chatPlaceholder: "Ask, or say \u201cdraft a\u2026\u201d",
  chatHint: "Enter to send \u00b7 Shift+Enter for a new line",
  chatHintBusy: "Replying\u2026",

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

/**
 * Three starting points, one for each way the server answers on its own: it drafts a node,
 * it names the nodes it is reading from, or it proposes a connection between two it recognises.
 * (Its fourth way, the Reasoner, has to be asked for, which arrives with the mode picker.)
 */
export const CHAT_EXAMPLES = [
  { mode: "Generator", text: "Draft a reel script about linen care" },
  { mode: "Librarian", text: "What serves the Ramadan push?" },
  { mode: "Operator", text: "Connect the linen shoot hero to the Ramadan push" },
] as const;
