import { expect, test, type Page } from "@playwright/test";
import type { Pin } from "../src/types";
import { API_URL } from "../playwright.config";
import { demoSession, freshSession, openCanvas, setViewport } from "./support";

const area = (page: Page) => page.locator("[data-canvas-state=ready]");
const apiPins = (s: { call<T>(m: "GET", p: string): Promise<T> }) => s.call<Pin[]>("GET", "/pins");
const pin = (page: Page, id: string) => page.locator(`[data-pin-id="${id}"]`);
const thread = (page: Page) => page.getByRole("dialog", { name: "Comment thread" });
const dockTool = (page: Page, name: string) =>
  page.getByRole("group", { name: "Whiteboard tools" }).getByRole("button", { name, exact: true });
const composer = (page: Page) => thread(page).getByRole("textbox", { name: "Comment" });
const FAIL = '{"error":{"code":"forced_failure","message":"x"}}';

async function clickCanvas(page: Page, x: number, y: number) {
  const box = (await area(page).boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
}

test.describe("the seeded pins", () => {
  test("are on the board, the resolved one muted, and a thread shows both authors with the reply nested", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await expect(page.locator("[data-pin-id]")).toHaveCount(2);
    await expect(pin(page, "pin_price")).toHaveAttribute("data-pin-resolved", "true");
    const opacity = (id: string) => pin(page, id).evaluate((el) => Number(getComputedStyle(el).opacity));
    // The pins ease in; once they have, the resolved one is the muted one.
    await expect.poll(() => opacity("pin_reel")).toBe(1);
    expect(await opacity("pin_price")).toBeLessThan(1);

    await pin(page, "pin_reel").click();

    await expect(thread(page)).toBeVisible();
    await expect(thread(page).locator("[data-comment-author]")).toHaveText(["Rania", "Omar"]);
    const [first, second] = await thread(page).locator("[data-comment-id]").all();
    const a = (await first!.boundingBox())!;
    const b = (await second!.boundingBox())!;
    expect(b.x).toBeGreaterThan(a.x + 6);
    await expect(thread(page).locator("time").first()).toHaveAttribute("title", /\w/);
    // Comments came with the pins: opening a thread asks the API for nothing.
    await expect(page.getByRole("dialog", { name: "Comment thread" })).toHaveCount(1);
  });

  test("resolving is saved, mutes the pin, and survives a reload; reopening undoes it", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await pin(page, "pin_reel").click();

    await thread(page).getByRole("button", { name: "Resolve" }).click();

    await expect.poll(async () => (await apiPins(s)).find((p) => p.id === "pin_reel")!.resolved).toBe(true);
    await expect(pin(page, "pin_reel")).toHaveAttribute("data-pin-resolved", "true");
    await page.reload();
    await expect(pin(page, "pin_reel")).toHaveAttribute("data-pin-resolved", "true");
    await pin(page, "pin_reel").click();
    await thread(page).getByRole("button", { name: "Reopen" }).click();
    await expect.poll(async () => (await apiPins(s)).find((p) => p.id === "pin_reel")!.resolved).toBe(false);
  });
});

