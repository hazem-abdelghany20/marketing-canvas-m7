import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { demoSession, freshSession, openCanvas, setViewport } from "./support";

const rail = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
const sendBoard = (page: Page) => page.getByRole("button", { name: "Send board to the assistant" });
const reply = (page: Page) => rail(page).getByRole("status", { name: "Assistant reply" }).last();
const mine = (page: Page) => rail(page).locator('[data-chat-message="user"]').last();

test.describe("sending the marked-up board to the assistant, against the real API", () => {
  test("the reply is about this board's own marks: it names the circled node and quotes the sticky and the thread", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await sendBoard(page).click();

    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();
    await expect(reply(page)).toContainText("Vayn linen drop - September");
    await expect(reply(page)).toContainText("Reel: 3 ways to style linen");
    await expect(reply(page)).toContainText("The hook is the whole reel");
    await expect(reply(page)).toContainText("This one carried the whole drop");
    await expect(reply(page)).toContainText("Rania");
  });

  test("the nodes it names are cited, marked on the canvas, and offered as chips", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await sendBoard(page).click();

    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();
    await expect(page.locator('[data-node-card="nd_cmp_linen"][data-cited]')).toHaveCount(1);
    await expect(page.locator('[data-node-card="nd_con_linenstyle"][data-cited]')).toHaveCount(1);
    await expect(page.locator('[data-node-card="nd_goal_md"][data-cited]')).toHaveCount(0);
    await expect(rail(page).getByRole("button", { name: "Vayn linen drop - September" })).toBeVisible();
  });

  test("your message carries a real picture of the board, small enough to send", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    let sent = "";
    page.on("request", (r) => r.url().endsWith("/chat") && (sent = r.postData() ?? ""));

    await sendBoard(page).click();
    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();

    const body = JSON.parse(sent) as { message: string; board: { image: string }; mode?: string };
    expect(body.message).toBe("Read my markup on the board.");
    expect("mode" in body).toBe(false);
    expect(body.board.image.startsWith("data:image/png;base64,")).toBe(true);
    // The API refuses a body over 2MB, and a board read has no use for 2x detail.
    expect(sent.length).toBeLessThan(1_800_000);
    const image = mine(page).getByRole("img", { name: "Your board, as sent" });
    await expect(image).toBeVisible();
    const size = await image.evaluate((el) => ({ w: (el as HTMLImageElement).naturalWidth, h: (el as HTMLImageElement).naturalHeight }));
    expect(size.w).toBeGreaterThan(300);
    expect(Math.max(size.w, size.h)).toBeLessThanOrEqual(1600);
  });

  test("is disabled for a board with nodes but no ink and no notes", async ({ page }) => {
    const s = await freshSession(page);
    await s.createNode({ title: "A goal", type: "goal", x: 100, y: 100 });
    await openCanvas(page);

    await expect(sendBoard(page)).toHaveAttribute("aria-disabled", "true");
    await expect(sendBoard(page)).toHaveAttribute("title", "Draw or add a note first.");
  });

  test("becomes available as soon as a note is written, and the reply quotes it", async ({ page }) => {
    const s = await freshSession(page);
    await s.createNode({ title: "Launch email", type: "content", x: 120, y: 160 });
    await s.call("POST", "/marks", { variant: "sticky", x: 150, y: 330, body: "Move the CTA above the fold" });
    await setViewport(s, { x: 0, y: 0, zoom: 1 });
    await openCanvas(page);

    await expect(sendBoard(page)).not.toHaveAttribute("aria-disabled", "true");
    await sendBoard(page).click();

    await expect(reply(page)).toContainText("Move the CTA above the fold");
    await expect(reply(page)).toContainText("Launch email");
  });

  test("waits while the reply streams", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await sendBoard(page).click();

    await expect(sendBoard(page)).toHaveAttribute("title", "Wait for the current reply to finish.");
    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();
    await expect(sendBoard(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("a failed reply keeps your message and its picture, and Retry sends it again", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await page.route(`${API_URL}/chat`, (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
        body: 'event: start\ndata: {"mode":"reasoner"}\n\nevent: error\ndata: {"code":"stream_failed","message":"x"}\n\n',
      }),
    );

    await sendBoard(page).click();

    await expect(rail(page).getByText("That reply didn't finish. Try again.")).toBeVisible();
    await expect(mine(page).getByRole("img", { name: "Your board, as sent" })).toBeVisible();
    await expect(mine(page)).toContainText("Read my markup on the board.");
    await expect(rail(page).getByRole("textbox", { name: "Message" })).toBeEditable();

    await page.unroute(`${API_URL}/chat`);
    await rail(page).getByRole("button", { name: "Retry" }).click();

    await expect(reply(page)).toContainText("The hook is the whole reel");
    await expect(rail(page).locator('[data-chat-message="user"]')).toHaveCount(1);
  });
});
