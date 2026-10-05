import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, openCanvas, setViewport, type Session } from "./support";

const panel = (page: Page) => page.getByRole("complementary", { name: "Node detail" });
const peek = (page: Page) => page.getByRole("dialog", { name: /^Quick look/ });

let s: Session;
test.beforeEach(async ({ page }) => {
  s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

/** Presses Tab until `done` is true for the focused element, up to `limit` times. */
async function tabUntil(page: Page, done: (el: Element) => boolean, limit = 80) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(`(${done.toString()})(document.activeElement)`)) return;
  }
  throw new Error(`Tab did not reach it in ${limit} presses`);
}

test("a card is selected with Space, which shows its quick-peek; Escape dismisses it", async ({ page }) => {
  await openCanvas(page);
  await tabUntil(page, (el) => (el as HTMLElement).dataset.nodeCard === "nd_goal_vayn");

  await page.keyboard.press("Space");
  await expect(card(page, "nd_goal_vayn")).toHaveAttribute("aria-pressed", "true");
  await expect(peek(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(peek(page)).toHaveCount(0);
  await expect(card(page, "nd_goal_vayn")).not.toHaveAttribute("aria-pressed", "true");
});

test("a node can be deleted and brought back without touching the pointer", async ({ page }) => {
  await openCanvas(page);
  const before = (await s.nodes()).length;
  await tabUntil(page, (el) => (el as HTMLElement).dataset.nodeCard === "nd_not_price");

  await page.keyboard.press("Space");
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await s.nodes()).length).toBe(before - 1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await s.nodes()).length).toBe(before);
});

test("two nodes can be connected from the keyboard alone, kind picker included", async ({ page }) => {
  await openCanvas(page);
  const before = (await s.edges()).length;
  await tabUntil(page, (el) => (el as HTMLElement).dataset.nodeCard === "nd_not_reach");
  await page.keyboard.press("c");
  await expect(page.locator("[data-connect-banner]")).toContainText("Pick the node to connect from");

  await page.keyboard.press("Enter"); // the focused card is the source
  await expect(page.locator("[data-connect-banner]")).toContainText("Now pick the node it connects to");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter"); // the previous card is the target
  const picker = page.getByRole("dialog", { name: "Connection kind" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /^serves/ })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect.poll(async () => (await s.edges()).length).toBe(before + 1);
  await expect(page.locator("[data-connect-banner]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/); // nothing was opened by those Enters
});

test("opening a node with Enter moves focus into its panel, and Escape returns it to the card", async ({ page }) => {
  await openCanvas(page);
  await tabUntil(page, (el) => (el as HTMLElement).dataset.nodeCard === "nd_str_icp");

  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.querySelector("[data-node-detail]")!.contains(document.activeElement)))
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(card(page, "nd_str_icp")).toBeFocused();
});

test("Escape in a remove confirmation cancels it without closing the panel, and focus stays on the control", async ({
  page,
}) => {
  await openCanvas(page, "/node/nd_str_icp");
  const remove = panel(page).getByRole("button", { name: "Remove connection to Vayn: 500 orders/month by Q4" });
  await remove.click();
  await expect(panel(page).getByRole("button", { name: "Remove", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(panel(page)).toBeVisible();
  await expect(remove).toBeFocused();
});

test("the highlighted search result is visibly marked, not just shaded", async ({ page }) => {
  await openCanvas(page);
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByRole("combobox", { name: "Search nodes by title or body" }).fill("linen");
  await page.keyboard.press("ArrowDown");

  const active = page.getByRole("option", { selected: true });
  await expect(active).toHaveCount(1);
  const marked = await active.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
  });
  expect(marked).toBe(true);
  const unmarked = page.getByRole("option", { selected: false }).first();
  expect(await unmarked.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
});

test("a focused card that is off screen is brought into view, so its focus ring can be seen", async ({ page }) => {
  await setViewport(s, { x: 0, y: 0, zoom: 1 }); // the last cards sit well below the 720px of canvas
  await openCanvas(page);
  const area = (await page.locator("[data-canvas-state=ready]").boundingBox())!;
  expect((await card(page, "nd_not_reach").boundingBox())!.y).toBeGreaterThan(area.y + area.height);

  await tabUntil(page, (el) => (el as HTMLElement).dataset.nodeCard === "nd_not_reach");

  await expect
    .poll(async () => {
      const box = (await card(page, "nd_not_reach").boundingBox())!;
      return box.y + box.height <= area.y + area.height && box.y >= area.y;
    })
    .toBe(true);
});

test("every stop of the first screenful shows a focus ring of at least 2px", async ({ page }) => {
  await openCanvas(page);
  const failures: string[] = [];

  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName,
        tag: el.tagName,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      };
    });
    if (!stop) continue;
    if (stop.outlineStyle === "none" || stop.outlineWidth < 2)
      failures.push(`${stop.tag} "${stop.name}" ${stop.outlineStyle} ${stop.outlineWidth}px`);
  }

  expect(failures).toEqual([]);
});
