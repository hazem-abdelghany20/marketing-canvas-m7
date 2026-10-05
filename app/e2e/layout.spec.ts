import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, openCanvas, setViewport, type Session } from "./support";

const WIDTHS = [320, 375, 768, 899, 900, 1100, 1280];

let s: Session;
test.beforeEach(async ({ page }) => {
  s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

const area = (page: Page) => page.locator("[data-canvas-state=ready]");

async function within(page: Page, selector: string) {
  const outer = (await area(page).boundingBox())!;
  const box = (await page.locator(selector).first().boundingBox())!;
  return (
    box.x >= outer.x - 0.5 &&
    box.y >= outer.y - 0.5 &&
    box.x + box.width <= outer.x + outer.width + 0.5 &&
    box.y + box.height <= outer.y + outer.height + 0.5
  );
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of WIDTHS) {
  test(`at ${width}px the toolbar stays inside the canvas and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openCanvas(page);

    expect(await within(page, "[role=toolbar]")).toBe(true);
    // Every control can be reached: none is clipped off the edge.
    for (const button of await page.getByRole("toolbar").getByRole("button").all()) {
      const outer = (await area(page).boundingBox())!;
      const box = (await button.boundingBox())!;
      expect(box.x, (await button.getAttribute("aria-label")) ?? "").toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
    }
    expect(await noSideScroll(page)).toBe(true);
  });

  test(`at ${width}px the connect banner sits clear of the toolbar, inside the canvas`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openCanvas(page);

    await page.keyboard.press("l");
    await expect(page.locator("[data-connect-banner]")).toBeVisible();

    expect(await within(page, "[data-connect-banner]")).toBe(true);
    const toolbar = (await page.getByRole("toolbar").boundingBox())!;
    const banner = (await page.locator("[data-connect-banner]").boundingBox())!;
    const overlap =
      banner.x < toolbar.x + toolbar.width &&
      banner.x + banner.width > toolbar.x &&
      banner.y < toolbar.y + toolbar.height &&
      banner.y + banner.height > toolbar.y;
    expect(overlap).toBe(false);
  });
}

test("with the detail panel open the toolbar stays left of it, and inside the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openCanvas(page, "/node/nd_goal_vayn");

  const toolbar = (await page.getByRole("toolbar").boundingBox())!;
  const panelBox = (await page.getByRole("complementary", { name: "Node detail" }).boundingBox())!;
  const outer = (await area(page).boundingBox())!;

  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(panelBox.x + 0.5);
  expect(toolbar.x).toBeGreaterThanOrEqual(outer.x - 0.5);
});

test("a quick-peek beside a node at the edge of a narrow canvas stays inside it", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 }); // 640px of canvas beside the rail
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  await openCanvas(page);

  await card(page, "nd_str_pos").click();

  await expect(page.getByRole("dialog", { name: /^Quick look/ })).toBeVisible();
  expect(await within(page, "[role=dialog][aria-label^='Quick look']")).toBe(true);
});

test("a toast appears over the canvas, not over the chat rail's Send button", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openCanvas(page);

  await card(page, "nd_not_reach").click();
  await page.keyboard.press("Delete");
  await expect(page.getByText("Node deleted.")).toBeVisible();

  const toast = (await page.getByRole("status").filter({ hasText: "Node deleted." }).boundingBox())!;
  const outer = (await area(page).boundingBox())!;
  expect(toast.x).toBeGreaterThanOrEqual(outer.x - 0.5);
});
