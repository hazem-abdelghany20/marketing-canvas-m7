import { expect, test, type Locator, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

const trace = (page: Page) => page.getByRole("region", { name: "Trace" });
const row = (page: Page, name: string) => trace(page).getByRole("group", { name });
const card = (page: Page, title: string) => trace(page).getByRole("button", { name: new RegExp(`^${title}, `) });

/** A real finger: a touch scroll gesture along a row, which the browser snaps the way it would for a person. */
async function swipe(page: Page, on: Locator, dx: number) {
  const box = (await on.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.synthesizeScrollGesture", {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    // Positive is a finger moving right, which brings the previous card back; a finger moving left brings the next.
    xDistance: dx,
    yDistance: 0,
    gestureSourceType: "touch",
    speed: 900,
  });
}

test.beforeEach(async ({ page }) => {
  await demoSession(page);
  await openCanvas(page);
});

test("opens on the first goal, with a row under it for each layer, and the next card peeking in at the edge", async ({ page }) => {
  await expect(row(page, "Goal, 1 of 2")).toBeVisible();
  await expect(row(page, "Strategy, 1 of 2")).toBeVisible();
  await expect(row(page, "Campaign, 1 of 1")).toBeVisible();
  await expect(row(page, "Content, 1 of 2")).toBeVisible();
  await expect(card(page, "Vayn: 500 orders/month by Q4")).toHaveAttribute("aria-current", "true");

  // The next goal is partly on screen, which is how a row says it can be swiped.
  const width = page.viewportSize()!.width;
  const next = (await card(page, "Mental Diet: 1,000 course completions by December").boundingBox())!;
  expect(next.x).toBeLessThan(width - 16);
  expect(next.x).toBeGreaterThan(width / 2);
});

test("swiping the goal row to the next goal redraws every row under it", async ({ page }) => {
  await swipe(page, row(page, "Goal, 1 of 2").getByRole("list"), -260);

  await expect(row(page, "Goal, 2 of 2")).toBeVisible();
  await expect(card(page, "Mental Diet: 1,000 course completions by December")).toHaveAttribute("aria-current", "true");
  await expect(card(page, "Mental Diet voice: clinician, not coach")).toBeVisible();
  await expect(card(page, "Reel: the 2am hunger loop")).toBeVisible();
  await expect(card(page, "Vayn ICP: 25-34 urban women")).toHaveCount(0);
});

test("swiping a lower row redraws only what is under it, and swiping back restores it", async ({ page }) => {
  await swipe(page, row(page, "Strategy, 1 of 2").getByRole("list"), -260);

  await expect(row(page, "Strategy, 2 of 2")).toBeVisible();
  await expect(card(page, "Vayn Ramadan push")).toBeVisible();
  await expect(card(page, "Email: Ramadan lookbook drop")).toBeVisible();
  await expect(row(page, "Goal, 1 of 2")).toBeVisible(); // the goal above is where it was

  await swipe(page, row(page, "Strategy, 2 of 2").getByRole("list"), 260);

  await expect(row(page, "Strategy, 1 of 2")).toBeVisible();
  await expect(card(page, "Vayn linen drop - September")).toBeVisible();
});

test("a dot goes straight to its card", async ({ page }) => {
  await trace(page).getByRole("button", { name: "Goal 2" }).tap();

  await expect(row(page, "Goal, 2 of 2")).toBeVisible();
  await expect(card(page, "Mental Diet: 1,000 course completions by December")).toHaveAttribute("aria-current", "true");
  // And the row has actually moved, not only said so.
  const track = row(page, "Goal, 2 of 2").getByRole("list");
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
});

test("tapping the card on screen opens its detail as a sheet over the bar", async ({ page }) => {
  await card(page, "Vayn ICP: 25-34 urban women").tap();

  await expect(page).toHaveURL(/\/node\/nd_str_icp$/);
  await expect(page.getByRole("complementary", { name: "Node detail" })).toBeVisible();
});

test("tapping a card that is peeking in brings it on screen, and opens nothing", async ({ page }) => {
  await card(page, "Vayn positioning: quiet luxury, not fast fashion").tap();

  await expect(row(page, "Strategy, 2 of 2")).toBeVisible();
  await expect(page).not.toHaveURL(/\/node\//);
});

test("the rows scroll up and down when they do not all fit, and the page itself does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 520 });
  const last = row(page, "Content, 1 of 2");

  await last.scrollIntoViewIfNeeded();

  await expect(last).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("remembers the chain across a reload in the same tab", async ({ page }) => {
  await trace(page).getByRole("button", { name: "Goal 2" }).tap();
  await expect(row(page, "Goal, 2 of 2")).toBeVisible();

  await page.reload();
  await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();

  await expect(card(page, "Mental Diet: 1,000 course completions by December")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => row(page, "Goal, 2 of 2").getByRole("list").evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
});
