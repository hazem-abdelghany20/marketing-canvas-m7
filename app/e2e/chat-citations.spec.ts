import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, openCanvas, setViewport } from "./support";

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const chips = (page: Page) => page.getByRole("list", { name: "Cited nodes" }).getByRole("button");
const cited = (page: Page) => page.locator("[data-node-card][data-cited]");

async function camera(page: Page) {
  const transform = await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
  const m = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/)!;
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

/** The mock librarian answers this by citing the three nodes that mention it. */
async function askLibrarian(page: Page) {
  await composer(page).fill("What serves the Ramadan push?");
  await composer(page).press("Enter");
  await expect(chips(page).first()).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");
}

test.beforeEach(async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

test("the cited nodes are marked on the canvas, in words, and match the chips", async ({ page }) => {
  await openCanvas(page);

  await askLibrarian(page);

  const titles = await chips(page).allInnerTexts();
  expect(titles).toHaveLength(3);
  await expect(cited(page)).toHaveCount(3);
  for (const title of titles) {
    await expect(cited(page).filter({ hasText: title })).toHaveCount(1);
    // Said to a screen reader too, through the card's name.
    await expect(cited(page).filter({ hasText: title })).toHaveAttribute("aria-label", /, cited in chat$/);
  }
  // Not by colour alone: the card itself carries the word.
  await expect(cited(page).first()).toContainText("Cited");
});

test("selecting a different node clears the marks; selecting a cited one keeps them", async ({ page }) => {
  await openCanvas(page);
  await askLibrarian(page);
  const markedIds = await cited(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.nodeCard!));

  await card(page, markedIds[0]!).click();
  await expect(cited(page)).toHaveCount(3);

  await card(page, "nd_goal_md").click();
  await expect(cited(page)).toHaveCount(0);
});

test("a chip pans the canvas to its node and selects it, and the other cited nodes stay marked", async ({ page }) => {
  await openCanvas(page);
  await askLibrarian(page);
  const before = await camera(page);
  const last = chips(page).last();
  const title = await last.innerText();

  await last.click();

  await expect.poll(async () => (await camera(page)).x).not.toBe(before.x);
  const target = cited(page).filter({ hasText: title });
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(cited(page)).toHaveCount(3);
  await expect(last).toBeFocused();
  // It landed in view, beside the rail, not behind it.
  const area = (await page.locator("[data-canvas-state=ready]").boundingBox())!;
  await expect
    .poll(async () => {
      const box = (await target.boundingBox())!;
      return box.x >= area.x && box.x + box.width <= area.x + area.width && box.y >= area.y;
    })
    .toBe(true);
});

test("a chip is reachable and operable from the keyboard, named by its node's title", async ({ page }) => {
  await openCanvas(page);
  await askLibrarian(page);
  const title = await chips(page).first().innerText();

  await chips(page).first().focus();
  await expect(page.getByRole("button", { name: title, exact: true }).first()).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(cited(page).filter({ hasText: title })).toHaveAttribute("aria-pressed", "true");
});

test("when a cited node is deleted its chip goes and the others stay", async ({ page }) => {
  await openCanvas(page);
  await askLibrarian(page);
  const title = await chips(page).first().innerText();
  const [first] = await cited(page)
    .filter({ hasText: title })
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.nodeCard!));

  await card(page, first!).click();
  await page.keyboard.press("Delete");

  await expect(chips(page)).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Cited nodes" })).not.toContainText(title);
});

/**
 * Clicks the first chip from inside the page, then reads the camera on the next frame and
 * again once things have settled, so no round trip to the test runner falls in between.
 */
async function firstFrameAfterChip(page: Page) {
  return page.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")!;
    const chip = document.querySelector<HTMLElement>('[aria-label="Cited nodes"] button')!;
    const before = viewport.style.transform;
    chip.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const first = viewport.style.transform;
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { before, first, final: viewport.style.transform };
  });
}

test("with motion allowed the camera is still travelling on the first frame (so the reduced-motion test below can fail)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openCanvas(page);
  await askLibrarian(page);

  const frames = await firstFrameAfterChip(page);

  expect(frames.final).not.toBe(frames.before);
  expect(frames.first).not.toBe(frames.final);
});

test("with reduced motion the camera is already at the node on the first frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCanvas(page);
  await askLibrarian(page);

  const frames = await firstFrameAfterChip(page);

  expect(frames.final).not.toBe(frames.before);
  expect(frames.first).toBe(frames.final);
});
