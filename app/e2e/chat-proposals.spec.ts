import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { card, demoSession, openCanvas, setViewport, type Session } from "./support";

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const action = (page: Page) => page.getByRole("button", { name: /^(Add to canvas|Adding…|Added)/ });
const canvasArea = (page: Page) => page.locator("[data-canvas-state=ready]");
const panel = (page: Page) => page.getByRole("complementary", { name: "Node detail" });

const FAILED = "Couldn't add that to the canvas. Check your connection and try again.";
const GENERATE = "Draft a reel script about linen care";
// The mock operator reads two node titles and proposes the missing link: the hero image to the Ramadan push.
const CONNECT = "Connect the linen shoot hero to the Ramadan push";

let s: Session;

test.beforeEach(async ({ page }) => {
  s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(action(page)).toBeVisible();
  await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");
}

async function insideCanvas(page: Page, id: string) {
  const area = (await canvasArea(page).boundingBox())!;
  const box = await card(page, id).boundingBox();
  return Boolean(
    box &&
    box.x >= area.x &&
    box.y >= area.y &&
    box.x + box.width <= area.x + area.width &&
    box.y + box.height <= area.y + area.height,
  );
}

const nodeCount = async () => (await s.nodes()).length;

test("a drafted node is created with the proposed type and title, in view, however far the camera was", async ({
  page,
}) => {
  await setViewport(s, { x: 4000, y: 4000, zoom: 0.5 }); // looking at empty space
  await openCanvas(page);
  await ask(page, GENERATE);
  await expect(page.getByText("Proposed node")).toBeVisible();
  const before = await nodeCount();

  await action(page).click();

  await expect(action(page)).toHaveText(/Added/);
  const created = (await s.nodes()).find((n) => n.title.includes("reel script about linen care"));
  expect(created).toMatchObject({ type: "content" });
  expect(await nodeCount()).toBe(before + 1);
  await expect(card(page, created!.id)).toBeVisible();
  await expect.poll(() => insideCanvas(page, created!.id)).toBe(true);
});

test("once added the action is non-interactive and cannot create a second node", async ({ page }) => {
  await openCanvas(page);
  await ask(page, GENERATE);
  const before = await nodeCount();
  await action(page).click();
  await expect(action(page)).toHaveText(/Added/);

  await expect(action(page)).toHaveAttribute("aria-disabled", "true");
  await action(page).click({ force: true });
  await page.waitForTimeout(500);

  expect(await nodeCount()).toBe(before + 1);
});

test("undo removes the node, and the action is ready to be used again", async ({ page }) => {
  await openCanvas(page);
  await ask(page, GENERATE);
  const before = await nodeCount();
  await action(page).click();
  await expect(action(page)).toHaveText(/Added/);
  await expect.poll(nodeCount).toBe(before + 1);

  await page.keyboard.press("ControlOrMeta+z");

  await expect.poll(nodeCount).toBe(before);
  await expect(action(page)).toHaveText("Add to canvas");
  await expect(action(page)).not.toHaveAttribute("aria-disabled", "true");
  await action(page).click();
  await expect.poll(nodeCount).toBe(before + 1);
});

test("a proposed connection is created and shows on both nodes' detail panels", async ({ page }) => {
  await openCanvas(page);
  await ask(page, CONNECT);
  await expect(page.getByText("Proposed connection")).toBeVisible();
  const before = (await s.edges()).length;

  await action(page).click();

  await expect(action(page)).toHaveText(/Added/);
  const edges = await s.edges();
  expect(edges).toHaveLength(before + 1);
  expect(edges.at(-1)).toMatchObject({ fromId: "nd_ast_hero", toId: "nd_cmp_ramadan", kind: "serves" });

  await card(page, "nd_ast_hero").dblclick();
  await expect(panel(page).getByRole("list", { name: "Serves" })).toContainText("Vayn Ramadan push");
  await card(page, "nd_cmp_ramadan").dblclick();
  await expect(panel(page).getByRole("list", { name: "Served by" })).toContainText("linen-shoot-hero.jpg");
});

test("a connection brings both ends into view when the camera was elsewhere", async ({ page }) => {
  await setViewport(s, { x: 4000, y: 4000, zoom: 0.5 });
  await openCanvas(page);
  await ask(page, CONNECT);

  await action(page).click();

  await expect.poll(() => insideCanvas(page, "nd_ast_hero")).toBe(true);
  await expect.poll(() => insideCanvas(page, "nd_cmp_ramadan")).toBe(true);
});

test("a connection to a node deleted since is refused by name, and nothing is created", async ({ page }) => {
  await openCanvas(page);
  await ask(page, CONNECT);
  const before = (await s.edges()).length;
  await card(page, "nd_cmp_ramadan").click();
  await page.keyboard.press("Delete");
  await expect(card(page, "nd_cmp_ramadan")).toHaveCount(0);

  await action(page).click();

  const alert = page.getByRole("alert").filter({ hasText: "no longer on the canvas" });
  await expect(alert).toContainText("Vayn Ramadan push");
  expect((await s.edges()).filter((e) => e.fromId === "nd_ast_hero" && e.toId === "nd_cmp_ramadan")).toHaveLength(0);
  expect((await s.edges()).length).toBeLessThanOrEqual(before);
  await expect(action(page)).toHaveText("Add to canvas");
});

test("when the API fails, it says to check the connection and the action can be tried again", async ({ page }) => {
  await openCanvas(page);
  await ask(page, GENERATE);
  const before = await nodeCount();
  await page.route(`${API_URL}/nodes`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":{"code":"forced_failure","message":"x"}}',
        })
      : route.continue(),
  );

  await action(page).click();

  await expect(page.getByRole("alert")).toContainText(FAILED);
  await expect(action(page)).toHaveText("Add to canvas");
  expect(await nodeCount()).toBe(before);

  await page.unroute(`${API_URL}/nodes`);
  await action(page).click();
  await expect(action(page)).toHaveText(/Added/);
  expect(await nodeCount()).toBe(before + 1);
});

test("with the detail panel open the new node lands in the part of the canvas it leaves uncovered", async ({
  page,
}) => {
  await openCanvas(page, "/node/nd_goal_vayn");
  await ask(page, GENERATE);

  await action(page).click();

  await expect(action(page)).toHaveText(/Added/);
  const created = (await s.nodes()).find((n) => n.title.includes("reel script about linen care"))!;
  await expect(card(page, created.id)).toBeVisible();
  const box = (await card(page, created.id).boundingBox())!;
  const covered = (await panel(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(covered.x);
});
