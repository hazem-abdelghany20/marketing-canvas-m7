import { expect, test, type Locator, type Page } from "@playwright/test";
import { demoSession, openCanvas } from "./support";

/**
 * The phone pass (ticket 029): what 015 did for the desktop, done for a phone. Measured in a real browser, on the real
 * board, at the widths phones come in.
 */
const WIDTHS = [320, 360, 375, 390, 430];
const TABS = ["Trace", "Board", "Chat", "Find"] as const;

const bar = (page: Page) => page.getByRole("navigation", { name: "Main" });
const tab = (page: Page, name: string) => bar(page).getByRole("button", { name });
const size = async (el: Locator) => (await el.boundingBox())!;

test.beforeEach(async ({ page }) => {
  await demoSession(page);
});

/** The elements of what is on screen that run past a side of the window, not counting what is meant to be scrolled to. */
async function pastTheEdge(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const root = document.querySelector("[data-phone-shell]")!;
    const out: string[] = [];
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      // Not on screen: another screen, the canvas (it pans), or what is hidden.
      if (el.closest("[inert], [hidden], .react-flow, .sr-only, [aria-hidden=true]")) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      // A row that scrolls sideways is meant to have things past its edge: the next card, peeking.
      let scrolls = false;
      for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") scrolls = true;
      }
      if (scrolls) continue;
      if (box.left < -0.5 || box.right > width + 0.5)
        out.push(`${name(el)} ${Math.round(box.left)}..${Math.round(box.right)}`);
    }
    return out;
  });
}

for (const width of WIDTHS) {
  test(`at ${width}px no screen scrolls the page sideways, and nothing on it runs past an edge`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await openCanvas(page);

    for (const name of TABS) {
      await tab(page, name).tap();
      await page.waitForTimeout(150);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `${name} scrolls sideways`,
      ).toBe(true);
      expect(await pastTheEdge(page), `${name} runs past an edge`).toEqual([]);
    }

    await tab(page, "Add").tap();
    await page.waitForTimeout(400);
    expect(await pastTheEdge(page), "the Add sheet runs past an edge").toEqual([]);
  });
}

test("every control that is tapped to do something is a target a thumb can hit", async ({ page }) => {
  await openCanvas(page);
  const tooSmall: string[] = [];
  const check = async (what: string, els: Locator, min: number) => {
    for (const el of await els.all()) {
      const box = await size(el);
      if (box.width < min - 0.5 || box.height < min - 0.5)
        tooSmall.push(
          `${what}: ${(await el.getAttribute("aria-label")) ?? (await el.textContent())?.trim()} ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }
  };

  await check("tab bar", bar(page).getByRole("button"), 44);

  await tab(page, "Trace").tap();
  await check("Trace card", page.getByRole("region", { name: "Trace" }).locator("[data-trace-card]"), 40);
  await check("Trace undo", page.getByRole("region", { name: "Trace" }).getByRole("button", { name: "Undo" }), 40);

  await tab(page, "Board").tap();
  await check("top bar", page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button"), 40);
  await check("dock", page.getByRole("group", { name: "Whiteboard tools" }).getByRole("button"), 40);

  await tab(page, "Chat").tap();
  const chat = page.getByRole("complementary", { name: "Assistant" });
  await check("chat composer", chat.getByRole("button", { name: /^(Send|Send the board)$/ }), 40);
  await check("reply modes", chat.getByRole("radio"), 28); // a row of four across the width, as tall as a button
  await check("Open board", page.getByRole("button", { name: "Open board" }), 40);

  await tab(page, "Find").tap();
  await check("Find row", page.getByRole("region", { name: "Find" }).locator("ul button"), 44 - 1);
  await check("Find filter", page.getByRole("region", { name: "Find" }).getByRole("radio"), 40);

  expect(tooSmall).toEqual([]);
});

test("the node's sheet gives every button a target a thumb can hit", async ({ page }) => {
  await openCanvas(page, "/node/nd_con_linenstyle");
  const sheet = page.getByRole("complementary", { name: "Node detail" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400);
  const tooSmall: string[] = [];

  for (const el of await sheet.getByRole("button").all()) {
    if (!(await el.isVisible())) continue;
    const box = await size(el);
    if (box.height < 39.5 || box.width < 39.5) {
      tooSmall.push(
        `${(await el.getAttribute("aria-label")) ?? (await el.textContent())?.trim()} ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
    }
  }

  expect(tooSmall).toEqual([]);
});

test("every text field on a phone is at least 16px, so the browser never zooms the page to one", async ({ page }) => {
  await openCanvas(page);
  const tooSmall: string[] = [];
  const fields = async (what: string) => {
    const found = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("input, textarea")]
        .filter(
          (el) =>
            !el.closest("[inert], [hidden]") &&
            el.getBoundingClientRect().width > 0 &&
            (el as HTMLInputElement).type !== "hidden" &&
            (el as HTMLInputElement).type !== "file",
        )
        .map((el) => ({
          label: el.getAttribute("aria-label") ?? el.tagName,
          px: parseFloat(getComputedStyle(el).fontSize),
        })),
    );
    for (const f of found) if (f.px < 16) tooSmall.push(`${what}: ${f.label} ${f.px}px`);
  };

  await tab(page, "Chat").tap();
  await fields("chat");
  await tab(page, "Find").tap();
  await fields("find");

  // On the board: a sticky being written, and a comment thread being started.
  await tab(page, "Board").tap();
  await page.getByRole("group", { name: "Whiteboard tools" }).getByRole("button", { name: "Sticky" }).tap();
  await page.mouse.click(200, 300);
  await expect(page.locator("textarea").first()).toBeVisible();
  await fields("sticky");
  await page.keyboard.press("Escape");
  await page.getByRole("group", { name: "Whiteboard tools" }).getByRole("button", { name: "Comment" }).tap();
  await page.mouse.click(120, 420);
  await expect(page.getByRole("textbox", { name: /comment/i }).first()).toBeVisible();
  await fields("comment");

  expect(tooSmall).toEqual([]);
});

