import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { card, DEMO, demoSession, freshSession, openCanvas, setViewport } from "./support";

const panel = (page: Page) => page.getByRole("complementary", { name: "Node detail" });
const title = (page: Page) => panel(page).getByRole("textbox", { name: "Title" });

/** Reads the camera straight off React Flow's transform. */
async function camera(page: Page) {
  const transform = await page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform);
  const m = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/)!;
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

test("a title edited and blurred shows on the canvas card without a reload", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.6 });
  await openCanvas(page, "/node/nd_str_icp");

  await title(page).fill("Vayn ICP: 25-34 urban women who buy for themselves");
  await panel(page).getByRole("textbox", { name: "Description" }).focus();

  await expect(card(page, "nd_str_icp")).toContainText("who buy for themselves");
  await expect
    .poll(async () => (await s.nodes()).find((n) => n.id === "nd_str_icp")!.title)
    .toBe("Vayn ICP: 25-34 urban women who buy for themselves");
});

test("changing the type recolors the card and every edge attached to it", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.6 });
  await openCanvas(page, "/node/nd_str_icp");
  const attached = page.locator('[data-edge="edg_6"], [data-edge="edg_8"]');
  await expect(attached).toHaveCount(2);

  await panel(page)
    .getByRole("button", { name: /^Type: Strategy/ })
    .click();
  await page.getByRole("menuitemradio", { name: /^Campaign/ }).click();

  await expect(card(page, "nd_str_icp")).toHaveAttribute("data-type", "campaign");
  // edg_8 leaves this node, edg_6 arrives at it.
  await expect(page.locator('[data-edge="edg_8"]')).toHaveAttribute("data-from-type", "campaign");
  await expect(page.locator('[data-edge="edg_6"]')).toHaveAttribute("data-to-type", "campaign");
  const stop = await page
    .locator('[data-edge="edg_8"] [data-stop=from]')
    .evaluate((el) => getComputedStyle(el).getPropertyValue("stop-color"));
  const expected = await page.evaluate(() => {
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    probe.setAttribute("style", "stop-color: color-mix(in srgb, var(--node-campaign) 55%, var(--edge-serves))");
    document.querySelector("svg")!.append(probe);
    const color = getComputedStyle(probe).getPropertyValue("stop-color");
    probe.remove();
    return color;
  });
  expect(stop).toBe(expected);
});

test("outgoing serves edges are listed under Serves and incoming under Served by", async ({ page }) => {
  await demoSession(page);
  await openCanvas(page, "/node/nd_str_icp");

  await expect(panel(page).getByRole("list", { name: "Serves" })).toContainText("Vayn: 500 orders/month by Q4");
  await expect(panel(page).getByRole("list", { name: "Served by" })).toContainText("Vayn linen drop - September");
});

test("an edge made in connect mode reads Serves from A and Served by from B", async ({ page }) => {
  const s = await freshSession(page);
  const a = await s.createNode({ title: "Reel: linen care", type: "content", x: 100, y: 200 });
  const b = await s.createNode({ title: "Linen drop", type: "campaign", x: 500, y: 200 });
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  await openCanvas(page);

  await page.keyboard.press("c");
  await card(page, a.id).click();
  await card(page, b.id).click();
  await page
    .getByRole("dialog", { name: "Connection kind" })
    .getByRole("button", { name: /^serves/ })
    .click();
  await expect(page.locator("[data-edge]")).toHaveCount(1);

  await card(page, a.id).dblclick();
  await expect(panel(page).getByRole("list", { name: "Serves" })).toContainText("Linen drop");
  await page.goto(`/node/${b.id}`);
  await expect(panel(page).getByRole("list", { name: "Served by" })).toContainText("Reel: linen care");
  expect(await s.edges()).toHaveLength(1);
});

