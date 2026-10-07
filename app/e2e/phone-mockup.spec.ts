import { expect, test, type Locator, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

/**
 * Ticket 030 — the phone layout, held to design/mobile-direction.html to the pixel. The mockup's screen is 340x720 and
 * draws a 40px status bar and a 24px home indicator; a phone gives the app the same room through its safe-area insets,
 * so the page is given those insets here. Every number below is read off the mockup in that frame.
 */
const SCREEN = { width: 340, height: 720 };
const INSETS = { top: 40, bottom: 24, left: 0, right: 0 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function asPhone(page: Page) {
  await page.setViewportSize(SCREEN);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
}

/** Where an element sits, to the pixel, against where the mockup puts it. */
async function expectBox(el: Locator, want: Partial<Box>, what: string) {
  const box = (await el.boundingBox())!;
  expect(box, `${what} is on screen`).not.toBeNull();
  const got: Record<string, number> = {};
  const exp: Record<string, number> = {};
  for (const key of Object.keys(want) as Array<keyof Box>) {
    got[key] = Math.round(box[key]);
    exp[key] = want[key]!;
  }
  for (const key of Object.keys(exp)) {
    expect(Math.abs(got[key]! - exp[key]!), `${what}: ${key} is ${got[key]}, the mockup has ${exp[key]}`).toBeLessThanOrEqual(1);
  }
}

const css = (el: Locator, prop: string) => el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p), prop);
const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${n})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const trace = (page: Page) => page.getByRole("region", { name: "Trace" });
const row = (page: Page, depth: number) => trace(page).locator(`[data-trace-row="${depth}"]`);
const onScreen = (page: Page, depth: number) => row(page, depth).locator("[data-trace-card][aria-current=true]");

test.beforeEach(async ({ page }) => {
  await asPhone(page);
  await demoSession(page);
});

test.describe("the tab bar", () => {
  test("is 82px tall, home indicator included, with the Chat disc standing 15px above it", async ({ page }) => {
    await openCanvas(page);
    await expectBox(bar(page), { x: 0, y: 638, width: 340, height: 82 }, "tab bar");
    await expectBox(page.locator("[data-disc]"), { x: 143, y: 623, width: 54, height: 54 }, "Chat disc");
    // Labels at 11px, the icons 18px, the way the mockup draws its own set.
    const trace = bar(page).getByRole("button", { name: "Trace" });
    expect(await css(trace, "font-size")).toBe("11px");
    await expectBox(trace.locator("svg"), { width: 18, height: 18 }, "Trace icon");
  });

  test("marks the tab shown with an accent icon and a semibold label", async ({ page }) => {
    await openCanvas(page);
    const shown = bar(page).getByRole("button", { name: "Trace" });
    expect(await css(shown, "font-weight")).toBe("600");
    expect(await css(shown.locator("svg"), "color")).toBe(await cssVar(page, "--accent"));
  });
});

