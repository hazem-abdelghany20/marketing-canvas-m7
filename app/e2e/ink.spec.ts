import { expect, test, type Page } from "@playwright/test";
import type { Stroke } from "../src/types";
import { API_URL } from "../playwright.config";
import { card, demoSession, freshSession, openCanvas, setViewport } from "./support";

const area = (page: Page) => page.locator("[data-canvas-state=ready]");
const tool = (page: Page, name: string) => page.getByRole("group", { name: "Whiteboard tools" }).getByRole("button", { name });
const strokes = (page: Page) => page.locator("[data-stroke-id]");
const apiStrokes = (s: { call<T>(m: "GET", p: string): Promise<T> }) => s.call<Stroke[]>("GET", "/strokes");

/** A drag across the canvas, in canvas-relative pixels, in small steps the way a hand moves. */
async function drag(page: Page, from: [number, number], to: [number, number], steps = 14) {
  const box = (await area(page).boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps });
  await page.mouse.up();
}

/** The page coordinates of a point a third of the way along a stroke's path. */
async function pointOn(page: Page, id: string, fraction = 0.33) {
  return page.locator(`[data-stroke-id="${id}"]`).evaluate((el, f) => {
    const path = el as unknown as SVGPathElement;
    const at = path.getPointAtLength(path.getTotalLength() * f);
    const m = path.getScreenCTM()!;
    return { x: m.a * at.x + m.c * at.y + m.e, y: m.b * at.x + m.d * at.y + m.f };
  }, fraction);
}

test.describe("drawing", () => {
  test("a drag with the Pen saves one stroke, in board coordinates, and shows it live before it is saved", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 120, y: 80, zoom: 1.5 });
    await openCanvas(page);
    await page.keyboard.press("p");

    const box = (await area(page).boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 350, { steps: 8 });
    // Mid-drag: drawn already, and the API has been told nothing.
    await expect(page.locator("[data-live-stroke]")).toBeVisible();
    expect(await apiStrokes(s)).toHaveLength(0);
    await page.mouse.move(box.x + 500, box.y + 400, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await apiStrokes(s)).length).toBe(1);
    const [stroke] = await apiStrokes(s);
    expect(stroke!.tool).toBe("pen");
    expect(stroke!.points.length).toBeGreaterThanOrEqual(4);
    expect(stroke!.points.length % 2).toBe(0);
    // screen (300, 300) on a camera panned (120, 80) at 1.5x is board (120, 146.7), not (300, 300).
    expect(stroke!.points[0]).toBeCloseTo((300 - 120) / 1.5, 0);
    expect(stroke!.points[1]).toBeCloseTo((300 - 80) / 1.5, 0);
    expect(stroke!.points.at(-2)).toBeCloseTo((500 - 120) / 1.5, 0);
    expect(stroke!.points.at(-1)).toBeCloseTo((400 - 80) / 1.5, 0);
    await expect(page.locator("[data-live-stroke]")).toHaveCount(0);
    await expect(strokes(page)).toHaveCount(1);
  });

  test("a long drag is sent as a handful of points, not one for every pixel the pointer crossed", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.keyboard.press("p");

    await drag(page, [300, 200], [800, 500], 300);

    await expect.poll(async () => (await apiStrokes(s)).length).toBe(1);
    expect((await apiStrokes(s))[0]!.points.length).toBeLessThan(20);
  });

  test("the Highlighter draws wider than the Pen, translucent, in the layer beneath the cards", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
    await openCanvas(page);

    await page.keyboard.press("h");
    await drag(page, [300, 500], [420, 500]);
    await expect.poll(async () => (await apiStrokes(s)).length).toBe(3);
    const made = (await apiStrokes(s)).find((x) => x.id !== "stk_ring" && x.id !== "stk_swipe")!;
    expect(made.tool).toBe("highlighter");
    expect(made.width).toBeGreaterThan(3);

    const layers = await page.evaluate(() => {
      const under = document.querySelector('[data-ink-layer="under"]')!;
      const over = document.querySelector('[data-ink-layer="over"]')!;
      const z = (el: Element | null) => {
        for (let e = el; e; e = e.parentElement) {
          const v = getComputedStyle(e).zIndex;
          if (v !== "auto") return { z: Number(v), tag: e.className };
        }
        return { z: 0, tag: "" };
      };
      const node = document.querySelector(".react-flow__node")!;
      return {
        under: z(under).z,
        over: z(over).z,
        node: Number(getComputedStyle(node).zIndex) || 0,
        opacity: getComputedStyle(under.querySelector("[data-stroke-id]")!).strokeOpacity,
      };
    });
    expect(layers.under).toBeLessThan(layers.node);
    expect(layers.over).toBeGreaterThan(layers.node);
    expect(Number(layers.opacity)).toBeLessThan(1);
  });

  test("the colour and width chosen in the options are the ones that are drawn, in the theme's own ink", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.keyboard.press("p");
    await page.getByRole("radio", { name: "Teal" }).click();
    await page.getByRole("radio", { name: "Thick" }).click();

    await drag(page, [200, 200], [400, 260]);

    await expect.poll(async () => (await apiStrokes(s)).length).toBe(1);
    const [stroke] = await apiStrokes(s);
    expect(stroke).toMatchObject({ color: "var(--ink-2)", width: 6 });
    // The page swaps its temporary stroke for the saved one a moment after the API has it.
    await expect(page.locator(`[data-stroke-id="${stroke!.id}"]`)).toHaveCount(1);
    // The token resolves: what is painted is a real colour, the very one the token holds.
    const [painted, token] = await page.evaluate((id) => {
      const path = document.querySelector(`[data-stroke-id="${id}"]`)!;
      const probe = document.createElement("i");
      probe.style.color = "var(--ink-2)";
      document.body.append(probe);
      const tokenColour = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(path).stroke, tokenColour];
    }, stroke!.id);
    expect(painted).toBe(token);
    expect(painted).toMatch(/^rgb/);
  });

  test("under Select the ink never takes the pointer: a drag pans, and nothing is drawn", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    const before = await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);

    await drag(page, [900, 650], [800, 600]);

    await expect(page.locator("[data-ink-surface]")).toHaveCount(0);
    expect(await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);
    expect(await apiStrokes(s)).toHaveLength(2);
  });
});

