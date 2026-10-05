import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { card, demoSession, freshSession, openCanvas, setViewport, type Session } from "./support";

const panel = (page: Page) => page.getByRole("complementary", { name: "Node detail" });
const SESSION_EXPIRED = "Your session expired. Sign in again.";

const unauthorized = '{"error":{"code":"invalid_token","message":"Sign in again."}}';

test.describe("the workspace when the board does not arrive", () => {
  test.beforeEach(async ({ page }) => {
    await demoSession(page);
  });

  test("a rejected token goes to sign-in with a toast saying the session expired", async ({ page }) => {
    await page.route(`${API_URL}/board`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: unauthorized }),
    );

    await page.goto("/");

    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole("alert").filter({ hasText: SESSION_EXPIRED })).toBeVisible();
  });

  test("and from a node's address it returns there once signed in again", async ({ page }) => {
    await page.route(`${API_URL}/board`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: unauthorized }),
    );

    await page.goto("/node/nd_goal_vayn");

    await expect(page).toHaveURL(/\/signin\?next=%2Fnode%2Fnd_goal_vayn$/);
    await expect(page.getByRole("alert").filter({ hasText: SESSION_EXPIRED })).toBeVisible();
  });

  test("a failing board says what to do, and Reload works once the server is back", async ({ page }) => {
    await page.route(`${API_URL}/board`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":{"code":"forced_failure","message":"x"}}',
      }),
    );
    await page.goto("/");

    const alert = page.locator("[data-canvas-state=error]").getByRole("alert");
    await expect(alert).toContainText("We couldn't load your board. Check your connection, then reload.");

    await page.unroute(`${API_URL}/board`);
    await alert.getByRole("button", { name: "Reload" }).click();
    await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
  });

  test("a board that comes back unreadable says so, in different words from being offline", async ({ page }) => {
    await page.route(`${API_URL}/board`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>not a board</html>" }),
    );
    await page.goto("/");

    const alert = page.locator("[data-canvas-state=error]").getByRole("alert");
    await expect(alert).toContainText("couldn't read");
    await expect(alert).not.toContainText("Check your connection");
    await expect(alert.getByRole("button", { name: "Reload" })).toBeVisible();
  });

  test("the chat rail shows its own three-placeholder skeleton while the board loads, and nothing moves when it lands", async ({
    page,
  }) => {
    await page.route(`${API_URL}/board`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/");

    const loading = page.getByRole("status", { name: "Loading the conversation" });
    await expect(loading).toBeVisible();
    await expect(page.locator("[data-chat-placeholder]")).toHaveCount(3);
    const rail = page.getByRole("complementary", { name: "Assistant" });
    const before = await rail.boundingBox();

    await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
    await expect(page.locator("[data-chat-placeholder]")).toHaveCount(0);
    await expect(page.getByText("Ask about your canvas, or ask me to draft something.")).toBeVisible();
    expect(await rail.boundingBox()).toEqual(before);
  });
});

test("a file dropped on the first-run panel is imported, not swallowed by it", async ({ page }) => {
  await freshSession(page);
  await openCanvas(page);
  const panelBox = (await page.getByRole("heading", { name: "Nothing on the canvas yet." }).boundingBox())!;
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
    return dt;
  });
  const init = { dataTransfer, clientX: panelBox.x + 10, clientY: panelBox.y + 10 };

  await page.getByRole("heading", { name: "Nothing on the canvas yet." }).dispatchEvent("dragenter", init);
  await page.getByRole("heading", { name: "Nothing on the canvas yet." }).dispatchEvent("dragover", init);
  await page.getByRole("heading", { name: "Nothing on the canvas yet." }).dispatchEvent("drop", init);

  await expect(page.locator('[data-node-card][data-type="asset"]')).toHaveCount(1);
});

test.describe("every delete is confirmed or can be undone", () => {
  let s: Session;
  test.beforeEach(async ({ page }) => {
    s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
  });

  test("a node: removed at once, with an Undo that brings it back with its connections", async ({ page }) => {
    await openCanvas(page);
    const nodesBefore = (await s.nodes()).length;
    const edgesBefore = (await s.edges()).length;

    await card(page, "nd_cmp_linen").click();
    await page.keyboard.press("Delete");

    await expect(page.getByText("Node deleted.")).toBeVisible();
    await expect.poll(async () => (await s.nodes()).length).toBe(nodesBefore - 1);

    await page.getByRole("status").filter({ hasText: "Node deleted." }).getByRole("button", { name: "Undo" }).click();

    await expect.poll(async () => (await s.nodes()).length).toBe(nodesBefore);
    await expect.poll(async () => (await s.edges()).length).toBe(edgesBefore);
    await expect(page.locator('[data-node-card][aria-label^="Vayn linen drop"]')).toHaveCount(1);
  });

  test("a connection: asks first, then removes, with an Undo", async ({ page }) => {
    await openCanvas(page, "/node/nd_str_icp");
    const before = (await s.edges()).length;

    await panel(page).getByRole("button", { name: "Remove connection to Vayn: 500 orders/month by Q4" }).click();
    expect((await s.edges()).length).toBe(before); // asked, not yet done
    await panel(page).getByRole("button", { name: "Remove", exact: true }).click();

    await expect.poll(async () => (await s.edges()).length).toBe(before - 1);
    await page
      .getByRole("status")
      .filter({ hasText: "Removed the connection" })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect.poll(async () => (await s.edges()).length).toBe(before);
  });

  test("an annotation: asks first, and Undo puts the note back", async ({ page }) => {
    await openCanvas(page, "/node/nd_con_linenstyle");
    const notes = async () => s.call<{ body: string }[]>("GET", "/nodes/nd_con_linenstyle/annotations");
    const [first] = await notes();

    await panel(page).getByRole("button", { name: "Delete annotation" }).click();
    expect(await notes()).toHaveLength(1); // asked, not yet done
    await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
    await expect.poll(async () => (await notes()).length).toBe(0);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await notes()).map((n) => n.body)).toEqual([first!.body]);
  });

  test("a file: asks first, and Undo reattaches it", async ({ page }) => {
    await openCanvas(page, "/node/nd_ast_lookbook");
    const fileIds = async () => (await s.nodes()).find((n) => n.id === "nd_ast_lookbook")!.fileIds;
    const before = await fileIds();
    expect(before).toHaveLength(1);

    await panel(page).getByRole("button", { name: "Remove vayn-lookbook.pdf" }).click();
    expect(await fileIds()).toEqual(before); // asked, not yet done
    await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
    await expect.poll(fileIds).toEqual([]);

    await page
      .getByRole("status")
      .filter({ hasText: "Removed vayn-lookbook.pdf" })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect.poll(fileIds).toEqual(before);
  });
});
