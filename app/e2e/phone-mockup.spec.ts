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
  // Measured at rest: with the fonts in, and once anything rising into place has arrived.
  await el.evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(node.getAnimations({ subtree: false }).map((a) => a.finished.catch(() => undefined)));
  });
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

test.describe("the Board", () => {
  const tools = (page: Page) => page.getByRole("group", { name: "Whiteboard tools" });
  const topBar = (page: Page) => page.getByRole("toolbar", { name: "Canvas tools" });
  async function showBoard(page: Page) {
    await openCanvas(page);
    await bar(page).getByRole("button", { name: "Board" }).tap();
  }

  test("has the mockup's title pill, Ask about this and a dock of six tools over the bar", async ({ page }) => {
    await showBoard(page);
    const pill = topBar(page).locator("[data-board-title]");
    await expectBox(pill, { x: 12, y: 46, width: 167, height: 42 }, "title pill");
    expect(await css(pill, "border-top-left-radius")).toBe("14px");
    await expectBox(topBar(page).getByRole("button", { name: "Ask about this" }), { x: 187, y: 46, width: 141, height: 42 }, "Ask");
    await expectBox(tools(page), { x: 34, y: 572, width: 272, height: 52 }, "dock");
    expect(await css(tools(page), "border-top-left-radius")).toBe("18px");
    await expect(tools(page).getByRole("button")).toHaveCount(6);
    await expectBox(tools(page).getByRole("button", { name: "Select" }), { x: 39, y: 577, width: 42, height: 42 }, "Select");
  });

  test("keeps what the mockup does not show one tap away: the board's name opens its actions, Text among them", async ({
    page,
  }) => {
    await showBoard(page);
    await topBar(page).getByRole("button", { name: /more/i }).tap();
    const menu = page.getByRole("menu", { name: "Board actions" });
    await menu.getByRole("menuitem", { name: /^Text/ }).tap();
    await expect(page.locator("[data-tool-hint]")).toBeVisible();
  });

  test("with the pen in hand: one row of five inks and the width, and a quiet hint under the title", async ({ page }) => {
    await showBoard(page);
    await tools(page).getByRole("button", { name: "Pen" }).tap();
    const inks = page.locator("[data-ink-options]");
    await expectBox(inks, { x: 57, y: 524, width: 226, height: 40 }, "ink bar");
    await expect(inks.getByRole("radio")).toHaveCount(5);
    await expectBox(inks.getByRole("radio").first(), { x: 70, y: 533, width: 22, height: 22 }, "first ink");
    // The mockup shows "2 px"; the pen starts at the desktop's medium width, 3, which 030 leaves alone.
    await expect(inks.getByRole("button", { name: /width/i })).toHaveText("3 px");
    const hint = page.locator("[data-tool-hint]");
    await expect(hint).toHaveText("One finger draws · two fingers pan and zoom");
    await expectBox(hint, { x: 37, y: 96, width: 267, height: 28 }, "hint");
  });

  test("the width is a tap that steps through the three", async ({ page }) => {
    await showBoard(page);
    await tools(page).getByRole("button", { name: "Pen" }).tap();
    const width = page.locator("[data-ink-options]").getByRole("button", { name: /width/i });
    await width.tap();
    await expect(width).toHaveText("6 px");
    await width.tap();
    await expect(width).toHaveText("2 px");
    await width.tap();
    await expect(width).toHaveText("3 px");
  });
});

test.describe("Chat", () => {
  const chat = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
  async function showChat(page: Page) {
    await openCanvas(page);
    await bar(page).getByRole("button", { name: "Chat" }).tap();
  }

  test("has the mockup's header, board strip, mode chips and composer", async ({ page }) => {
    await showChat(page);
    const title = chat(page).getByRole("heading", { name: "Assistant" });
    await expectBox(title, { x: 18, y: 51, width: 262 }, "title");
    expect(await css(title, "font-size")).toBe("17px");
    expect(await css(title, "font-weight")).toBe("600");
    await expectBox(chat(page).getByRole("button", { name: "Search" }), { x: 288, y: 44, width: 40, height: 40 }, "Search");
    const strip = page.getByRole("region", { name: "Board overview" });
    await expectBox(strip, { x: 12, y: 90, width: 316, height: 140 }, "strip");
    expect(await css(strip, "border-top-left-radius")).toBe("14px");
    await expectBox(page.getByRole("button", { name: "Open board" }), { y: 188, height: 33 }, "Open board");
    const modes = chat(page).getByRole("radiogroup", { name: "Reply mode" });
    await expectBox(modes, { x: 0, y: 230, width: 340, height: 40 }, "mode row");
    const chip = modes.getByRole("radio").first();
    await expectBox(chip, { height: 26 }, "mode chip");
    expect(await css(chip, "border-top-left-radius")).toBe("9999px");
    await expectBox(chat(page).getByRole("button", { name: "Send the board" }), { x: 12, y: 586, width: 42, height: 42 }, "send board");
    await expectBox(chat(page).getByRole("textbox", { name: "Message" }), { x: 62, y: 585, width: 216, height: 43 }, "field");
    await expectBox(chat(page).getByRole("button", { name: "Send", exact: true }), { x: 286, y: 586, width: 42, height: 42 }, "Send");
  });

  test("Search in its header goes to Find", async ({ page }) => {
    await showChat(page);
    await chat(page).getByRole("button", { name: "Search" }).tap();
    await expect(bar(page).getByRole("button", { name: "Find" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("Find", () => {
  const find = (page: Page) => page.getByRole("region", { name: "Find" });
  async function showFind(page: Page) {
    await openCanvas(page);
    await bar(page).getByRole("button", { name: "Find" }).tap();
  }

  test("opens straight on the search box, chips and the index, at the mockup's sizes", async ({ page }) => {
    await showFind(page);
    const box = find(page).locator("[data-search-box]");
    await expectBox(box, { x: 18, y: 48, width: 304, height: 44 }, "search box");
    expect(await css(box, "border-top-left-radius")).toBe("12px");
    const filters = find(page).getByRole("radiogroup", { name: "Type" });
    await expectBox(filters, { x: 18, y: 102, width: 304, height: 28 }, "filters");
    await expectBox(filters.getByRole("radio").first(), { x: 18, width: 49, height: 26 }, "All chip");
    await expect(filters.getByRole("radio")).toHaveText([/^All 16$/, "Goals", "Campaigns", "Content", "Strategies", "Assets", "Notes"]);
    await expectBox(find(page).locator("h2").first(), { x: 18, y: 146, height: 11 }, "GOALS");
    await expectBox(find(page).locator("ul button").first(), { x: 18, y: 157, width: 304, height: 44 }, "first row");
  });

  test("indexes the goals, the content and what reaches no goal, as the mockup does; the rest is a chip away", async ({
    page,
  }) => {
    await showFind(page);
    await expect(find(page).locator("h2")).toHaveText(["Goals", "Content", "Not connected to a goal"]);
    await find(page).getByRole("radio", { name: "Strategies" }).tap();
    await expect(find(page).getByRole("button", { name: /^Vayn ICP/ })).toBeVisible();
  });
});
