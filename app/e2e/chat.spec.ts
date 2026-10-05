import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { demoSession, openCanvas } from "./support";

const canvasArea = (page: Page) => page.locator("[data-canvas-state=ready]");
const rail = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const sendButton = (page: Page) => page.getByRole("button", { name: "Send" });
// Direct children only: a reply's own markdown lists have list items too.
const messages = (page: Page) => page.getByRole("list", { name: "Conversation" }).locator(":scope > li");

const WAIT_FOR_REPLY = "Wait for the current reply to finish.";
const FAILED = "That reply didn't finish. Try again.";

/** Holds every POST /chat for `ms` before letting it through, so the streaming state can be looked at. */
async function holdChat(page: Page, ms: number) {
  await page.route(`${API_URL}/chat`, async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

test.beforeEach(async ({ page }) => {
  await demoSession(page);
});

test("a question streams in as a reply, and the composer is free again when it is done", async ({ page }) => {
  await openCanvas(page);

  await ask(page, "What serves the Ramadan push?");

  await expect(messages(page).first()).toContainText("What serves the Ramadan push?");
  // The mock librarian always signs off the same way, so this is the end of a finished reply.
  await expect(messages(page).nth(1)).toContainText("highlighted them on the canvas");
  await expect(messages(page).nth(1).locator("strong").first()).toBeVisible(); // markdown, not asterisks
  await expect(messages(page).nth(1)).not.toContainText("**");
  await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(composer(page)).toHaveValue("");
});

test("Shift+Enter adds a line and sends nothing", async ({ page }) => {
  await openCanvas(page);

  await composer(page).fill("first line");
  await composer(page).press("Shift+Enter");
  await page.keyboard.type("second line");

  await expect(composer(page)).toHaveValue("first line\nsecond line");
  await page.waitForTimeout(400);
  await expect(page.getByRole("list", { name: "Conversation" })).toHaveCount(0);
});

test("the composer, Send and the Add menu's From chat all stand still until the reply is done", async ({ page }) => {
  await holdChat(page, 1500);
  await openCanvas(page);

  await ask(page, "What serves the Ramadan push?");

  await expect(composer(page)).toHaveAttribute("aria-disabled", "true");
  await expect(sendButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(sendButton(page)).toHaveAttribute("title", WAIT_FOR_REPLY);
  await page.getByRole("button", { name: "Add node" }).click();
  const fromChat = page.getByRole("menuitem", { name: /^From chat/ });
  await expect(fromChat).toHaveAttribute("aria-disabled", "true");
  await expect(fromChat).toHaveAttribute("title", WAIT_FOR_REPLY);
  await page.keyboard.press("Escape");

  await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Add node" }).click();
  await expect(page.getByRole("menuitem", { name: /^From chat/ })).not.toHaveAttribute("aria-disabled", "true");
});

test("a reply the server cuts off says so, keeps your message, and Retry asks again", async ({ page }) => {
  await openCanvas(page);
  await page.route(`${API_URL}/chat`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body:
            'event: start\ndata: {"mode":"librarian"}\n\n' +
            'event: token\ndata: {"token":"Half a "}\n\n' +
            'event: error\ndata: {"code":"stream_failed","message":"The response was interrupted."}\n\n',
        })
      : route.continue(),
  );

  await ask(page, "What serves the Ramadan push?");

  await expect(page.getByText(FAILED)).toBeVisible();
  await expect(messages(page).first()).toContainText("What serves the Ramadan push?");
  await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");

  await page.unroute(`${API_URL}/chat`);
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(messages(page).nth(1)).toContainText("highlighted them on the canvas");
  await expect(page.getByText(FAILED)).toHaveCount(0);
  await expect(messages(page)).toHaveCount(2); // one question, one reply: Retry did not add a second question
});

test("the mock API's own failure mode (__fail) ends the same way", async ({ page }) => {
  await openCanvas(page);

  await ask(page, "What serves linen? __fail");

  await expect(page.getByText(FAILED)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(messages(page).first()).toContainText("What serves linen? __fail");
});

test("with no messages the rail offers three examples; clicking one fills the composer without sending", async ({
  page,
}) => {
  await openCanvas(page);
  await expect(page.getByText("Ask about your canvas, or ask me to draft something.")).toBeVisible();
  const examples = page.getByRole("list", { name: "Example prompts" }).getByRole("button");
  await expect(examples).toHaveCount(3);

  await examples.first().click();

  const prompt = await composer(page).inputValue();
  expect(prompt.length).toBeGreaterThan(10);
  expect(await examples.first().innerText()).toContain(prompt);
  await expect(composer(page)).toBeFocused();
  await page.waitForTimeout(400);
  await expect(page.getByRole("list", { name: "Conversation" })).toHaveCount(0);
});

test("each example prompt gets the kind of answer it promises, on the seeded board", async ({ page }) => {
  const s = await demoSession(page);
  await openCanvas(page);
  const examples = page.getByRole("list", { name: "Example prompts" }).getByRole("button");
  await expect(examples).toHaveCount(3);
  // Generator, Librarian, Operator: a proposed node, cited nodes, a proposed connection.
  const shapes = [/"kind":"create-node"/, /"citedNodeIds":\["nd_[^\]]+\]/, /"kind":"create-edge"/];
  const prompts: string[] = [];
  for (let i = 0; i < 3; i++) {
    await examples.nth(i).click();
    prompts.push(await composer(page).inputValue());
  }
  const nodesBefore = (await s.nodes()).length;

  for (const [i, prompt] of prompts.entries()) {
    const reply = page.waitForResponse((r) => r.url().endsWith("/chat") && r.request().method() === "POST");
    await composer(page).fill(prompt);
    await composer(page).press("Enter");
    expect(await (await reply).text(), prompt).toMatch(shapes[i]!);
    await expect(composer(page)).not.toHaveAttribute("aria-disabled", "true");
  }
  expect((await s.nodes()).length).toBe(nodesBefore); // a reply proposes; it does not build
});

test("the rail is a 360px column beside the canvas, and a collapse survives a reload", async ({ page }) => {
  await openCanvas(page);
  const view = page.viewportSize()!;
  const expanded = (await canvasArea(page).boundingBox())!;
  expect((await rail(page).boundingBox())!.width).toBe(360);
  expect(expanded.x).toBe(360);
  expect(expanded.width).toBe(view.width - 360);

  await page.getByRole("button", { name: "Collapse assistant" }).click();
  await expect(composer(page)).toHaveCount(0);
  expect((await canvasArea(page).boundingBox())!.x).toBe(48);
  expect((await canvasArea(page).boundingBox())!.width).toBe(view.width - 48);

  await page.reload();
  await expect(page.getByRole("button", { name: "Open assistant" })).toBeVisible();
  await expect(composer(page)).toHaveCount(0);
  expect((await canvasArea(page).boundingBox())!.x).toBe(48);

  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(composer(page)).toBeVisible();
});

test("From chat in the Add menu opens the rail if it is collapsed and focuses the composer", async ({ page }) => {
  await openCanvas(page);
  await page.getByRole("button", { name: "Collapse assistant" }).click();

  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("menuitem", { name: /^From chat/ }).click();

  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveValue("");
});

test("below 900px the rail is a sheet laid over the canvas, opened from a floating button", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await openCanvas(page);
  const canvas = (await canvasArea(page).boundingBox())!;
  expect(canvas).toMatchObject({ x: 0, width: 800 }); // nothing is taken from the canvas
  await expect(composer(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Open assistant" }).click();

  await expect(composer(page)).toBeVisible();
  const sheet = (await rail(page).boundingBox())!;
  expect(sheet.x).toBe(0);
  expect(sheet.width).toBeLessThanOrEqual(360);
  expect(await canvasArea(page).boundingBox()).toEqual(canvas); // still full-bleed underneath

  await page.keyboard.press("Escape");
  await expect(composer(page)).toHaveCount(0);
});
