/**
 * A window of a given width, for code that asks `matchMedia`. jsdom ships none. This one understands
 * `(max-width: Npx)` and answers false to every other query, which is all the app asks of it.
 * Resizing re-reads the width and tells everything that subscribed, as a real browser does.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let width = Number.POSITIVE_INFINITY;

function matches(query: string): boolean {
  const max = /max-width:\s*(\d+)px/.exec(query);
  return max ? width <= Number(max[1]) : false;
}

export function stubViewport(next: number) {
  width = next;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** The window is resized: every query is read again and its subscribers are told. */
export function resizeViewport(next: number) {
  width = next;
  for (const listener of [...listeners]) listener();
}

export function unstubViewport() {
  listeners.clear();
  width = Number.POSITIVE_INFINITY;
  // @ts-expect-error jsdom ships no matchMedia; the stub is removed to match.
  delete window.matchMedia;
}
