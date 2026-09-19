import { expect, test } from "@playwright/test";
import { card, demoSession, freshSession, openCanvas, setViewport } from "./support";

const TYPES = ["goal", "strategy", "campaign", "content", "asset", "note"];

test("every type renders in its own token color with its label as text", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
  await openCanvas(page);

  for (const type of TYPES) {
    const first = page.locator(`[data-node-card][data-type="${type}"]`).first();
    await expect(first).toBeVisible();
    await expect(first.locator("[data-type-chip]")).toHaveText(new RegExp(`^${type}$`, "i"));
    const bar = await first.locator("[data-type-bar]").evaluate((el) => getComputedStyle(el).backgroundColor);
    const token = await page.evaluate((t) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = `var(--node-${t})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    }, type);
    expect(bar).toBe(token);
  }
});

test("a long body is clamped to two lines", async ({ page }) => {
  const s = await demoSession(page);
  const node = await s.createNode({
    title: "Wordy",
    body: "A description that keeps going and going. ".repeat(20),
    x: 200,
    y: 1200,
  });
  await setViewport(s, { x: 0, y: -1100, zoom: 1 });
  await openCanvas(page);

  const excerpt = card(page, node.id).locator("[data-excerpt]");
  const { height, lineHeight } = await excerpt.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(Math.round(height / lineHeight)).toBe(2);
});

test("badges show non-zero counts only", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
  await openCanvas(page);

  // nd_cmp_ramadan: 3 connections, no files. nd_not_reach: nothing at all.
  await expect(card(page, "nd_cmp_ramadan").getByLabel("3 connections")).toBeVisible();
  await expect(card(page, "nd_cmp_ramadan").getByLabel(/files?$/)).toHaveCount(0);
  await expect(card(page, "nd_ast_lookbook").getByLabel("1 file")).toBeVisible();
  await expect(card(page, "nd_not_reach").locator("[data-badge]")).toHaveCount(0);
});

test("Enter on a focused card opens its detail panel", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
  await openCanvas(page);

  await card(page, "nd_goal_vayn").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/node\/nd_goal_vayn$/);
});

test("arrow keys move a focused card 8px and the position is stored", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
  await openCanvas(page);

  await card(page, "nd_goal_vayn").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");

  const stored = async () => (await s.nodes()).find((n) => n.id === "nd_goal_vayn")!;
  await expect.poll(async () => ({ x: (await stored()).x, y: (await stored()).y })).toEqual({ x: 248, y: 48 });
  await page.reload();
  await expect(card(page, "nd_goal_vayn")).toBeVisible();
  expect((await stored()).x).toBe(248);
});

test("selecting a node shows a quick-peek beside it", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.8 });
  await openCanvas(page);

  await card(page, "nd_goal_vayn").click();
  const peek = page.getByRole("dialog", { name: /Quick look: Vayn: 500 orders/ });
  await expect(peek).toBeVisible();

  const node = (await card(page, "nd_goal_vayn").boundingBox())!;
  const box = (await peek.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(node.x + node.width);
  expect(box.x - (node.x + node.width)).toBeLessThan(24);

  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 700 } });
  await expect(peek).toHaveCount(0);
});

test("the quick-peek flips side rather than leave the viewport", async ({ page }) => {
  const s = await demoSession(page);
  // nd_goal_md sits at x=880; at zoom 1 its right edge lands near the viewport's.
  await setViewport(s, { x: 150, y: 0, zoom: 1 });
  await openCanvas(page);

  await card(page, "nd_goal_md").click();
  const peek = page.locator("[data-quick-peek=nd_goal_md]");
  await expect(peek).toHaveAttribute("data-side", "left");

  const node = (await card(page, "nd_goal_md").boundingBox())!;
  const box = (await peek.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x + box.width).toBeLessThanOrEqual(node.x);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
});

test("with a single node, 'Connect from here' is non-interactive and says why", async ({ page }) => {
  const s = await freshSession(page);
  const only = await s.createNode({ title: "Lonely", x: 200, y: 200 });
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  await openCanvas(page);

  await card(page, only.id).click();
  const connect = page.getByRole("button", { name: "Connect from here" });
  await expect(connect).toHaveAttribute("aria-disabled", "true");
  await expect(connect).toHaveAttribute("title", "Add another node to connect to.");
});

test("a dragged card stays where it is dropped, through a reload", async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 1 });
  await openCanvas(page);

  const box = (await card(page, "nd_goal_vayn").boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 90, { steps: 8 });
  await page.mouse.up();
  const dropped = (await card(page, "nd_goal_vayn").boundingBox())!;
  expect(dropped.x - box.x).toBeGreaterThan(80);

  // Stored in board units, which at zoom 1 are screen pixels from the origin.
  const stored = async () => (await s.nodes()).find((n) => n.id === "nd_goal_vayn")!;
  await expect.poll(async () => (await stored()).x - 240).toBe(Math.round(dropped.x - box.x));

  await page.reload();
  const after = (await card(page, "nd_goal_vayn").boundingBox())!;
  expect(Math.abs(after.x - dropped.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - dropped.y)).toBeLessThanOrEqual(1);
});
