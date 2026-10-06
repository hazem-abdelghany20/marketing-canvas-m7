import { expect, test, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const NAMES = ["Trace", "Board", "Chat", "Find", "Add"];

test.beforeEach(async ({ page }) => {
  await demoSession(page);
});

test("a bar offers Trace, Board, Chat, Find and Add, with Chat raised in the middle", async ({ page }) => {
  await openCanvas(page);

  await expect(bar(page).getByRole("button")).toHaveText(NAMES);
  const boxes = [];
  for (const name of NAMES) boxes.push((await tab(page, name).boundingBox())!);

  // Five equal columns: Chat is dead centre.
  const width = page.viewportSize()!.width;
  expect(Math.abs(boxes[2]!.x + boxes[2]!.width / 2 - width / 2)).toBeLessThan(2);
  // And it stands above the rest: its disc starts higher than any other tab.
  const disc = (await page.locator("[data-raised] [data-disc]").boundingBox())!;
  expect(disc.y).toBeLessThan(boxes[0]!.y);
});

for (const width of [320, 375, 390, 430]) {
  test(`at ${width}px the page does not scroll sideways, and the bar sits along the bottom edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openCanvas(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = (await bar(page).boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(width);
    expect(Math.round(box.y + box.height)).toBe(800);
    for (const name of NAMES) {
      const tabBox = (await tab(page, name).boundingBox())!;
      expect(tabBox.x).toBeGreaterThanOrEqual(0);
      expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(width);
      expect(tabBox.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test("asks the browser for the whole screen, so the bar can clear the home indicator itself", async ({ page }) => {
  await page.goto("/");

  const content = await page.locator('meta[name="viewport"]').getAttribute("content");

  expect(content).toContain("viewport-fit=cover");
  expect(content).not.toMatch(/maximum-scale|user-scalable=no/); // pinch-zoom of the page stays the reader's
});

test("shows one screen at a time: the canvas is out of sight until Board is chosen", async ({ page }) => {
  await openCanvas(page);
  await expect(page.locator(".react-flow")).toBeHidden();

  await tab(page, "Board").tap();
  await expect(page.locator(".react-flow")).toBeVisible();

  await tab(page, "Chat").tap();
  await expect(page.locator(".react-flow")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
});

test("keeps the board where it was while another tab is shown", async ({ page }) => {
  await openCanvas(page);
  await tab(page, "Board").tap();
  const camera = () => page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
  const before = await camera();

  await tab(page, "Chat").tap();
  await tab(page, "Find").tap();
  await tab(page, "Board").tap();

  expect(await camera()).toBe(before);
});

test("opens a node's detail over the bar, and the screen underneath stays as it was", async ({ page }) => {
  await openCanvas(page, "/node/nd_goal_vayn");
  const detail = page.getByRole("complementary", { name: "Node detail" });
  await expect(detail).toBeVisible();

  const box = (await bar(page).boundingBox())!;
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  const covered = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-node-detail]") !== null,
    centre,
  );
  expect(covered).toBe(true);

  await detail.getByRole("button", { name: "Close" }).tap();
  await expect(detail).toBeHidden();
  await expect(tab(page, "Trace")).toHaveAttribute("aria-current", "page");
});

test("asking for the assistant from the Add menu shows Chat with the composer focused", async ({ page }) => {
  await openCanvas(page);

  await tab(page, "Add").tap();
  await page.getByRole("menuitem", { name: /^From chat/ }).tap();

  await expect(tab(page, "Chat")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox", { name: "Message" })).toBeFocused();
});
