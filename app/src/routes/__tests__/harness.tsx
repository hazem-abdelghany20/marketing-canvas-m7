import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "../../App";
import { appStore } from "../../store";
import { apiError, json, type RecordedCall } from "../../api/__tests__/helpers";

export { apiError, json };

type Handler = (call: RecordedCall) => Response | Promise<Response>;

/**
 * Replaces the network for every client in the app (auth and store alike),
 * answering by "METHOD /path". Must be installed before the app modules load,
 * so each test file calls it from vi.hoisted via `installNetwork`.
 */
export const network = {
  routes: new Map<string, Handler>(),
  calls: [] as RecordedCall[],
  reset() {
    this.routes.clear();
    this.calls.length = 0;
  },
  on(route: string, handler: Handler) {
    this.routes.set(route, handler);
  },
  callsTo(route: string) {
    const [method, p] = route.split(" ");
    return this.calls.filter((c) => c.method === method && new URL(c.url).pathname === p);
  },
};

globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
  network.calls.push(call);
  const handler = network.routes.get(`${method} ${url.pathname}`);
  return handler ? handler(call) : apiError(404, "route_not_found");
}) as typeof fetch;

export const user = { id: "us_1", name: "Ada", email: "ada@example.com", avatarUrl: null };
export const emptyBoard = { id: "bd_1", name: "Ada's board", viewport: { x: 0, y: 0, zoom: 1 } };

/** The requests a board load makes, answering with an empty board. */
export function serveEmptyBoard() {
  network.on("GET /board", () => json(200, emptyBoard));
  for (const p of ["/nodes", "/edges", "/files", "/strokes", "/marks", "/pins"]) {
    network.on(`GET ${p}`, () => json(200, []));
  }
}

export function resetApp() {
  network.reset();
  localStorage.clear();
  appStore.getState().resetBoard();
  appStore.setState({ token: null, user: null });
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(<RouterProvider router={router} />);
  return { router, ...utils };
}

/** Renders and waits until the screen at `path` has painted its heading. */
export async function openAt(path: string) {
  const rendered = renderAt(path);
  await screen.findByRole("heading", { level: 1 });
  return rendered;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
