import { expect, test, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const strip = (page: Page) => page.getByRole("region", { name: "Board overview" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });

test.beforeEach(async ({ page }) => {
  await demoSession(page);
  await openCanvas(page);
  await tab(page, "Chat").tap();
  await expect(composer(page)).toBeVisible();
});

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).tap();
  await expect(page.locator("[data-chat-message=assistant][data-status=done]")).toHaveCount(1, { timeout: 15_000 });
}

test("shows the strip, the reply modes and a composer, all inside the screen", async ({ page }) => {
  const width = page.viewportSize()!.width;
  for (const el of [strip(page), page.getByRole("radiogroup", { name: "Reply mode" }), composer(page)]) {
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await expect(strip(page)).toHaveAttribute("data-strip-mode", "overview");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the field is 16px, so the browser does not zoom the page when it takes focus", async ({ page }) => {
  const size = await composer(page).evaluate((el) => getComputedStyle(el).fontSize);

  expect(size).toBe("16px");
});

test("Enter adds a line and sends nothing: Send is how a message goes", async ({ page }) => {
  await composer(page).fill("first line");
  await composer(page).press("Enter");
  await composer(page).type("second line");

  await expect(composer(page)).toHaveValue("first line\nsecond line");
  await expect(page.locator("[data-chat-message]")).toHaveCount(0);
});

test("the field grows with what is written, up to a few lines", async ({ page }) => {
  const before = (await composer(page).boundingBox())!.height;

  await composer(page).fill("one\ntwo\nthree");
  const grown = (await composer(page).boundingBox())!.height;
  await composer(page).fill("1\n2\n3\n4\n5\n6\n7\n8\n9\n10");
  const capped = (await composer(page).boundingBox())!.height;

  expect(grown).toBeGreaterThan(before);
  expect(capped).toBeLessThan(grown * 3); // a few lines, then it scrolls
});

test("a reply that cites nodes fills the strip with them, and Open board takes you to them", async ({ page }) => {
  await ask(page, "What serves the Ramadan push?");

  await expect(strip(page)).toHaveAttribute("data-strip-mode", "cited");
  await expect(strip(page).getByText(/\d+ cited/)).toBeVisible();
  const chip = strip(page).getByRole("button", { name: /^Vayn Ramadan push/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-cited", "true");

  await strip(page).getByRole("button", { name: "Open board" }).tap();

  await expect(tab(page, "Board")).toHaveAttribute("aria-current", "page");
  const inView = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-node-card="nd_cmp_ramadan"]')!;
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
  });
  expect(inView).toBe(true);
});

test("tapping a chip in the strip opens that node's detail", async ({ page }) => {
  await ask(page, "What serves the Ramadan push?");

  await strip(page).getByRole("button", { name: /^Vayn Ramadan push/ }).tap();

  await expect(page).toHaveURL(/\/node\/nd_cmp_ramadan$/);
  await expect(page.getByRole("complementary", { name: "Node detail" })).toBeVisible();
});

test("a citation chip in the reply shows the Board tab, with that node on screen", async ({ page }) => {
  await ask(page, "What serves the Ramadan push?");

  await page.getByRole("list", { name: "Cited nodes" }).getByRole("button", { name: /Vayn Ramadan push/ }).tap();

  await expect(tab(page, "Board")).toHaveAttribute("aria-current", "page");
});

test("the board button sends the board, and the reply comes in on this screen", async ({ page }) => {
  await page.getByRole("button", { name: "Send the board" }).tap();

  await expect(tab(page, "Chat")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Read my markup on the board.")).toBeVisible();
});

test("with little height left, as with the keyboard open, the strip steps aside and the composer is still in reach", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 420 });

  await expect(strip(page)).toBeHidden();
  const box = (await composer(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(420);
  expect(box.y).toBeGreaterThan(0);
});
