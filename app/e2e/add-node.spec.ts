import { expect, test } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { freshSession, openCanvas, setViewport } from "./support";

const cards = (page: import("@playwright/test").Page) => page.locator("[data-node-card]");

test("the first-run affordance opens the menu, and Note lands an untitled note at viewport centre", async ({
  page,
}) => {
  const s = await freshSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  const canvas = await openCanvas(page);

  await page.getByRole("button", { name: "Add your first node" }).click();
  await page.getByRole("menuitem", { name: /^Note/ }).click();

  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/node\/nd_/);
  // The detail panel opens with the title focused, ready to be typed over.
  const title = page.getByRole("complementary", { name: "Node detail" }).getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Untitled");
  const [node] = await s.nodes();
  expect(node).toMatchObject({ type: "note", title: "Untitled" });

  const area = (await canvas.boundingBox())!;
  const box = (await cards(page).first().boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height / 2 - (area.y + area.height / 2))).toBeLessThanOrEqual(2);
});

test("a second note at the same centre is offset rather than stacked exactly", async ({ page }) => {
  const s = await freshSession(page);
  await openCanvas(page);

  for (let i = 0; i < 2; i++) {
    await page.goto("/");
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByRole("menuitem", { name: /^Note/ }).click();
    await expect(page).toHaveURL(/\/node\//);
  }

  const [a, b] = await s.nodes();
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  expect([a!.x, a!.y]).not.toEqual([b!.x, b!.y]);
});

test("Escape closes the menu and creates nothing", async ({ page }) => {
  const s = await freshSession(page);
  await openCanvas(page);

  await page.keyboard.press("n");
  await expect(page.getByRole("menu", { name: "Add node" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await s.nodes()).toHaveLength(0);
});

test("a failed create closes the menu, asks to check the connection, offers Retry, and leaves no node", async ({
  page,
}) => {
  const s = await freshSession(page);
  await openCanvas(page);
  await page.route(`${API_URL}/nodes`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":{"code":"forced_failure","message":"x"}}',
        })
      : route.continue(),
  );

  await page.getByRole("button", { name: "Add your first node" }).click();
  await page.getByRole("menuitem", { name: /^Note/ }).click();

  await expect(page.getByRole("alert")).toContainText("Couldn't add the node. Check your connection and try again.");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
  expect(await s.nodes()).toHaveLength(0);

  await page.unroute(`${API_URL}/nodes`);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(cards(page)).toHaveCount(1);
});
