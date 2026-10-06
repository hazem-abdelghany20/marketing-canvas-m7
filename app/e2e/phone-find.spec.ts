import { expect, test, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const find = (page: Page) => page.getByRole("region", { name: "Find" });
const field = (page: Page) => find(page).getByRole("searchbox", { name: "Find a node" });
const trace = (page: Page) => page.getByRole("region", { name: "Trace" });
const row = (page: Page, title: string) => find(page).getByRole("button", { name: new RegExp(`^${title}`) });

test.beforeEach(async ({ page }) => {
  await demoSession(page);
  await openCanvas(page);
  await tab(page, "Find").tap();
  await expect(field(page)).toBeVisible();
});

test("lists the nodes by type, with what no goal is above last, and fits the screen", async ({ page }) => {
  const headings = await find(page).getByRole("heading", { level: 2 }).allTextContents();
  expect(headings).toEqual(["Goals", "Strategies", "Campaigns", "Content", "Not connected to a goal"]);

  const width = page.viewportSize()!.width;
  const box = (await find(page).getByRole("radiogroup", { name: "Type" }).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the field is 16px, so the browser does not zoom the page when it takes focus", async ({ page }) => {
  expect(await field(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
});

test("the type filters sit in one row that scrolls sideways, never the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const filters = find(page).getByRole("radiogroup", { name: "Type" });

  const [scrolls, rows] = await filters.evaluate((el) => [el.scrollWidth > el.clientWidth, new Set([...el.children].map((c) => (c as HTMLElement).offsetTop)).size]);

  expect(scrolls).toBe(true);
  expect(rows).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("choosing a piece of content lines Trace up on its whole chain", async ({ page }) => {
  await row(page, "Email: Ramadan lookbook drop").tap();

  await expect(tab(page, "Trace")).toHaveAttribute("aria-current", "page");
  await expect(trace(page).getByRole("button", { name: /^Email: Ramadan lookbook drop, / })).toHaveAttribute("aria-current", "true");
  await expect(trace(page).getByRole("group", { name: "Strategy, 2 of 2" })).toBeVisible();
  await expect(trace(page).getByRole("group", { name: "Goal, 1 of 2" })).toBeVisible();
});

test("choosing the other goal shows Trace on that goal, with its row scrolled into place", async ({ page }) => {
  await row(page, "Mental Diet: 1,000 course completions by December").tap();

  await expect(trace(page).getByRole("group", { name: "Goal, 2 of 2" })).toBeVisible();
  await expect.poll(() => trace(page).getByRole("group", { name: "Goal, 2 of 2" }).getByRole("list").evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
});

test("typing narrows to matches, and Enter takes the first to Trace", async ({ page }) => {
  await field(page).fill("ramadan");

  await expect(find(page).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(row(page, "Vayn Ramadan push")).toBeVisible();
  await expect(row(page, "Email: Ramadan lookbook drop")).toBeVisible();

  await field(page).press("Enter");

  await expect(tab(page, "Trace")).toHaveAttribute("aria-current", "page");
  await expect(trace(page).getByRole("button", { name: /^Vayn Ramadan push, / })).toHaveAttribute("aria-current", "true");
});

test("a node no goal is above opens its detail instead", async ({ page }) => {
  await row(page, "IG reach down 30% since the algo change").tap();

  await expect(page).toHaveURL(/\/node\/nd_not_reach$/);
  await expect(page.getByRole("complementary", { name: "Node detail" })).toBeVisible();
});

test("a type filter lists every node of it, and rows are targets a thumb can hit", async ({ page }) => {
  await find(page).getByRole("radio", { name: "Content" }).tap();

  const rows = find(page).getByRole("button", { name: /(Reel|Carousel|Email):/ });
  await expect(rows).toHaveCount(4);
  for (const el of await rows.all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("text that matches nothing offers a note with that title", async ({ page }) => {
  await field(page).fill("a thought nobody has had");

  await expect(find(page).getByText("No nodes match “a thought nobody has had”.")).toBeVisible();
  await find(page).getByRole("button", { name: "Create a note with this title" }).tap();

  await expect(page).toHaveURL(/\/node\/nd_/);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("a thought nobody has had");
});
