import { expect, test, type Page } from "@playwright/test";
import type { Mark } from "../src/types";
import { API_URL } from "../playwright.config";
import { demoSession, freshSession, openCanvas, setViewport } from "./support";

const area = (page: Page) => page.locator("[data-canvas-state=ready]");
const apiMarks = (s: { call<T>(m: "GET", p: string): Promise<T> }) => s.call<Mark[]>("GET", "/marks");
const mark = (page: Page, id: string) => page.locator(`[data-mark-id="${id}"]`);
const FAIL = '{"error":{"code":"forced_failure","message":"x"}}';

async function clickCanvas(page: Page, x: number, y: number) {
  const box = (await area(page).boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
}

test.describe("dropping marks", () => {
  test("a sticky takes typing at once, and is saved when it is left", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 120, y: 80, zoom: 1.5 });
    await openCanvas(page);
    await page.keyboard.press("s");
    await clickCanvas(page, 400, 300);

    // No second click: the sticky already has the keyboard.
    await page.keyboard.type("Reshoot the hook");
    await expect(page.locator("[data-mark-id] textarea")).toHaveValue("Reshoot the hook");
    expect(await apiMarks(s)).toHaveLength(0);
    await page.keyboard.press("Escape");

    await expect.poll(async () => (await apiMarks(s)).length).toBe(1);
    const [saved] = await apiMarks(s);
    expect(saved).toMatchObject({ variant: "sticky", body: "Reshoot the hook" });
    // Screen (400, 300) on a camera panned (120, 80) at 1.5x is board (186.7, 146.7).
    expect(saved!.x).toBeCloseTo((400 - 120) / 1.5, 0);
    expect(saved!.y).toBeCloseTo((300 - 80) / 1.5, 0);
    await expect(page.locator("[data-mark-pending]")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  });

  test("board text is saved as text, with no card behind it", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.keyboard.press("t");
    await clickCanvas(page, 400, 300);

    await page.keyboard.type("Q4 plan");
    await page.keyboard.press("Escape");

    await expect.poll(async () => (await apiMarks(s)).length).toBe(1);
    expect((await apiMarks(s))[0]).toMatchObject({ variant: "text", body: "Q4 plan" });
    await expect(page.locator("[data-mark-card]")).toHaveCount(0);
    await expect(page.locator('[data-mark-variant="text"]')).toHaveCount(1);
  });

  test("a sticky left empty is discarded, and no request about it is ever made", async ({ page }) => {
    const s = await freshSession(page);
    await openCanvas(page);
    const writes: string[] = [];
    page.on("request", (r) => r.url().includes("/marks") && r.method() !== "GET" && writes.push(r.method()));
    await page.keyboard.press("s");
    await clickCanvas(page, 400, 300);
    await expect(page.locator("[data-mark-id]")).toHaveCount(1);

    await page.keyboard.press("Escape");

    await expect(page.locator("[data-mark-id]")).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(writes).toEqual([]);
    expect(await apiMarks(s)).toHaveLength(0);
  });
});

