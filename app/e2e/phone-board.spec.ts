import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, openCanvas, setViewport, type Session } from "./support";

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const dock = (page: Page) => page.getByRole("group", { name: "Whiteboard tools" });
const tool = (page: Page, name: string) => dock(page).getByRole("button", { name });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Canvas tools" });
const strokes = (page: Page) => page.locator("[data-stroke-id]");
const camera = (page: Page) =>
  page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);

let s: Session;
test.beforeEach(async ({ page }) => {
  s = await demoSession(page);
  await setViewport(s, { x: 20, y: 60, zoom: 0.4 });
  await openCanvas(page);
  await tab(page, "Board").tap();
  await expect(dock(page)).toBeVisible();
});

/**
 * Real fingers, through the browser's own touch input, since a mouse cannot be two of them. One session for the whole
 * gesture: the browser keeps which fingers are down in it. Each event lists every finger that is down.
 */
async function fingers(page: Page) {
  const client = await page.context().newCDPSession(page);
  return (type: "touchStart" | "touchMove" | "touchEnd", points: Array<[number, number, number]> = []) =>
    client.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
}

// 030: the dock is the mockup's six, 42px each; Text is in the board's menu (see phone-mockup.spec.ts).
test("the dock is one row of six tools above the tab bar", async ({ page }) => {
  const boxes = [];
  for (const name of ["Select", "Pen", "Highlighter", "Eraser", "Sticky", "Comment"]) {
    boxes.push((await tool(page, name).boundingBox())!);
  }
  const barBox = (await bar(page).boundingBox())!;
  const dockBox = (await dock(page).boundingBox())!;

  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1); // one row
  await expect(tool(page, "Text")).toHaveCount(0);
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(barBox.y);
  expect(dockBox.x).toBeGreaterThanOrEqual(0);
  expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("fits a 320px screen: the dock and the top bar stay inside it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });

  for (const el of [dock(page), toolbar(page)]) {
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

test("the top bar has the board's name, Undo, More and Ask about this", async ({ page }) => {
  await expect(toolbar(page).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "More" })).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Ask about this" })).toBeVisible();
  const box = (await toolbar(page).boundingBox())!;
  expect(box.y).toBeLessThan(40);
});

test("the Pen opens its colours and widths above the dock, with a hint written for a finger", async ({ page }) => {
  await tool(page, "Pen").tap();

  const options = page.locator("[data-ink-options]");
  await expect(options).toBeVisible();
  // It rises into place as it appears: look where it settles.
  await expect
    .poll(async () => {
      const optionsBox = (await options.boundingBox())!;
      const dockBox = (await dock(page).boundingBox())!;
      return optionsBox.y + optionsBox.height <= dockBox.y;
    })
    .toBe(true);
  await expect(page.locator("[data-tool-hint]")).toContainText("One finger draws · two fingers pan and zoom");

  // The mockup's hint is only a hint (030): Select in the dock puts the pen away.
  await tool(page, "Select").tap();
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-tool-hint]")).toHaveCount(0);
});

test("one finger draws a stroke that is saved", async ({ page }) => {
  await tool(page, "Pen").tap();
  const before = await strokes(page).count();

  const finger = await fingers(page);
  await finger("touchStart", [[120, 300, 1]]);
  for (let i = 1; i <= 8; i++) await finger("touchMove", [[120 + i * 18, 300 + i * 6, 1]]);
  await finger("touchEnd");

  await expect(strokes(page)).toHaveCount(before + 1);
  await expect.poll(async () => (await s.call<unknown[]>("GET", "/strokes")).length).toBe(before + 1);
});

