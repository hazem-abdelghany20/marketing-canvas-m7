import { createAppStore } from "./createStore";

export { createAppStore, type AppStoreOptions } from "./createStore";
export type { AppState, AppStore } from "./state";
export type { BoardStatus } from "./board";
export type { HistoryEntry } from "./history";

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Until the router is mounted (ticket 003), an expired session falls back to a
// plain navigation. The router replaces this with setSessionExpiredHandler.
let sessionExpiredHandler = () => globalThis.location?.assign("/signin");

export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

/** The app's one store. Tests build their own with createAppStore. */
export const appStore = createAppStore({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  storage: browserStorage(),
  onSessionExpired: () => sessionExpiredHandler(),
});
