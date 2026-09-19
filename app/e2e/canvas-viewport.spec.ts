import { expect, request, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";

const DEMO = { email: "demo@marketingcanvas.dev", password: "password123" };

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

let token = "";

test.beforeEach(async ({ page }) => {
  const api = await request.newContext({ baseURL: API_URL });
  await api.get("/__reset");
  token = (await (await api.post("/auth/login", { data: DEMO })).json()).token;
  await api.dispose();
  await page.addInitScript((t) => localStorage.setItem("mc-session-token", t), token);
});

async function apiCall<T>(method: "GET" | "PATCH", path: string, data?: unknown): Promise<T> {
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const res = method === "GET" ? await api.get(path) : await api.patch(path, { data });
  const body = (await res.json()) as T;
  await api.dispose();
  return body;
}

/** Reads the camera straight off React Flow's transform. */
async function viewport(page: Page): Promise<Viewport> {
  const transform = await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
  const m = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
  if (!m) throw new Error(`unexpected transform: ${transform}`);
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

async function openCanvas(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
  return page.locator("[data-canvas-state=ready]");
}

test("restores the stored viewport on load", async ({ page }) => {
  await apiCall("PATCH", "/board", { viewport: { x: 120, y: -40, zoom: 1.5 } });

  await openCanvas(page);

  expect(await viewport(page)).toEqual({ x: 120, y: -40, zoom: 1.5 });
});

test("dragging empty space pans and creates nothing", async ({ page }) => {
  const canvas = await openCanvas(page);
  const box = (await canvas.boundingBox())!;
  const before = await viewport(page);
  const nodesBefore = (await apiCall<unknown[]>("GET", "/nodes")).length;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 10 });
  await page.mouse.up();

  const after = await viewport(page);
  expect(after.x - before.x).toBeCloseTo(150, 0);
  expect(after.y - before.y).toBeCloseTo(80, 0);
  expect(after.zoom).toBe(before.zoom);
  expect((await apiCall<unknown[]>("GET", "/nodes")).length).toBe(nodesBefore);
});

test("scroll zoom clamps at 2x and at 0.25x", async ({ page }) => {
  const canvas = await openCanvas(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -600);
  await expect.poll(async () => (await viewport(page)).zoom).toBe(2);

  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await viewport(page)).zoom).toBe(0.25);
});

test("a settled viewport persists through the API and survives a reload", async ({ page }) => {
  const canvas = await openCanvas(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 260, { steps: 8 });
  await page.mouse.up();
  const moved = await viewport(page);

  await expect.poll(async () => (await apiCall<{ viewport: Viewport }>("GET", "/board")).viewport).toEqual(moved);

  await page.reload();
  await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
  expect(await viewport(page)).toEqual(moved);
});

test("while hydrating: dimmed grid, loading indicator, and no layout shift when data lands", async ({ page }) => {
  await page.route(`${API_URL}/board`, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/");

  const loading = page.locator("[data-canvas-state=loading]");
  await expect(loading).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading your board" })).toBeVisible();
  expect(Number(await loading.evaluate((el) => getComputedStyle(el.querySelector("[data-grid]")!).opacity))).toBeLessThan(1);
  const before = await loading.boundingBox();

  const ready = page.locator("[data-canvas-state=ready]");
  await expect(ready).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading your board" })).toHaveCount(0);
  expect(await ready.boundingBox()).toEqual(before);
});