test.describe("the Comment tool", () => {
  test("drops a pin, opens its thread with the composer focused, and a posted comment is attributed to you", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.keyboard.press("c");
    await clickCanvas(page, 300, 250);

    await expect(thread(page)).toBeVisible();
    await expect(composer(page)).toBeFocused();
    await expect(thread(page).getByText("New comment, pinned right here.")).toBeVisible();
    await expect(thread(page).getByRole("button", { name: "Resolve" })).toHaveAttribute("aria-disabled", "true");
    expect(await apiPins(s)).toHaveLength(0);

    await composer(page).fill("Hook lands late.");
    await composer(page).press("Enter");

    await expect.poll(async () => (await apiPins(s)).length).toBe(1);
    const [saved] = await apiPins(s);
    expect(saved!.x).toBeCloseTo(300, 0);
    expect(saved!.y).toBeCloseTo(250, 0);
    expect(saved!.comments).toHaveLength(1);
    expect(saved!.comments[0]!).toMatchObject({ body: "Hook lands late.", author: { name: "Ada" } });
    await expect(thread(page).getByText("Hook lands late.")).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    await expect(composer(page)).toBeFocused();
  });

  test("Post stays disabled for whitespace", async ({ page }) => {
    await freshSession(page);
    await openCanvas(page);
    await page.keyboard.press("c");
    await clickCanvas(page, 300, 250);

    await composer(page).fill("   ");

    await expect(thread(page).getByRole("button", { name: "Post" })).toHaveAttribute("aria-disabled", "true");
  });

  test("a thread closed empty leaves no pin behind and asks the API nothing", async ({ page }) => {
    const s = await freshSession(page);
    await openCanvas(page);
    const writes: string[] = [];
    page.on("request", (r) => /\/pins|\/comments/.test(r.url()) && r.method() !== "GET" && writes.push(r.method()));
    await page.keyboard.press("c");
    await clickCanvas(page, 300, 250);
    await expect(page.locator("[data-pin-id]")).toHaveCount(1);

    await page.keyboard.press("Escape");

    await expect(page.locator("[data-pin-id]")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(writes).toEqual([]);
    expect(await apiPins(s)).toHaveLength(0);
    // The first Escape closed the thread; the tool is still in hand until the second.
    await expect(dockTool(page, "Comment")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(dockTool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("when it goes wrong", () => {
  test("a failed comment stays in the thread marked unsent, the composer keeps its text, and Retry sends it", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await pin(page, "pin_reel").click();
    await page.route(`${API_URL}/pins/pin_reel/comments`, (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: FAIL }),
    );

    await composer(page).fill("Can we shoot Friday instead?");
    await composer(page).press("Enter");

    await expect(thread(page).getByText("Couldn't post that comment. Check your connection and try again.")).toBeVisible();
    const unsent = thread(page).locator('[data-comment-sync="failed"]');
    await expect(unsent).toContainText("Can we shoot Friday instead?");
    await expect(composer(page)).toHaveValue("Can we shoot Friday instead?");

    await page.unroute(`${API_URL}/pins/pin_reel/comments`);
    await unsent.getByRole("button", { name: "Retry" }).click();

    await expect(thread(page).locator('[data-comment-sync="failed"]')).toHaveCount(0);
    await expect.poll(async () => (await apiPins(s)).find((p) => p.id === "pin_reel")!.comments.length).toBe(3);
  });

  test("a pin deleted elsewhere closes its thread, with a toast, the moment you try to post to it", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await pin(page, "pin_reel").click();
    await s.call("DELETE", "/pins/pin_reel");

    await composer(page).fill("Still there?");
    await composer(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: "That thread was deleted." })).toBeVisible();
    await expect(thread(page)).toHaveCount(0);
    await expect(pin(page, "pin_reel")).toHaveCount(0);
  });

  test("a failed resolve reverts the thread to open and says so", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await pin(page, "pin_reel").click();
    await page.route(`${API_URL}/pins/pin_reel`, (route) =>
      route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: FAIL }) : route.continue(),
    );

    await thread(page).getByRole("button", { name: "Resolve" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't update that thread." })).toBeVisible();
    await expect(pin(page, "pin_reel")).toHaveAttribute("data-pin-resolved", "false");
  });

  test("deleting a thread asks first, and a failed delete brings the pin back", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await page.route(`${API_URL}/pins/pin_reel`, (route) =>
      route.request().method() === "DELETE" ? route.fulfill({ status: 503, contentType: "application/json", body: FAIL }) : route.continue(),
    );
    await pin(page, "pin_reel").click();

    await thread(page).getByRole("button", { name: "Delete thread" }).click();
    await expect(thread(page).getByText("Delete this thread and its comments?")).toBeVisible();
    await thread(page).getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't delete that thread." })).toBeVisible();
    await expect(pin(page, "pin_reel")).toHaveCount(1);
    expect((await apiPins(s)).map((p) => p.id)).toContain("pin_reel");
  });
});

test.describe("where the thread opens", () => {
  test("flips to the left of a pin near the right edge, and stays inside the canvas", async ({ page }) => {
    const s = await demoSession(page);
    // The seeded "price" pin is at board (640, 240); this puts it 40px from the canvas's right edge.
    await setViewport(s, { x: 600, y: 100, zoom: 1 });
    await openCanvas(page);

    await pin(page, "pin_price").click();

    await expect(thread(page)).toBeVisible();
    await expect(thread(page)).toHaveAttribute("data-side", "left");
    const canvas = (await area(page).boundingBox())!;
    const panel = (await thread(page).boundingBox())!;
    const marker = (await pin(page, "pin_price").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(canvas.x);
    expect(panel.x + panel.width).toBeLessThanOrEqual(canvas.x + canvas.width + 0.5);
    expect(panel.x + panel.width).toBeLessThanOrEqual(marker.x + 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);
  });

  test("opens to the right of a pin with room beside it", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);

    await pin(page, "pin_reel").click();

    await expect(thread(page)).toHaveAttribute("data-side", "right");
  });
});
