import type { RecordedCall } from "../../api/__tests__/helpers";
import { apiError, json } from "../../api/__tests__/helpers";
import { createAppStore, type AppStoreOptions } from "../createStore";
import type { Annotation, Board, CanvasNode, Edge, FileRef, Mark, Pin, Stroke } from "../../types";

export type Handler = (call: RecordedCall, params: Record<string, string>) => Response | Promise<Response>;

/**
 * A fetch stub routed by "METHOD /path/:param". Unknown routes answer 404 the way
 * the real API does. Handlers can be swapped mid-test with `on()`.
 */
export function fakeBackend(initial: Record<string, Handler> = {}) {
  const routes = new Map(Object.entries(initial));
  const calls: RecordedCall[] = [];

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: RecordedCall = {
      url: url.toString(),
      method,
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    for (const [key, handler] of routes) {
      const [routeMethod, pattern] = key.split(" ") as [string, string];
      if (routeMethod !== method) continue;
      const params = match(pattern, url.pathname);
      if (params) return handler(call, params);
    }
    return apiError(404, "route_not_found", `No route for ${method} ${url.pathname}`);
  }) as typeof globalThis.fetch;

  return {
    fetch,
    calls,
    on(route: string, handler: Handler) {
      routes.set(route, handler);
    },
    /** Calls matching "METHOD /path" exactly (decoded path). */
    callsTo(route: string) {
      const [method, target] = route.split(" ");
      return calls.filter((c) => c.method === method && decodeURIComponent(new URL(c.url).pathname) === target);
    },
  };
}

function match(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const g = got[i]!;
    if (w.startsWith(":")) params[w.slice(1)] = decodeURIComponent(g);
    else if (w !== g) return null;
  }
  return params;
}

export function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/** A promise you settle from the test, for holding a request in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// ------------------------------------------------------------------- fixtures

const T = "2026-09-01T00:00:00.000Z";

export const fixtures = {
  board: { id: "bd_1", name: "Vayn", viewport: { x: 10, y: 20, zoom: 1 } } satisfies Board,
  nodes: [
    { id: "nd_goal", type: "goal", title: "500 orders", body: "", fileIds: [], x: 0, y: 0, createdAt: T, updatedAt: T },
    { id: "nd_camp", type: "campaign", title: "Ramadan push", body: "b", fileIds: ["fl_1"], x: 100, y: 0, createdAt: T, updatedAt: T },
    { id: "nd_reel", type: "content", title: "Reel", body: "", fileIds: [], x: 200, y: 0, createdAt: T, updatedAt: T },
  ] satisfies CanvasNode[],
  edges: [
    { id: "ed_1", fromId: "nd_camp", toId: "nd_goal", kind: "serves", label: null },
    { id: "ed_2", fromId: "nd_reel", toId: "nd_camp", kind: "serves", label: "hook" },
  ] satisfies Edge[],
  annotations: {
    nd_goal: [],
    nd_camp: [{ id: "an_1", nodeId: "nd_camp", body: "Check stock", createdAt: T }],
    nd_reel: [],
  } as Record<string, Annotation[]>,
  files: [{ id: "fl_1", name: "lookbook.pdf", mime: "application/pdf", sizeBytes: 10, thumbUrl: null, createdAt: T }] satisfies FileRef[],
  strokes: [{ id: "st_1", tool: "pen", color: "c", width: 3, points: [0, 0, 5, 5], createdAt: T }] satisfies Stroke[],
  marks: [{ id: "mk_1", variant: "sticky", x: 1, y: 2, body: "hi", color: null, createdAt: T, updatedAt: T }] satisfies Mark[],
  pins: [{ id: "pn_1", x: 5, y: 5, resolved: false, createdAt: T, comments: [] }] satisfies Pin[],
};

/** Routes that answer a full board load from the fixtures. */
export function seededRoutes(): Record<string, Handler> {
  return {
    "GET /board": () => json(200, fixtures.board),
    "GET /nodes": () => json(200, fixtures.nodes),
    "GET /edges": () => json(200, fixtures.edges),
    "GET /files": () => json(200, fixtures.files),
    "GET /strokes": () => json(200, fixtures.strokes),
    "GET /marks": () => json(200, fixtures.marks),
    "GET /pins": () => json(200, fixtures.pins),
    "GET /nodes/:id/annotations": (_c, p) => json(200, fixtures.annotations[p.id!] ?? []),
  };
}

export function makeStore(routes: Record<string, Handler> = seededRoutes(), options: Partial<AppStoreOptions> = {}) {
  const backend = fakeBackend(routes);
  const storage = options.storage ?? memoryStorage({ "mc-session-token": "tok_1" });
  const store = createAppStore({
    baseUrl: "http://api.test",
    fetch: backend.fetch,
    storage,
    onSessionExpired: () => {},
    ...options,
  });
  return { store, backend, storage };
}

export async function loadedStore(routes?: Record<string, Handler>, options?: Partial<AppStoreOptions>) {
  const made = makeStore(routes, options);
  await made.store.getState().loadBoard();
  return made;
}