test.describe("ink and the camera", () => {
  test("a stroke stays on the same board position when the canvas is zoomed", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
    await openCanvas(page);

    /** Where the highlighter swipe's far end and its height sit, as fractions of the card it lies across. */
    const relative = async () => {
      const cardBox = (await card(page, "nd_con_linenstyle").boundingBox())!;
      const end = await pointOn(page, "stk_swipe", 1);
      const mid = await pointOn(page, "stk_swipe", 0.5);
      return { cardWidth: cardBox.width, x: (end.x - cardBox.x) / cardBox.width, y: (mid.y - cardBox.y) / cardBox.height };
    };

    const before = await relative();
    const box = (await area(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await relative()).cardWidth).not.toBeCloseTo(before.cardWidth, 0);
    const after = await relative();

    // Swipe: board (300..470, 712) over the card at (300, 700), 236 by 140.
    expect(before.x).toBeCloseTo((470 - 300) / 236, 1);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(before.y).toBeCloseTo(12 / 140, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test("a reload draws every saved stroke again, in its own colour, width and place", async ({ page }) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.keyboard.press("h");
    await page.getByRole("radio", { name: "Plum" }).click();
    await page.getByRole("radio", { name: "Medium" }).click();
    await drag(page, [200, 300], [500, 300]);
    await expect.poll(async () => (await apiStrokes(s)).length).toBe(1);
    const [saved] = await apiStrokes(s);
    const bbox = await page.locator(`[data-stroke-id="${saved!.id}"]`).boundingBox();

    await page.reload();
    await expect(area(page)).toBeVisible();

    const again = page.locator(`[data-stroke-id="${saved!.id}"]`);
    await expect(again).toHaveCount(1);
    await expect(again).toHaveAttribute("stroke-width", String(saved!.width));
    expect(await again.evaluate((el) => (el as SVGElement).style.stroke)).toBe(saved!.color);
    const bbox2 = await again.boundingBox();
    expect(bbox2!.x).toBeCloseTo(bbox!.x, 0);
    expect(bbox2!.y).toBeCloseTo(bbox!.y, 0);
  });
});

test.describe("erasing and clearing", () => {
  test("the Eraser takes the whole stroke it is clicked on, and leaves the other", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
    await openCanvas(page);
    await page.keyboard.press("e");

    const on = await pointOn(page, "stk_ring");
    await page.mouse.click(on.x, on.y);

    await expect(page.locator('[data-stroke-id="stk_ring"]')).toHaveCount(0);
    await expect(page.locator('[data-stroke-id="stk_swipe"]')).toHaveCount(1);
    await expect.poll(async () => (await apiStrokes(s)).map((x) => x.id)).toEqual(["stk_swipe"]);
  });

  test("Undo in the toast draws the erased stroke back, and the API has it again", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
    await openCanvas(page);
    await page.keyboard.press("e");
    const on = await pointOn(page, "stk_ring");
    await page.mouse.click(on.x, on.y);

    await page.getByRole("status").filter({ hasText: "Erased 1 stroke." }).getByRole("button", { name: "Undo" }).click();

    await expect(strokes(page)).toHaveCount(2);
    await expect.poll(async () => (await apiStrokes(s)).length).toBe(2);
  });

  test("Clear ink asks first, and once confirmed removes everything with a single request", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    const deletes: string[] = [];
    page.on("request", (r) => r.method() === "DELETE" && deletes.push(new URL(r.url()).pathname));

    await page.getByRole("button", { name: "Clear ink" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Clear all ink?" });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(deletes).toEqual([]);
    await expect(strokes(page)).toHaveCount(2);

    await page.getByRole("button", { name: "Clear ink" }).click();
    await dialog.getByRole("button", { name: "Clear ink" }).click();

    await expect(strokes(page)).toHaveCount(0);
    await expect.poll(() => deletes).toEqual(["/strokes"]);
    expect(await apiStrokes(s)).toEqual([]);
    await expect(page.getByRole("button", { name: "Clear ink" })).toHaveCount(0);
    await expect(tool(page, "Eraser")).toHaveAttribute("aria-disabled", "true");
  });

  test("a clear that fails brings the ink back and says so", async ({ page }) => {
    const s = await demoSession(page);
    await openCanvas(page);
    await page.route(`${API_URL}/strokes`, (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"forced_failure","message":"x"}}' })
        : route.continue(),
    );

    await page.getByRole("button", { name: "Clear ink" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Clear ink" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't clear the ink. Check your connection and try again." })).toBeVisible();
    await expect(strokes(page)).toHaveCount(2);
    expect(await apiStrokes(s)).toHaveLength(2);
  });
});

test.describe("when a save fails", () => {
  test("the stroke stays on screen, a toast offers Retry, and Retry saves the same stroke", async ({ page }) => {
    const s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);
    await page.route(`${API_URL}/strokes`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"forced_failure","message":"x"}}' })
        : route.continue(),
    );
    await page.keyboard.press("p");

    await drag(page, [300, 500], [500, 560]);

    const toast = page.getByRole("alert").filter({ hasText: "Couldn't save that mark. Check your connection and try again." });
    await expect(toast).toBeVisible();
    await expect(strokes(page)).toHaveCount(3);
    expect(await apiStrokes(s)).toHaveLength(2);

    await page.unroute(`${API_URL}/strokes`);
    await toast.getByRole("button", { name: "Retry" }).click();

    await expect.poll(async () => (await apiStrokes(s)).length).toBe(3);
    await expect(strokes(page)).toHaveCount(3);
    await expect(page.locator("[data-stroke-unsaved]")).toHaveCount(0);
  });
});
