import { useSyncExternalStore } from "react";

/** The rail, the detail panel and the toolbar change shape below this width (docs/spec.md § S3). */
export const NARROW_QUERY = "(max-width: 899px)";

/** False where the browser can't say, as in jsdom: a wide screen is the default. */
export function isNarrow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(NARROW_QUERY).matches
    : false;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the window is narrower than 900px right now, and re-renders when that changes. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false);
}
