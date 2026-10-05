import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoSession, freshSession, openCanvas } from "./support";

const saveButton = (page: Page) => page.getByRole("button", { name: "Save as PNG" });

/** Clicks Save and returns the downloaded file's bytes and name. */
async function download(page: Page) {
  const [file] = await Promise.all([page.waitForEvent("download"), saveButton(page).click()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

const png = (bytes: Buffer) => ({
  signature: bytes.subarray(0, 8).toString("hex"),
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

/** Decodes the PNG in the page and reads back some pixels, as [r, g, b, a]. */
async function pixels(page: Page, bytes: Buffer, at: Array<[number, number]>) {
  return page.evaluate(
    async ({ base64, points }) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const all = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let distinct = new Set<number>();
      for (let i = 0; i < all.length; i += 4 * 97) distinct.add((all[i]! << 16) | (all[i + 1]! << 8) | all[i + 2]!);
      return { samples: points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)), colours: distinct.size };
    },
    { base64: bytes.toString("base64"), points: at },
  );
}

test.describe("saving the board as a PNG", () => {
  test("downloads a real PNG of the whole board, named for it, at twice its size", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    const { name, bytes } = await download(page);

    expect(name).toBe("marketing-canvas-markup.png");
    const { signature, width, height } = png(bytes);
    expect(signature).toBe("89504e470d0a1a0a");
    // The seeded board spans about 1100 by 1000 board units: 2x with a margin is well over 2000 wide, and
    // it is the board, not the window, that sets that.
    expect(width).toBeGreaterThan(2000);
    expect(width).toBeLessThanOrEqual(8192);
    expect(height).toBeGreaterThan(1800);
    expect(height).toBeLessThanOrEqual(8192);
  });

  test("is the same size whatever the window, because it is the board and not a screenshot of the page", async ({ page }) => {
    await demoSession(page);
    await page.setViewportSize({ width: 1640, height: 760 });
    await openCanvas(page);
    const wide = png((await download(page)).bytes);

    await page.setViewportSize({ width: 1100, height: 900 });
    const narrow = png((await download(page)).bytes);

    expect(narrow.width).toBe(wide.width);
    expect(narrow.height).toBe(wide.height);
  });

  test("paints the light theme's canvas colour behind it, opaque, and has the board's colours on it", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await demoSession(page);
    await openCanvas(page);

    const { bytes } = await download(page);
    const { samples, colours } = await pixels(page, bytes, [[2, 2]]);

    expect(samples[0]).toEqual([242, 238, 231, 255]);
    expect(colours).toBeGreaterThan(8);
  });

  test("follows the dark theme: the picture's background is the dark canvas", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await demoSession(page);
    await openCanvas(page);

    const { bytes } = await download(page);
    const { samples } = await pixels(page, bytes, [[2, 2]]);

    expect(samples[0]).toEqual([27, 25, 22, 255]);
  });

  test("leaves the dock, the chat rail and the toolbar out of the picture, and carries the board's ink", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const s = await demoSession(page);
    await openCanvas(page);

    const { bytes } = await download(page);
    const { width, height } = png(bytes);

    // The picture's corners are the board's margin. Chrome (a dock, a rail, a toolbar) would have put its own
    // panel colours there; every corner is the bare canvas.
    const { samples } = await pixels(page, bytes, [[5, 5], [width - 5, 5], [5, height - 5], [width - 5, height - 5], [60, 60]]);
    for (const sample of samples) expect(sample).toEqual([242, 238, 231, 255]);
    expect((await s.call<unknown[]>("GET", "/strokes")).length).toBeGreaterThan(0);
  });

  test("shows a pending state and starts only one download for a double click", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    let downloads = 0;
    page.on("download", () => downloads++);

    await saveButton(page).dblclick();

    await expect.poll(() => downloads).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);
    expect(downloads).toBe(1);
    await expect(saveButton(page)).not.toHaveAttribute("aria-busy", "true");
  });

  test("is disabled on an empty board, saying there is nothing to save", async ({ page }) => {
    await freshSession(page);
    await openCanvas(page);

    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(saveButton(page)).toHaveAttribute("title", "Nothing to save yet.");
  });

  test("a failure says so, and the control works again", async ({ page }) => {
    await demoSession(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      (window as unknown as { __failOnce: boolean }).__failOnce = true;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
        const w = window as unknown as { __failOnce: boolean };
        if (w.__failOnce) {
          w.__failOnce = false;
          return cb(null);
        }
        return original.call(this, cb, ...rest);
      };
    });
    await openCanvas(page);

    await saveButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't save the image. Try again." })).toBeVisible();
    await expect(saveButton(page)).not.toHaveAttribute("aria-disabled", "true");
    const { bytes } = await download(page);
    expect(png(bytes).signature).toBe("89504e470d0a1a0a");
  });
});
