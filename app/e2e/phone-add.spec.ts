import { expect, test, type Locator, type Page } from "@playwright/test";
import { demoSession, freshSession, openCanvas, type Session } from "./support";

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add to the board" });
const detail = (page: Page) => page.getByRole("complementary", { name: "Node detail" });
const trace = (page: Page) => page.getByRole("region", { name: "Trace" });

/** A sheet rises into place as it opens: wait until it has stopped, then measure it. */
async function settled(locator: Locator) {
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await locator.boundingBox());
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
}

/** One finger down, along a path, and up: through the browser's own touch input. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from[0], y: from[1], id: 1 }],
  });
  for (let i = 1; i <= 8; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 8;
    const y = from[1] + ((to[1] - from[1]) * i) / 8;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("the Add tab", () => {
  let s: Session;
  test.beforeEach(async ({ page }) => {
    s = await demoSession(page);
    await openCanvas(page);
    await tab(page, "Add").tap();
    await expect(sheet(page)).toBeVisible();
  });

  test("opens a sheet from the bottom edge, over the bar, with a scrim behind it", async ({ page }) => {
    const { width, height } = page.viewportSize()!;
    await settled(sheet(page));
    const box = (await sheet(page).boundingBox())!;

    expect(box.x).toBe(0);
    expect(box.width).toBe(width);
    expect(Math.round(box.y + box.height)).toBe(height);
    expect(box.y).toBeGreaterThan(height * 0.2); // a sheet, not a screen
    const barBox = (await bar(page).boundingBox())!;
    const covered = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest("[role=dialog]") !== null,
      [barBox.x + barBox.width / 2, barBox.y + barBox.height / 2],
    );
    expect(covered).toBe(true);
    await expect(page.locator("[data-sheet-scrim]")).toBeVisible();
  });

  test("gives every choice a target a thumb can hit", async ({ page }) => {
    for (const button of await sheet(page).getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.height, (await button.textContent()) ?? "").toBeGreaterThanOrEqual(40);
    }
  });

  test("makes a goal from Goal, and opens it with its title ready to be typed", async ({ page }) => {
    const before = (await s.nodes()).length;

    await sheet(page).getByRole("button", { name: /^Goal/ }).tap();

    await expect(page).toHaveURL(/\/node\/nd_/);
    const title = detail(page).getByRole("textbox", { name: "Title" });
    await expect(title).toBeFocused();
    await page.keyboard.type("Repeat orders to 30%");
    await expect.poll(async () => (await s.nodes()).find((n) => n.title === "Repeat orders to 30%")?.type).toBe("goal");
    expect((await s.nodes()).length).toBe(before + 1);
  });

  test("goes away when the handle is dragged down, and makes nothing", async ({ page }) => {
    const before = (await s.nodes()).length;
    await settled(sheet(page));
    const handle = (await sheet(page).locator("[data-sheet-handle]").boundingBox())!;

    await drag(
      page,
      [handle.x + handle.width / 2, handle.y + handle.height / 2],
      [handle.x + handle.width / 2, handle.y + 260],
    );

    await expect(sheet(page)).toBeHidden();
    expect((await s.nodes()).length).toBe(before);
  });

  test("goes away on a tap outside it, and the Add tab has the focus again", async ({ page }) => {
    await page.locator("[data-sheet-scrim]").tap({ position: { x: 20, y: 40 } });

    await expect(sheet(page)).toBeHidden();
    await expect(tab(page, "Add")).toBeFocused();
  });

  // Drafting with the assistant is the Chat tab's on a phone (030): the mockup's sheet has no room for it.
});

test.describe("what serves a card", () => {
  test("an empty row adds a node that serves the card above, and opens it to be named", async ({ page }) => {
    const s = await freshSession(page);
    const goal = await s.createNode({ type: "goal", title: "Grow repeat orders", x: 100, y: 100 });
    await openCanvas(page);
    await expect(trace(page).getByRole("group", { name: "Strategy, empty" })).toBeVisible();

    await trace(page).getByRole("button", { name: "Add a strategy" }).tap();

    await expect(page).toHaveURL(/\/node\/nd_/);
    const title = detail(page).getByRole("textbox", { name: "Title" });
    await expect(title).toBeFocused();
    await page.keyboard.type("Gift sets for her");

    // On the server: a strategy, joined so that it serves the goal.
    await expect
      .poll(async () => {
        const made = (await s.nodes()).find((n) => n.title === "Gift sets for her");
        const edges = await s.edges();
        return made ? edges.some((e) => e.fromId === made.id && e.toId === goal.id && e.kind === "serves") : false;
      })
      .toBe(true);

    await page.keyboard.press("Escape"); // leaves the field
    await page.keyboard.press("Escape"); // closes the sheet
    await expect(detail(page)).toBeHidden();
    await expect(trace(page).getByRole("group", { name: "Strategy, 1 of 1" })).toBeVisible();
    await expect(trace(page).getByRole("button", { name: "Gift sets for her, Strategy" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

test.describe("a node's detail as a sheet", () => {
  test.beforeEach(async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await trace(page)
      .getByRole("button", { name: /^Vayn ICP/ })
      .tap();
    await expect(detail(page)).toBeVisible();
  });

  test("rises from the bottom edge, over the bar and the screen, never taller than 92% of it", async ({ page }) => {
    const { width, height } = page.viewportSize()!;
    await settled(detail(page));
    const box = (await detail(page).boundingBox())!;

    expect(box.x).toBe(0);
    expect(box.width).toBe(width);
    expect(Math.round(box.y + box.height)).toBe(height);
    expect(box.height).toBeLessThanOrEqual(height * 0.92 + 1);
    await expect(page.locator("[data-sheet-scrim]")).toBeVisible();
  });

  test("goes away when its handle is dragged down, and the address goes back", async ({ page }) => {
    await settled(detail(page));
    const handle = (await detail(page).locator("[data-sheet-handle]").boundingBox())!;

    await drag(
      page,
      [handle.x + handle.width / 2, handle.y + handle.height / 2],
      [handle.x + handle.width / 2, handle.y + 300],
    );

    await expect(detail(page)).toBeHidden();
    await expect(page).not.toHaveURL(/\/node\//);
  });

  test("goes away on a tap on the scrim, and on the browser's Back", async ({ page }) => {
    await page.locator("[data-sheet-scrim]").tap({ position: { x: 20, y: 20 } });
    await expect(detail(page)).toBeHidden();

    await trace(page)
      .getByRole("button", { name: /^Vayn ICP/ })
      .tap();
    await expect(detail(page)).toBeVisible();
    await page.goBack();
    await expect(detail(page)).toBeHidden();
  });

  test("Show on board shows the Board with that node selected and in view", async ({ page }) => {
    await detail(page).getByRole("button", { name: "Show on board" }).tap();

    await expect(tab(page, "Board")).toHaveAttribute("aria-current", "page");
    await expect(detail(page)).toBeHidden();
    await expect(page.getByRole("dialog", { name: /^Quick look: Vayn ICP/ })).toBeVisible();
    const inView = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>('[data-node-card="nd_str_icp"]')!.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
    });
    expect(inView).toBe(true);
  });

  test("Ask about it shows the assistant with a question about the node waiting in the composer", async ({ page }) => {
    await detail(page).getByRole("button", { name: "Ask about it" }).tap();

    await expect(tab(page, "Chat")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(
      "Tell me about “Vayn ICP: 25-34 urban women”.",
    );
    await expect(page.locator("[data-chat-message]")).toHaveCount(0);
  });

  test("keeps its fields at 16px, so the browser does not zoom the page to one", async ({ page }) => {
    await detail(page).getByRole("button", { name: "Edit" }).tap(); // it opens as a summary (030)
    for (const name of ["Title", "Description", "New annotation"]) {
      const size = await detail(page)
        .getByRole("textbox", { name })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, name).toBeGreaterThanOrEqual(16);
    }
  });
});