test("two fingers pan and zoom the board with the Pen in hand, and the stroke the first finger began is thrown away", async ({
  page,
}) => {
  await tool(page, "Pen").tap();
  const strokesBefore = await strokes(page).count();
  const cameraBefore = await camera(page);

  const finger = await fingers(page);
  await finger("touchStart", [[150, 300, 1]]);
  await finger("touchMove", [[160, 310, 1]]);
  // The second finger lands: the first's stroke is dropped, and the two move the board.
  await finger("touchStart", [
    [160, 310, 1],
    [260, 310, 2],
  ]);
  await finger("touchMove", [
    [120, 330, 1],
    [300, 330, 2],
  ]);
  await finger("touchEnd");

  await expect.poll(() => camera(page)).not.toBe(cameraBefore);
  await expect(strokes(page)).toHaveCount(strokesBefore);
  await expect(page.locator("[data-live-stroke]")).toHaveCount(0);
  expect((await s.call<unknown[]>("GET", "/strokes")).length).toBe(strokesBefore);
});

test("More offers Connect, Text, Auto-arrange, Fit to screen, Save as PNG and Clear ink, and Fit moves the camera", async ({
  page,
}) => {
  await toolbar(page).getByRole("button", { name: "More" }).tap();
  const menu = page.getByRole("menu", { name: "Board actions" });
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  const before = await camera(page);

  await menu.getByRole("menuitem", { name: /^Fit to screen/ }).tap();

  await expect(menu).toBeHidden();
  await expect.poll(() => camera(page)).not.toBe(before);
});

test("connecting from the menu: pick two cards, and the kind picker asks what they are", async ({ page }) => {
  // The phone opens the board on the goal at 100% (030); fit it first, so both cards are on screen.
  await toolbar(page).getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: /^Fit to screen/ }).tap();
  await toolbar(page).getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: /^Connect/ }).tap();
  await expect(page.locator("[data-connect-banner]")).toBeVisible();
  const banner = (await page.locator("[data-connect-banner]").boundingBox())!;
  const top = (await toolbar(page).boundingBox())!;
  expect(banner.y).toBeGreaterThanOrEqual(top.y + top.height - 1); // under the bar, not on it

  // Two cards that are on screen at this zoom.
  await card(page, "nd_not_reach").tap();
  await card(page, "nd_goal_vayn").tap();

  await expect(page.getByRole("dialog", { name: "Connection kind" })).toBeVisible();
});

test("connect mode started from another tab brings the Board forward", async ({ page }) => {
  await tab(page, "Trace").tap();
  await page
    .getByRole("region", { name: "Trace" })
    .getByRole("button", { name: /^Vayn ICP/ })
    .tap(); // the card on screen opens its detail
  await expect(page.getByRole("complementary", { name: "Node detail" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).tap(); // it opens as a summary (030); connecting is the editor's

  await page.getByRole("button", { name: "+ Connect" }).tap();

  await expect(tab(page, "Board")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-connect-banner]")).toBeVisible();
});

test("a toast stands above the dock, not under it", async ({ page }) => {
  await toolbar(page).getByRole("button", { name: "More" }).tap();
  await page.getByRole("menuitem", { name: /^Auto-arrange/ }).tap();

  const toast = page.getByRole("status").filter({ hasText: /Arranged \d+ nodes/ });
  await expect(toast).toBeVisible();
  const toastBox = (await toast.boundingBox())!;
  const dockBox = (await dock(page).boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(dockBox.y);
});

test("Ask about this sends the board and shows the Chat tab with a reply on its way", async ({ page }) => {
  await toolbar(page).getByRole("button", { name: "Ask about this" }).tap();

  await expect(tab(page, "Chat")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Read my markup on the board.")).toBeVisible();
});

test("a camera left by a wider screen is brought back to the cards the first time the Board is shown", async ({
  page,
}) => {
  await setViewport(s, { x: -9000, y: -9000, zoom: 1 });
  await page.reload();
  await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();

  await tab(page, "Board").tap();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const view = window.innerHeight;
        return [...document.querySelectorAll<HTMLElement>("[data-node-card]")].some((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < view && r.right > 0 && r.left < window.innerWidth;
        });
      }),
    )
    .toBe(true);
});
