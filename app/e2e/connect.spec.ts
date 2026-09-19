import { expect, test as base, type Page } from "@playwright/test";
import type { CanvasNode } from "../src/types";
import { card, freshSession, openCanvas, setViewport, type Session } from "./support";

/** An empty board with two notes side by side, A on the left and B on the right. */
const test = base.extend<{ session: Session; a: CanvasNode; b: CanvasNode }>({
  session: async ({ page }, use) => {
    const s = await freshSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await use(s);
  },
  a: async ({ session }, use) =>
    use(await session.createNode({ title: "Reel: linen care", type: "content", x: 120, y: 260 })),
  b: async ({ session, a }, use) => {
    void a; // A is created first, so ids and order are stable.
    await use(await session.createNode({ title: "Linen drop", type: "campaign", x: 620, y: 260 }));
  },
});

async function connect(page: Page, from: string, to: string, kind: "serves" | "relates to") {
  await page.getByRole("toolbar").getByRole("button", { name: "Connect" }).click();
  await card(page, from).click();
  await card(page, to).click();
  await page
    .getByRole("dialog", { name: "Connection kind" })
    .getByRole("button", { name: new RegExp(`^${kind}`) })
    .click();
}

test("serves draws one directional edge with an arrowhead, visible from both ends", async ({ page, session, a, b }) => {
  await openCanvas(page);
  await connect(page, a.id, b.id, "serves");

  const edge = page.locator("[data-edge][data-kind=serves]");
  await expect(edge).toHaveCount(1);
  await expect(edge.locator("[data-arrowhead]")).toHaveCount(1);
  await expect(page.locator("[data-connect-banner]")).toHaveCount(0);

  expect(await session.edges()).toEqual([expect.objectContaining({ fromId: a.id, toId: b.id, kind: "serves" })]);
  // One stored edge, counted on both cards.
  await expect(card(page, a.id).getByLabel("1 connection")).toBeVisible();
  await expect(card(page, b.id).getByLabel("1 connection")).toBeVisible();
});

test("relates-to draws dashed, with no arrowhead", async ({ page, a, b }) => {
  await openCanvas(page);
  await connect(page, a.id, b.id, "relates to");

  const edge = page.locator("[data-edge][data-kind=relates-to]");
  await expect(edge).toHaveCount(1);
  await expect(edge.locator("[data-edge-path]")).toHaveAttribute("stroke-dasharray", "5 5");
  await expect(edge.locator("[data-arrowhead]")).toHaveCount(0);
});

test("a node clicked as its own target creates nothing and explains why", async ({ page, session, a, b }) => {
  void b;
  await openCanvas(page);
  await page.keyboard.press("c");
  await card(page, a.id).click();
  await card(page, a.id).click();

  await expect(page.getByRole("alert")).toContainText("A node can't connect to itself.");
  expect(await session.edges()).toHaveLength(0);
});

test("connecting an already connected pair creates nothing and says they are connected", async ({
  page,
  session,
  a,
  b,
}) => {
  await session.call("POST", "/edges", { fromId: a.id, toId: b.id, kind: "serves" });
  await openCanvas(page);

  await page.keyboard.press("c");
  await card(page, b.id).click();
  await card(page, a.id).click();

  await expect(page.getByRole("alert")).toContainText("These nodes are already connected.");
  await expect(page.getByRole("dialog", { name: "Connection kind" })).toHaveCount(0);
  expect(await session.edges()).toHaveLength(1);
});

test("Escape with a source picked exits the mode and creates nothing", async ({ page, session, a, b }) => {
  void b;
  await openCanvas(page);
  await page.keyboard.press("c");
  await card(page, a.id).click();
  await expect(page.locator("[data-connect-banner]")).toContainText("Now pick the node it connects to");

  await page.keyboard.press("Escape");

  await expect(page.locator("[data-connect-banner]")).toHaveCount(0);
  expect(await session.edges()).toHaveLength(0);
});

test("with one node, connect mode does not activate and says connections need two", async ({ page }) => {
  const s = await freshSession(page);
  await s.createNode({ title: "Alone", x: 200, y: 200 });
  await openCanvas(page);

  await page.keyboard.press("c");

  await expect(page.getByRole("alert")).toContainText("Add another node first — connections need two.");
  await expect(page.locator("[data-connect-banner]")).toHaveCount(0);
  await expect(page.getByRole("toolbar").getByRole("button", { name: "Connect" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("dragging from one card's handle to another opens the kind picker", async ({ page, session, a, b }) => {
  await openCanvas(page);
  const from = card(page, a.id);
  await from.hover();
  const handle = from.locator(".react-flow__handle-right");
  const target = (await card(page, b.id).boundingBox())!;

  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await page
    .getByRole("dialog", { name: "Connection kind" })
    .getByRole("button", { name: /^serves/ })
    .click();
  await expect.poll(async () => (await session.edges()).length).toBe(1);
});

test("while connect mode is on, dragging files over the canvas shows no drop target", async ({ page, a, b }) => {
  void a;
  void b;
  await openCanvas(page);
  await page.keyboard.press("c");
  await expect(page.locator("[data-connect-banner]")).toBeVisible();

  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "a.pdf", { type: "application/pdf" }));
    return dt;
  });
  await page.dispatchEvent("[data-drop-zone]", "dragover", { dataTransfer, clientX: 300, clientY: 300 });
  await expect(page.getByText("Drop to add asset nodes")).toHaveCount(0);
});
