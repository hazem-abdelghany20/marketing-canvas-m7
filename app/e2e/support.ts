import { expect, request, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import type { CanvasNode, Edge, NodeInput, Viewport } from "../src/types";

export const DEMO = { email: "demo@marketingcanvas.dev", password: "password123" };

/** A signed-in API session, used to arrange a board before the page loads it. */
export interface Session {
  token: string;
  call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<T>;
  nodes(): Promise<CanvasNode[]>;
  edges(): Promise<Edge[]>;
  createNode(input: Partial<NodeInput> & { title: string }): Promise<CanvasNode>;
}

function session(token: string): Session {
  const call = async <T>(method: string, path: string, data?: unknown): Promise<T> => {
    const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const res = await api.fetch(path, { method, data });
    const body = res.status() === 204 ? undefined : await res.json();
    await api.dispose();
    return body as T;
  };
  return {
    token,
    call,
    nodes: () => call<CanvasNode[]>("GET", "/nodes"),
    edges: () => call<Edge[]>("GET", "/edges"),
    createNode: (input) => call<CanvasNode>("POST", "/nodes", { type: "note", x: 0, y: 0, ...input }),
  };
}

/** Resets the API to its seed and signs the page in as the demo account (16 nodes). */
export async function demoSession(page: Page): Promise<Session> {
  const api = await request.newContext({ baseURL: API_URL });
  await api.get("/__reset");
  const { token } = await (await api.post("/auth/login", { data: DEMO })).json();
  await api.dispose();
  await page.addInitScript((t) => localStorage.setItem("mc-session-token", t), token);
  return session(token);
}

/** Signs the page in as a brand-new account, whose board starts empty. */
export async function freshSession(page: Page): Promise<Session> {
  const api = await request.newContext({ baseURL: API_URL });
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { token } = await (await api.post("/auth/signup", { data: { name: "Ada", email, password: "password123" } })).json();
  await api.dispose();
  await page.addInitScript((t) => localStorage.setItem("mc-session-token", t), token);
  return session(token);
}

export async function setViewport(s: Session, viewport: Viewport) {
  await s.call("PATCH", "/board", { viewport });
}

export async function openCanvas(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
  return page.locator("[data-canvas-state=ready]");
}

/** A node card on the canvas, by the node's id. */
export function card(page: Page, id: string) {
  return page.locator(`[data-node-card="${id}"]`);
}