test("a card peeking in at the edge of its row is not dimmed with opacity, which would take its text below 4.5:1", async ({
  page,
}) => {
  await openCanvas(page);

  const opacities = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-trace-card]")].map((el) => getComputedStyle(el).opacity),
  );

  expect(opacities.length).toBeGreaterThan(4);
  expect(new Set(opacities)).toEqual(new Set(["1"]));
});

test.describe("with reduced motion asked for", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("a sheet does not animate as it opens", async ({ page }) => {
    await openCanvas(page);

    await tab(page, "Add").tap();

    const duration = await page
      .getByRole("dialog", { name: "Add to the board" })
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(duration).toBeLessThan(0.05); // seconds: the stylesheet flattens it to a hundredth of a millisecond
  });

  test("a row goes to its card at once, not by gliding there", async ({ page }) => {
    await openCanvas(page);

    const reached = await page.getByRole("button", { name: "Goal 2" }).evaluate(async (dot) => {
      const list = dot.closest("section")!.querySelector("ul")!;
      (dot as HTMLElement).click();
      // Two frames: a glide would still be on its way, an instant move is done.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return list.scrollLeft;
    });

    expect(reached).toBeGreaterThan(100);
  });
});

test.describe("with only a keyboard", () => {
  for (const name of TABS) {
    test(`Tab on ${name} reaches controls in order, with a visible ring, and never one on a screen that is not shown`, async ({
      page,
    }) => {
      await openCanvas(page);
      await tab(page, name).tap();
      await page.waitForTimeout(150);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const seen: Array<{ where: string; ring: string; hidden: boolean }> = [];
      for (let i = 0; i < 70; i++) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          let hidden = Boolean(el.closest("[inert], [hidden]"));
          for (let p: HTMLElement | null = el; p; p = p.parentElement) {
            if (Number(getComputedStyle(p).opacity) === 0) hidden = true;
          }
          const screenEl = el.closest("[data-phone-screen]") as HTMLElement | null;
          return {
            where: screenEl?.dataset.phoneScreen ?? (el.closest("nav") ? "bar" : "elsewhere"),
            ring: getComputedStyle(el).outlineStyle,
            hidden,
            id: `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}`,
          };
        });
        if (!stop) continue;
        seen.push(stop);
      }

      expect(seen.length).toBeGreaterThan(3);
      for (const stop of seen) {
        expect(stop.hidden, "reached something that is not shown").toBe(false);
        expect(["bar", name.toLowerCase()], `reached ${stop.where}`).toContain(stop.where);
        expect(stop.ring, "no focus ring").not.toBe("none");
      }
    });
  }
});

test("a button answers a touch at once: no double-tap delay, and no pull-to-refresh under a drag", async ({ page }) => {
  await openCanvas(page);

  const [touchAction, overscroll] = await page.evaluate(() => [
    getComputedStyle(document.querySelector("nav button")!).touchAction,
    getComputedStyle(document.documentElement).overscrollBehaviorY,
  ]);

  expect(touchAction).toBe("manipulation");
  expect(overscroll).toBe("none");
});

test("the browser's own chrome takes the app's colours: a theme-color for each scheme", async ({ page }) => {
  await page.goto("/");

  const schemes = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((els) => els.map((el) => `${el.getAttribute("media")}|${el.getAttribute("content")}`));

  expect(schemes.sort()).toEqual(["(prefers-color-scheme: dark)|#1b1916", "(prefers-color-scheme: light)|#f2eee7"]);
});
