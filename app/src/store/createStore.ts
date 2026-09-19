import { createStore } from "zustand/vanilla";
import { createClient } from "../api/client";
import { createEndpoints } from "../api/endpoints";
import { createAnnotationsSlice } from "./annotations";
import { createBoardSlice } from "./board";
import { createChatSlice } from "./chat";
import { createEdgesSlice } from "./edges";
import { createFilesSlice } from "./files";
import { createHistorySlice } from "./history";
import { createMarksSlice } from "./marks";
import { createNodesSlice } from "./nodes";
import { createPinsSlice } from "./pins";
import { createSessionSlice } from "./session";
import { IdAliases, type AppState, type AppStore, type StoreContext } from "./state";
import { createStrokesSlice } from "./strokes";

export interface AppStoreOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Holds the session token and nothing else. */
  storage?: Storage | null;
  /** Called once when the API rejects the token. The app routes to /signin here. */
  onSessionExpired?: () => void;
}

/**
 * A vanilla zustand store: no React in this layer. Components subscribe with
 * zustand's `useStore(appStore, selector)`.
 */
export function createAppStore(options: AppStoreOptions): AppStore {
  // The client needs the store for the token, and the store needs the client.
  // The closures below only read `store` once a request is made, after it exists.
  const client = createClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    getToken: () => store.getState().token,
    onUnauthorized: () => store.getState().expireSession(),
  });

  const ctx: StoreContext = {
    api: createEndpoints(client),
    ids: new IdAliases(),
    storage: options.storage ?? null,
    onSessionExpired: options.onSessionExpired ?? (() => {}),
  };

  const store: AppStore = createStore<AppState>()((...a) => ({
    ...createSessionSlice(ctx)(...a),
    ...createBoardSlice(ctx)(...a),
    ...createNodesSlice(ctx)(...a),
    ...createEdgesSlice(ctx)(...a),
    ...createAnnotationsSlice(ctx)(...a),
    ...createFilesSlice(ctx)(...a),
    ...createStrokesSlice(ctx)(...a),
    ...createMarksSlice(ctx)(...a),
    ...createPinsSlice(ctx)(...a),
    ...createChatSlice(ctx)(...a),
    ...createHistorySlice(ctx)(...a),
  }));
  return store;
}
