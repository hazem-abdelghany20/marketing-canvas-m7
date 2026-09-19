import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, freshSession, openCanvas, setViewport } from "./support";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Search nodes" });
const input = (page: Page) => page.getByRole("combobox", { name: "Search nodes by title or body" });

async function camera(page: Page) {
  const transform = await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
  const m = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/)!;
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

/** Two animation frames: enough for an instant camera move to have been painted. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.beforeEach(async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

test("Cmd/Ctrl+F opens search with the input focused", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
});

test("typing matches titles and bodies in any case, with no submit", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");
  await input(page).fill("LINEN");

  const results = dialog(page).getByRole("option");
  await expect(results.filter({ hasText: "Reel: 3 ways to style linen" })).toHaveCount(1);
  await expect(results.filter({ hasText: "Vayn linen drop - September" })).toHaveCount(1);

  await input(page).fill("dr walaa");
  // Only in bodies: "Dr Walaa speaks as a doctor…", "Dr Walaa on camera…"
  await expect(results).toHaveCount(2);
});

test("↓ then Enter pans and zooms to the highlighted node and selects it", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");
  await input(page).fill("2am hunger");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(async () => (await camera(page)).zoom).toBe(1.25);
  const target = card(page, "nd_con_2am");
  await expect(target).toHaveAttribute("aria-pressed", "true");

  const box = (await target.boundingBox())!;
  const view = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(4);
  expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(4);
});

test("a query matching nothing shows the empty state, and Enter goes nowhere", async ({ page }) => {
  await openCanvas(page);
  const before = await camera(page);
  await page.keyboard.press("ControlOrMeta+f");
  await input(page).fill("podcast");

  await expect(dialog(page)).toContainText('No nodes match "podcast".');
  await expect(dialog(page).getByRole("button", { name: "Create a note with this title" })).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toBeVisible();
  expect(await camera(page)).toEqual(before);
});

test("with an empty query the five most recently updated nodes are listed under Recent", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");

  const recent = dialog(page).getByRole("listbox", { name: "Recent" });
  await expect(recent).toBeVisible();
  await expect(recent.getByRole("option")).toHaveCount(5);
});

test("on a board with no nodes, search is non-interactive and says why", async ({ page }) => {
  await freshSession(page);
  await openCanvas(page);

  const search = page.getByRole("toolbar").getByRole("button", { name: "Search" });
  await expect(search).toHaveAttribute("aria-disabled", "true");
  await expect(search).toHaveAttribute("title", "Nothing to search yet.");
});

test("with reduced motion the pan to a node is instant", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");
  await input(page).fill("2am hunger");
  await page.keyboard.press("Enter");

  await nextFrames(page);
  const first = await camera(page);
  await page.waitForTimeout(600);
  expect(first).toEqual(await camera(page));
  expect(first.zoom).toBe(1.25);
});
