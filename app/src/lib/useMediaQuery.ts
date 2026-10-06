import { useSyncExternalStore } from "react";

/** The rail, the detail panel and the toolbar change shape below this width (docs/spec.md § S3). */
export const NARROW_QUERY = "(max-width: 899px)";

/**
 * Below this the workspace is a phone's: four screens and a tab bar instead of a canvas with panels over it
 * (docs/spec.md § P1). Between this and 900px is the tablet layout, which is the narrow one above and nothing more.
 */
export const PHONE_QUERY = "(max-width: 639px)";

/** False where the browser can't say, as in jsdom: a wide screen is the default. */
function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

export const isNarrow = (): boolean => matches(NARROW_QUERY);
export const isPhone = (): boolean => matches(PHONE_QUERY);

const subscribeNarrow = subscribeTo(NARROW_QUERY);
const subscribePhone = subscribeTo(PHONE_QUERY);

/** Whether the window is narrower than 900px right now, and re-renders when that changes. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
}

/** Whether the window is narrower than 640px right now, and re-renders when that changes. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribePhone, isPhone, () => false);
}