test("clicking a connection pans the canvas to it and keeps the panel on the opened node", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  await openCanvas(page, "/node/nd_str_icp");
  const before = await camera(page);

  await panel(page).getByRole("list", { name: "Served by" }).getByRole("button").first().click();

  await expect.poll(async () => (await camera(page)).y).not.toBe(before.y);
  await expect(page).toHaveURL(/\/node\/nd_str_icp$/);
  await expect(title(page)).toHaveValue("Vayn ICP: 25-34 urban women");
  const target = (await card(page, "nd_cmp_linen").boundingBox())!;
  const panelBox = (await panel(page).boundingBox())!;
  expect(target.x + target.width).toBeLessThanOrEqual(panelBox.x);
  expect(target.y).toBeGreaterThanOrEqual(0);
});

test("a whitespace-only annotation is never created", async ({ page }) => {
  const s = await demoSession(page);
  await openCanvas(page, "/node/nd_goal_md");
  const before = (await s.call<unknown[]>("GET", "/nodes/nd_goal_md/annotations")).length;

  await panel(page).getByRole("textbox", { name: "New annotation" }).fill("    ");
  const add = panel(page).getByRole("button", { name: "Add note" });
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await add.click({ force: true }); // it stays clickable so its reason can be read; it just does nothing

  expect((await s.call<unknown[]>("GET", "/nodes/nd_goal_md/annotations")).length).toBe(before);
});

test("a deleted id says the node doesn't exist and offers the way back", async ({ page }) => {
  await demoSession(page);
  await openCanvas(page, "/node/nd_gone");

  await expect(panel(page).getByRole("heading", { name: "That node doesn't exist." })).toBeVisible();
  await expect(panel(page)).toContainText("It may have been deleted.");
  await expect(panel(page)).not.toContainText("aren't saving");
  await panel(page).getByRole("button", { name: "Back to canvas" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a node with no connections shows the empty state and a connect action", async ({ page }) => {
  await demoSession(page);
  await openCanvas(page, "/node/nd_not_reach");

  await expect(panel(page)).toContainText("Not connected to anything yet");
  await panel(page).getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-connect-banner]")).toContainText("Now pick the node it connects to");
});

test("while an autosave is in flight the type picker waits and typing carries on", async ({ page }) => {
  await demoSession(page);
  await openCanvas(page, "/node/nd_goal_md");
  await page.route(`${API_URL}/nodes/nd_goal_md`, async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });

  await title(page).fill("Mental Diet: 1,200 completions");
  await title(page).blur();

  const picker = panel(page).getByRole("button", { name: /^Type: Goal/ });
  await expect(picker).toHaveAttribute("aria-disabled", "true");
  await expect(panel(page).locator("[data-save-state]")).toHaveText("Saving…");
  await title(page).focus();
  await title(page).press("End");
  await title(page).pressSequentially(" by December");
  await expect(title(page)).toHaveValue("Mental Diet: 1,200 completions by December");
  await expect(picker).not.toHaveAttribute("aria-disabled", "true");
});

test("after a reload an attached file is missing and offers re-attachment", async ({ page }) => {
  await demoSession(page);
  await openCanvas(page, "/node/nd_ast_lookbook");

  const row = panel(page).locator("[data-file-row]");
  await expect(row).toContainText("vayn-lookbook.pdf");
  await expect(row).toContainText("File not available after reload");
  await expect(row.getByRole("button", { name: "Re-attach vayn-lookbook.pdf" })).toBeVisible();
});

test("the canvas stays mounted and visible behind the panel", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
  await openCanvas(page, "/node/nd_goal_vayn");

  await expect(panel(page)).toBeVisible();
  await expect(card(page, "nd_str_icp")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(card(page, "nd_str_icp")).toBeVisible();
});

test("a signed-out deep link signs in and returns to the node", async ({ page }) => {
  await page.goto("/node/nd_goal_vayn");
  await expect(page).toHaveURL(/\/signin\?next=%2Fnode%2Fnd_goal_vayn$/);

  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/node\/nd_goal_vayn$/);
  await expect(title(page)).toHaveValue("Vayn: 500 orders/month by Q4");
});