test.describe("Trace", () => {
  test("lays its header and four rows where the mockup does", async ({ page }) => {
    await openCanvas(page);
    await expectBox(trace(page).locator("h1"), { x: 18, y: 49, width: 262, height: 30 }, "Trace title");
    await expectBox(trace(page).getByRole("button", { name: "Undo" }), { x: 288, y: 44, width: 40, height: 40 }, "Undo");
    await expectBox(row(page, 0).locator("h2"), { x: 18, y: 92, height: 11 }, "GOAL label");
    await expectBox(row(page, 0).getByRole("button", { name: "Goal 1" }).locator("span"), { x: 294, y: 94, width: 16, height: 7 }, "active dot");
    await expectBox(onScreen(page, 0), { x: 16, y: 109, width: 264, height: 147 }, "goal card");
    await expectBox(onScreen(page, 1), { x: 16, y: 297, width: 264, height: 139 }, "strategy card");
    await expectBox(onScreen(page, 2), { x: 16, y: 478, width: 308, height: 93 }, "campaign card");
    await expectBox(onScreen(page, 3), { x: 16, y: 612, width: 264, height: 93 }, "content card");
  });

  test("keeps a card's summary to one line below the goal, and stretches a row's cards to its tallest", async ({
    page,
  }) => {
    await openCanvas(page);
    const sub = onScreen(page, 1).locator("[data-card-body]");
    expect(await css(sub, "-webkit-line-clamp")).toBe("1");
    const cards = row(page, 1).locator("[data-trace-card]");
    const [a, b] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
    expect(a.height).toBe(b.height);
  });

  test("colours a row by its layer: the label's weight, the dot, the card's border and the served-by line", async ({
    page,
  }) => {
    await openCanvas(page);
    expect(await css(row(page, 0).locator("h2"), "font-weight")).toBe("500");
    const goal = await cssVar(page, "--node-goal");
    expect(await css(row(page, 0).getByRole("button", { name: "Goal 1" }).locator("span"), "background-color")).toBe(goal);
    // The card on screen takes 55% of its layer's colour into its border; the ones peeking in are faded to half.
    expect(await css(onScreen(page, 0), "border-top-color")).not.toBe(await cssVar(page, "--border-subtle"));
    expect(await css(row(page, 0).locator("[data-trace-card]:not([aria-current])").first(), "opacity")).toBe("0.5");
    const strategy = await cssVar(page, "--node-strategy");
    expect(await css(row(page, 1).locator("[data-served-by]"), "border-left-color")).toBe(strategy);
  });

  test("ends with the swipe hint", async ({ page }) => {
    await openCanvas(page);
    await expect(trace(page).getByText("Swipe any row to change everything under it")).toBeAttached();
  });
});

test.describe("a node's sheet", () => {
  const sheet = (page: Page) => page.getByRole("complementary", { name: "Node detail" });
  async function openLinenDrop(page: Page) {
    await openCanvas(page);
    await onScreen(page, 2).tap();
    await expect(sheet(page)).toBeVisible();
    await page.waitForTimeout(400); // the sheet's rise
  }

  test("opens as the mockup's half sheet: a summary over the bar, not the editor", async ({ page }) => {
    await openLinenDrop(page);
    await expectBox(sheet(page), { x: 0, y: 302, width: 340, height: 418 }, "sheet");
    await expectBox(sheet(page).locator("[data-sheet-handle] > span"), { x: 151, y: 310, width: 38, height: 4 }, "grab");
    await expectBox(sheet(page).getByRole("button", { name: "Close" }), { x: 280, y: 322, width: 40, height: 40 }, "Close");
    const title = sheet(page).getByRole("heading", { name: "Vayn linen drop - September" });
    await expectBox(title, { x: 20, y: 370, width: 300, height: 24 }, "title");
    expect(await css(title, "font-size")).toBe("19px");
    await expect(sheet(page).getByText("Campaign", { exact: true })).toHaveCSS("text-transform", "uppercase");
    await expect(sheet(page).getByRole("textbox")).toHaveCount(0);
    await expectBox(sheet(page).getByRole("button", { name: "Show on board" }), { x: 20, y: 656, width: 123, height: 36 }, "Show on board");
  });

  test("lists what it serves, what serves it and what it relates to, each a row that opens that node", async ({ page }) => {
    await openLinenDrop(page);
    await expect(sheet(page).getByText("Serves", { exact: true })).toBeVisible();
    await expect(sheet(page).getByText("Served by · 2")).toBeVisible();
    await sheet(page).getByRole("button", { name: /^Vayn ICP: 25-34 urban women/ }).tap();
    await expect(sheet(page).getByRole("heading", { name: "Vayn ICP: 25-34 urban women" })).toBeVisible();
  });

  test("Edit, or pulling the handle up, opens the full editor", async ({ page }) => {
    await openLinenDrop(page);
    await sheet(page).getByRole("button", { name: "Edit" }).tap();
    await expect(sheet(page).getByRole("textbox", { name: "Title" })).toHaveValue("Vayn linen drop - September");

    await page.goto("/");
    await openLinenDrop(page);
    const handle = (await sheet(page).locator("[data-sheet-handle]").boundingBox())!;
    const x = handle.x + handle.width / 2;
    await page.mouse.move(x, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(x, handle.y - 120, { steps: 6 });
    await page.mouse.up();
    await expect(sheet(page).getByRole("textbox", { name: "Title" })).toBeVisible();
  });
});
