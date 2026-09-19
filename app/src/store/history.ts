import type { AppStore, SliceCreator } from "./state";

/** Comfortably above the 50 the spec requires. */
export const HISTORY_LIMIT = 100;

export interface HistoryEntry {
  label: string;
  /** Talks to the API; rejects with ApiError if the server refuses. */
  undo: () => Promise<void>;
}

export interface HistorySlice {
  undoStack: HistoryEntry[];
  undoing: boolean;
  /** Reverts the most recent mutation. A failed undo stays on the stack to retry. */
  undo: () => Promise<void>;
}

export function record(store: AppStore, entry: HistoryEntry): void {
  store.setState((s) => ({ undoStack: [...s.undoStack, entry].slice(-HISTORY_LIMIT) }));
}

export const createHistorySlice: SliceCreator<HistorySlice> = () => (set, get) => ({
  undoStack: [],
  undoing: false,

  async undo() {
    const { undoStack, undoing } = get();
    const entry = undoStack.at(-1);
    if (!entry || undoing) return;
    set({ undoStack: undoStack.slice(0, -1), undoing: true });
    try {
      await entry.undo();
    } catch (error) {
      set((s) => ({ undoStack: [...s.undoStack, entry] }));
      throw error;
    } finally {
      set({ undoing: false });
    }
  },
});
