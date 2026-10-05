import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { demoSession, openCanvas, setViewport } from "./support";

test.beforeEach(async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

/** The animation iteration count of the spinner shown while the board loads. */
async function spinnerIterations(page: Page) {
  await page.route(`${API_URL}/board`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/");
  const spinner = page.getByRole("status", { name: "Loading your board" });
  await expect(spinner).toBeVisible();
  return spinner.evaluate((el) => getComputedStyle(el).animationIterationCount);
}

test("without a preference a loading spinner keeps turning (so the next test can fail)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });

  expect(await spinnerIterations(page)).toBe("infinite");
});

test("with reduced motion no animation is left running on a loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  expect(await spinnerIterations(page)).toBe("1");
});

/** Clicks a camera control from inside the page and reads the camera on the next frame and once settled. */
async function firstFrameAfter(page: Page, label: string) {
  return page.evaluate(async (name) => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")!;
    const button = document.querySelector<HTMLButtonElement>(`[role=toolbar] button[aria-label="${name}"]`)!;
    const before = viewport.style.transform;
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const first = viewport.style.transform;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { before, first, final: viewport.style.transform };
  }, label);
}

for (const control of ["Fit to screen", "Zoom in", "Zoom out"]) {
  test(`${control}: with motion allowed the camera is still travelling on the first frame (the control for the next test)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openCanvas(page);

    const frames = await firstFrameAfter(page, control);

    expect(frames.final).not.toBe(frames.before);
    expect(frames.first).not.toBe(frames.final);
  });

  test(`${control}: with reduced motion the camera is already there on the first frame`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCanvas(page);

    const frames = await firstFrameAfter(page, control);

    expect(frames.final).not.toBe(frames.before);
    expect(frames.first).toBe(frames.final);
  });
}
