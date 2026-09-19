import type { ApiError } from "../api/client";
import type { Board, Viewport } from "../types";
import { record } from "./history";
import { mutate, notFound, toApiError } from "./mutation";
import { byId } from "./records";
import type { AppState, SliceCreator } from "./state";

/** Viewport writes are spaced at least this far apart. */
export const VIEWPORT_WRITE_INTERVAL_MS = 500;

export type BoardStatus = "idle" | "loading" | "ready" | "error";

export interface BoardSlice {
  board: Board | null;
  boardStatus: BoardStatus;
  boardError: ApiError | null;
  /** Set when the last viewport write failed. The camera itself is never rolled back. */
  viewportSaveError: ApiError | null;
  /** Fetches the board and everything on it in one go. The newest call wins. */
  loadBoard: () => Promise<void>;
  /** Moves the camera now; persists it to the API at most once per 500ms. */
  setViewport: (viewport: Viewport) => void;
  /** Sends a pending viewport write immediately, e.g. before the page unloads. */
  flushViewport: () => Promise<void>;
  renameBoard: (name: string) => Promise<Board>;
  /** Drops every cached entity, as on sign-out. */
  resetBoard: () => void;
}

const EMPTY: Pick<
  AppState,
  | "board" | "boardStatus" | "boardError" | "viewportSaveError"
  | "nodes" | "edges" | "annotations" | "files" | "objectUrls" | "strokes" | "marks" | "pins"
  | "chatMessages" | "chatStreaming" | "undoStack"
> = {
  board: null,
  boardStatus: "idle",
  boardError: null,
  viewportSaveError: null,
  nodes: {},
  edges: {},
  annotations: {},
  files: {},
  objectUrls: {},
  strokes: {},
  marks: {},
  pins: {},
  chatMessages: [],
  chatStreaming: false,
  undoStack: [],
};

export const createBoardSlice: SliceCreator<BoardSlice> = (ctx) => (set, get, store) => {
  let latestLoad = 0;

  // The viewport is client state that gets flushed to the API, not a cache entry:
  // it is written through a throttle, never rolled back, and never undone.
  let pendingViewport: Viewport | null = null;
  let viewportTimer: ReturnType<typeof setTimeout> | null = null;

  async function writeViewport() {
    viewportTimer = null;
    const viewport = pendingViewport;
    pendingViewport = null;
    if (!viewport) return;
    try {
      await ctx.api.board.update({ viewport });
      set({ viewportSaveError: null });
    } catch (error) {
      set({ viewportSaveError: toApiError(error) });
    }
  }

  function cancelViewportWrite() {
    if (viewportTimer) clearTimeout(viewportTimer);
    viewportTimer = null;
    pendingViewport = null;
  }

  async function renameBoard(name: string, track: boolean): Promise<Board> {
    const before = get().board;
    if (!before) throw notFound("board");
    const result = await mutate(store, {
      apply: (s) => (s.board ? { board: { ...s.board, name } } : {}),
      request: () => ctx.api.board.update({ name }),
      // Keep the live camera: the reply may predate a viewport write still pending.
      commit: (s, board) => ({ board: { ...board, viewport: s.board?.viewport ?? board.viewport } }),
      rollback: (s) => (s.board ? { board: { ...s.board, name: before.name } } : {}),
    });
    if (track) {
      record(store, { label: "Rename board", undo: async () => void (await renameBoard(before.name, false)) });
    }
    return result;
  }

  return {
    ...EMPTY,

    async loadBoard() {
      const load = ++latestLoad;
      set({ boardStatus: "loading", boardError: null });
      try {
        const { api } = ctx;
        const [board, nodes, edges, files, strokes, marks, pins] = await Promise.all([
          api.board.get(),
          api.nodes.list(),
          api.edges.list(),
          api.files.list(),
          api.strokes.list(),
          api.marks.list(),
          api.pins.list(),
        ]);
        // The API only lists annotations per node.
        const annotations = (await Promise.all(nodes.map((node) => api.annotations.list(node.id)))).flat();
        if (load !== latestLoad) return;
        set({
          board,
          boardStatus: "ready",
          nodes: byId(nodes),
          edges: byId(edges),
          annotations: byId(annotations),
          files: byId(files),
          strokes: byId(strokes),
          marks: byId(marks),
          pins: byId(pins),
          undoStack: [],
        });
      } catch (error) {
        if (load !== latestLoad) return;
        set({ boardStatus: "error", boardError: toApiError(error) });
      }
    },

    setViewport(viewport) {
      set((s) => (s.board ? { board: { ...s.board, viewport } } : {}));
      pendingViewport = viewport;
      viewportTimer ??= setTimeout(() => void writeViewport(), VIEWPORT_WRITE_INTERVAL_MS);
    },

    async flushViewport() {
      if (viewportTimer) clearTimeout(viewportTimer);
      await writeViewport();
    },

    renameBoard: (name) => renameBoard(name, true),

    resetBoard() {
      latestLoad++;
      cancelViewportWrite();
      set(EMPTY);
    },
  };
};
