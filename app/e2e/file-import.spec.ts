import { expect, test as base, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { freshSession, openCanvas, setViewport, type Session } from "./support";

/** Every test starts signed in on an empty board, with the camera at the origin. */
const test = base.extend<{ session: Session }>({
  session: [
    async ({ page }, use) => {
      const s = await freshSession(page);
      await setViewport(s, { x: 0, y: 0, zoom: 1 });
      await use(s);
    },
    { auto: true },
  ],
});

interface FakeFile {
  name: string;
  type: string;
  /** Bytes of zeros. Ignored for `png: true`, which builds a real 1x1 image. */
  size?: number;
  png?: boolean;
}

/** Drops files onto the canvas at a screen point, the way a desktop drag would. */
async function dropFiles(page: Page, files: FakeFile[], at: { x: number; y: number }) {
  const dataTransfer = await page.evaluateHandle(async (specs) => {
    const dt = new DataTransfer();
    for (const spec of specs) {
      let blob: Blob;
      if (spec.png) {
        const canvas = new OffscreenCanvas(1, 1);
        canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
        blob = await canvas.convertToBlob({ type: "image/png" });
      } else {
        blob = new Blob([new Uint8Array(spec.size ?? 16)]);
      }
      dt.items.add(new File([blob], spec.name, { type: spec.type }));
    }
    return dt;
  }, files);
  const init = { dataTransfer, clientX: at.x, clientY: at.y };
  await page.dispatchEvent("[data-drop-zone]", "dragenter", init);
  await page.dispatchEvent("[data-drop-zone]", "dragover", init);
  await page.dispatchEvent("[data-drop-zone]", "drop", init);
}

const assets = (page: Page) => page.locator('[data-node-card][data-type="asset"]');

test("a dropped image becomes one asset node at the drop point, with name, size and thumbnail", async ({
  page,
  session,
}) => {
  await openCanvas(page);
  await dropFiles(page, [{ name: "hero.png", type: "image/png", png: true }], { x: 500, y: 350 });

  await expect(assets(page)).toHaveCount(1);
  const node = assets(page).first();
  await expect(node).toContainText("hero.png");
  await expect(node.locator("[data-file-size]")).toHaveText(/KB$/);
  await expect(node.locator("[data-thumbnail] img")).toHaveAttribute("src", /^blob:/);

  const box = (await node.boundingBox())!;
  expect(box.x).toBeLessThan(500);
  expect(box.x + box.width).toBeGreaterThan(500);
  expect(box.y).toBeLessThan(350);
  expect(box.y + box.height).toBeGreaterThan(350);

  const [stored] = await session.nodes();
  expect(stored).toMatchObject({ type: "asset", title: "hero.png" });
  expect(stored!.fileIds).toHaveLength(1);
});

test("three files dropped at once become three asset nodes in a row", async ({ page, session }) => {
  await openCanvas(page);
  await dropFiles(
    page,
    [
      { name: "a.pdf", type: "application/pdf" },
      { name: "b.txt", type: "text/plain" },
      { name: "c.md", type: "" },
    ],
    { x: 300, y: 300 },
  );

  await expect(assets(page)).toHaveCount(3);
  const nodes = (await session.nodes()).sort((a, b) => a.x - b.x);
  expect(nodes.map((n) => n.title)).toEqual(["a.pdf", "b.txt", "c.md"]);
  expect(new Set(nodes.map((n) => n.y)).size).toBe(1);
  expect(nodes[1]!.x).toBeGreaterThan(nodes[0]!.x);
  expect(nodes[2]!.x).toBeGreaterThan(nodes[1]!.x);
});

test("in a mixed drop the valid file imports and the rejected one is named with the supported types", async ({
  page,
}) => {
  await openCanvas(page);
  await dropFiles(
    page,
    [
      { name: "brief.pdf", type: "application/pdf" },
      { name: "setup.exe", type: "application/x-msdownload" },
    ],
    { x: 400, y: 300 },
  );

  await expect(assets(page)).toHaveCount(1);
  await expect(page.getByRole("alert")).toContainText(
    "setup.exe isn't a supported file type. Supported: images, PDF, text, Office.",
  );
});

test("a file over 25MB creates no node and the message names the file and the limit", async ({ page, session }) => {
  await openCanvas(page);
  await dropFiles(page, [{ name: "raw-shoot.pdf", type: "application/pdf", size: 26 * 1024 * 1024 }], {
    x: 400,
    y: 300,
  });

  await expect(page.getByRole("alert")).toContainText("raw-shoot.pdf is 26.0MB — the limit is 25MB.");
  await expect(assets(page)).toHaveCount(0);
  expect(await session.nodes()).toHaveLength(0);
});

test("a drop with no supported files creates nothing and lists what is supported", async ({ page }) => {
  await openCanvas(page);
  await dropFiles(page, [{ name: "archive.zip", type: "application/zip" }], { x: 400, y: 300 });

  await expect(page.getByRole("alert")).toContainText(
    "No supported files in that drop. Images, PDFs, text and Office files are supported.",
  );
  await expect(page.locator("[data-node-card]")).toHaveCount(0);
});

test("a file being read shows a progress indicator on its node", async ({ page }) => {
  await openCanvas(page);
  await page.route(`${API_URL}/files`, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });

  await dropFiles(page, [{ name: "slow.pdf", type: "application/pdf" }], { x: 400, y: 300 });

  await expect(page.getByRole("progressbar", { name: "Reading slow.pdf" })).toBeVisible();
  await expect(assets(page)).toHaveCount(1);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("dragging files over the canvas shows a drop target", async ({ page }) => {
  await openCanvas(page);
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "a.pdf", { type: "application/pdf" }));
    return dt;
  });
  await page.dispatchEvent("[data-drop-zone]", "dragover", { dataTransfer, clientX: 300, clientY: 300 });
  await expect(page.getByText("Drop to add asset nodes")).toBeVisible();
});
