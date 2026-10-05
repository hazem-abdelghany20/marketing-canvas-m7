/**
 * User-facing copy for the workspace, from docs/state-matrix.md. Every error
 * says what failed and what to do; not-found and save failures never share words.
 */
export const COPY = {
  // S3 — Workspace
  saveFailed: "Couldn't save that change. Check your connection and try again.",
  undoFailed: "Couldn't undo that. Check your connection and try again.",
  undoing: "Undoing\u2026",
  loading: "Waiting for the board.",
  boardFailed: "The board didn't load. Reload it to try again.",
  boardLoadFailed: "We couldn't load your board. Check your connection, then reload.",
  boardUnreadable: "Your board's data came back in a form we couldn't read. Reload to try again.",
  nodeLoadFailed: "We couldn't load this node.",
  nodeLoadFailedBody: "Check your connection, then reload.",
  sessionExpired: "Your session expired. Sign in again.",
  nothingToFit: "Nothing to fit yet.",
  nothingToArrange: "Nothing to arrange yet.",
  nothingToUndo: "Nothing to undo yet.",
  maxZoom: "Already zoomed in as far as it goes (200%).",
  minZoom: "Already zoomed out as far as it goes (25%).",

  // O6 — Chat rail
  chatLoading: "Loading the conversation",
  chatEmptyPrompt: "Ask about your canvas, or ask me to draft something.",
  chatReplyFailed: "That reply didn't finish. Try again.",
  chatWriteFirst: "Write a message first.",
  chatReplying: "Assistant is replying",
  chatPlaceholder: "Ask, or say \u201cdraft a\u2026\u201d",
  chatHint: "Enter to send \u00b7 Shift+Enter for a new line",
  chatHintBusy: "Replying\u2026",
  proposalNode: "Proposed node",
  proposalConnection: "Proposed connection",
  proposalAdd: "Add to canvas",
  proposalAdding: "Adding\u2026",
  proposalAddingReason: "Adding to the canvas\u2026",
  proposalAdded: "Added",
  proposalAddedReason: "Already on the canvas. Undo to take it back.",
  proposalFailed: "Couldn't add that to the canvas. Check your connection and try again.",

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

  // O7 — Whiteboard dock
  nothingToErase: "Nothing to erase yet.",
  sendBoard: "Send the board to the assistant \u2014 it reads your marks",
  drawFirst: "Draw or add a note first.",
  preparingBoard: "Preparing the board\u2026",
  sendBoardFailed: "Couldn't prepare the board to send. Try again.",
  nothingToSave: "Nothing to save yet.",
  savingImage: "Saving the image\u2026",
  saveImage: "Save the board as a PNG",
  saveImageFailed: "Couldn't save the image. Try again.",
  inkSaveFailed: "Couldn't save that mark. Check your connection and try again.",
  clearInkFailed: "Couldn't clear the ink. Check your connection and try again.",
  noteSaveFailed: "Couldn't save that note. Check your connection and try again.",
  noteDeleteFailed: "Couldn't delete that note. Check your connection and try again.",
  noteDeleted: "Note deleted.",
  typeANote: "Type a note",
  threadDeleted: "That thread was deleted.",
  commentPostFailed: "Couldn't post that comment. Check your connection and try again.",
  threadUpdateFailed: "Couldn't update that thread. Check your connection and try again.",
  threadDeleteFailed: "Couldn't delete that thread. Check your connection and try again.",
  commentDeleteFailed: "Couldn't delete that comment. Check your connection and try again.",
  commentWriteFirst: "Write a comment first.",
  nothingToResolve: "Nothing to resolve yet.",
  newThread: "New comment, pinned right here.",
  deleteThreadAsk: "Delete this thread and its comments?",
  deleteCommentAsk: "Delete this comment?",
  clearInkTitle: "Clear all ink?",
  clearInkBody: "Every stroke on this board is removed. Notes, stickies and comments stay.",

  // O4 — Quick-peek
  noDescription: "No description yet",
  connectNeedsAnother: "Add another node to connect to.",
} as const;

/**
 * Three starting points, one for each way the server answers on its own: it drafts a node,
 * it names the nodes it is reading from, or it proposes a connection between two it recognises.
 * (Its fourth way, the Reasoner, has to be asked for: it is in the composer's mode picker, not an example.)
 */
export const CHAT_EXAMPLES = [
  { mode: "Generator", text: "Draft a reel script about linen care" },
  { mode: "Librarian", text: "What serves the Ramadan push?" },
  { mode: "Operator", text: "Connect the linen shoot hero to the Ramadan push" },
] as const;

export const proposalAdded = (title: string) => `Added \u201c${title}\u201d to the canvas.`;

/** A connection can't be made because one of its nodes has been deleted since the reply. */
export const proposalNodeGone = (title: string | undefined) =>
  `Couldn't add that connection: ${title ? `\u201c${title}\u201d` : "one of its nodes"} is no longer on the canvas. Ask again for a fresh suggestion.`;
