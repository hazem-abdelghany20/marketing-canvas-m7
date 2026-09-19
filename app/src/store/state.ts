import type { StateCreator, StoreApi } from "zustand/vanilla";
import type { Endpoints } from "../api/endpoints";
import type { AnnotationsSlice } from "./annotations";
import type { BoardSlice } from "./board";
import type { ChatSlice } from "./chat";
import type { EdgesSlice } from "./edges";
import type { FilesSlice } from "./files";
import type { HistorySlice } from "./history";
import type { MarksSlice } from "./marks";
import type { NodesSlice } from "./nodes";
import type { PinsSlice } from "./pins";
import type { SessionSlice } from "./session";
import type { StrokesSlice } from "./strokes";

export type AppState = SessionSlice &
  BoardSlice &
  NodesSlice &
  EdgesSlice &
  AnnotationsSlice &
  FilesSlice &
  StrokesSlice &
  MarksSlice &
  PinsSlice &
  ChatSlice &
  HistorySlice;

export type AppStore = StoreApi<AppState>;

/** What every slice gets besides zustand's set/get: the API and shared bookkeeping. */
export interface StoreContext {
  api: Endpoints;
  ids: IdAliases;
  storage: Storage | null;
  onSessionExpired: () => void;
}

export type SliceCreator<T> = (ctx: StoreContext) => StateCreator<AppState, [], [], T>;

/**
 * Undoing a delete re-creates the entity, and the API hands back a new id. Older
 * history entries still hold the old one; they resolve it through here.
 */
export class IdAliases {
  private readonly next = new Map<string, string>();

  alias(from: string, to: string): void {
    if (from !== to) this.next.set(from, to);
  }

  resolve(id: string): string {
    let current = id;
    const seen = new Set<string>();
    while (this.next.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.next.get(current)!;
    }
    return current;
  }
}