test.describe("moving and persisting marks", () => {
  test("dragging a sticky by its handle sends exactly one patch, with the final position", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
    await openCanvas(page);
    const patches: string[] = [];
    page.on("request", (r) => r.method() === "PATCH" && r.url().includes("/marks/") && patches.push(r.url()));
    const before = (await apiMarks(s)).find((m) => m.id === "mrk_hook")!;
    const root = mark(page, "mrk_hook");
    await root.hover();
    const grip = (await root.locator("[data-mark-handle]").boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 80, grip.y + grip.height / 2 + 40, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await apiMarks(s)).find((m) => m.id === "mrk_hook")!.x).not.toBe(before.x);
    const after = (await apiMarks(s)).find((m) => m.id === "mrk_hook")!;
    // 80 by 40 screen pixels at 0.8x is 100 by 50 board units.
    expect(after.x - before.x).toBeCloseTo(100, 0);
    expect(after.y - before.y).toBeCloseTo(50, 0);
    expect(patches).toHaveLength(1);
  });

  test("a reload puts every mark back where it was, with its variant, colour and text", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await expect(page.locator("[data-mark-id]")).toHaveCount(2);
    const sticky = mark(page, "mrk_hook");
    await expect(sticky).toHaveAttribute("data-mark-variant", "sticky");
    await expect(sticky.locator("textarea")).toHaveValue(/The hook is the whole reel/);
    expect(await sticky.locator("[data-mark-card]").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(192, 162, 92)");
    const heading = mark(page, "mrk_heading");
    await expect(heading).toHaveAttribute("data-mark-variant", "text");
    await expect(heading.locator("[data-mark-card]")).toHaveCount(0);

    const placed = await sticky.boundingBox();
    await page.reload();
    await expect(page.locator("[data-mark-id]")).toHaveCount(2);
    const again = await mark(page, "mrk_hook").boundingBox();
    expect(again!.x).toBeCloseTo(placed!.x, 0);
    expect(again!.y).toBeCloseTo(placed!.y, 0);
  });

  test("a sticky is beneath the node cards it overlaps, and above the highlighter", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);

    // The seeded hook sticky (600, 640) overlaps the "quiet luxury" carousel card (560, 700).
    const top = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('[data-node-card="nd_con_quiet"]')!.getBoundingClientRect();
      const at = document.elementFromPoint(box.x + 120, box.y + 30);
      return at?.closest("[data-node-card]")?.getAttribute("data-node-card") ?? at?.closest("[data-mark-id]")?.getAttribute("data-mark-id") ?? "none";
    });
    expect(top).toBe("nd_con_quiet");
    const z = await page.evaluate(() => {
      const marks = document.querySelector<HTMLElement>("[data-mark-layer]")!;
      const ink = document.querySelector<HTMLElement>('[data-ink-layer="under"]')!;
      return {
        marks: Number(getComputedStyle(marks).zIndex),
        ink: Number(getComputedStyle(ink).zIndex),
        portal: Number(getComputedStyle(marks.closest(".react-flow__viewport-portal")!).zIndex),
      };
    });
    expect(z.marks).toBeGreaterThan(z.ink);
    expect(z.portal).toBeLessThan(0);
  });
});

test.describe("when a request fails", () => {
  test("a failed save leaves the text, offers Retry on the mark, and Retry saves it", async ({ page }) => {
    const s = await freshSession(page);
    await openCanvas(page);
    await page.route(`${API_URL}/marks`, (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: FAIL }) : route.continue(),
    );
    await page.keyboard.press("s");
    await clickCanvas(page, 400, 300);
    await page.keyboard.type("Reshoot the hook");
    await page.keyboard.press("Escape");

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't save that note. Check your connection and try again." })).toBeVisible();
    await expect(page.locator("[data-mark-id] textarea")).toHaveValue("Reshoot the hook");
    expect(await apiMarks(s)).toHaveLength(0);

    await page.unroute(`${API_URL}/marks`);
    await page.getByRole("button", { name: "Retry saving this note" }).click();

    await expect.poll(async () => (await apiMarks(s)).length).toBe(1);
    await expect(page.getByRole("button", { name: "Retry saving this note" })).toHaveCount(0);
  });

  test("a failed delete brings the mark back and says so", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await page.route(`${API_URL}/marks/mrk_hook`, (route) =>
      route.request().method() === "DELETE" ? route.fulfill({ status: 503, contentType: "application/json", body: FAIL }) : route.continue(),
    );

    await mark(page, "mrk_hook").getByRole("button", { name: "Delete note" }).click({ force: true });

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't delete that note. Check your connection and try again." })).toBeVisible();
    await expect(mark(page, "mrk_hook")).toHaveCount(1);
    expect((await apiMarks(s)).map((m) => m.id)).toContain("mrk_hook");
  });

  test("deleting a mark is undoable from the toast", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);

    await mark(page, "mrk_heading").getByRole("button", { name: "Delete note" }).click({ force: true });
    await expect(mark(page, "mrk_heading")).toHaveCount(0);
    await expect.poll(async () => (await apiMarks(s)).length).toBe(1);
    await page.getByRole("status").filter({ hasText: "Note deleted." }).getByRole("button", { name: "Undo" }).click();

    await expect.poll(async () => (await apiMarks(s)).length).toBe(2);
    expect((await apiMarks(s)).find((m) => m.variant === "text")).toMatchObject({ body: expect.stringContaining("Q4") });
    await expect(page.locator("[data-mark-id]")).toHaveCount(2);
  });
});
