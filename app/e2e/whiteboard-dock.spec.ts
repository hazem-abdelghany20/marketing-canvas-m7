import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { demoSession, freshSession, openCanvas } from "./support";

const dock = (page: Page) => page.getByRole("group", { name: "Whiteboard tools" });
const tool = (page: Page, name: string) => dock(page).getByRole("button", { name });
const hint = (page: Page) => page.locator("[data-tool-hint]");

test.describe("the whiteboard dock", () => {
  test("a tool key selects the tool, shows its hint, and Escape puts it away", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
    await expect(hint(page)).toHaveCount(0);

    for (const [key, name] of [["p", "Pen"], ["h", "Highlighter"], ["e", "Eraser"], ["s", "Sticky"], ["t", "Text"], ["c", "Comment"]] as const) {
      await page.keyboard.press(key);
      await expect(tool(page, name)).toHaveAttribute("aria-pressed", "true");
      await expect(hint(page)).toContainText(name);
      await expect(hint(page).getByRole("button", { name: /esc/i })).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
    await expect(hint(page)).toHaveCount(0);
  });

  test("a letter typed into the chat composer is a letter, not a tool", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await page.getByRole("textbox", { name: "Message" }).fill("");
    await page.getByRole("textbox", { name: "Message" }).press("p");

    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("p");
    await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  });

  test("on a board with no ink the Eraser is disabled, and Clear ink is not there at all", async ({ page }) => {
    await freshSession(page);
    await openCanvas(page);

    await expect(tool(page, "Eraser")).toHaveAttribute("aria-disabled", "true");
    await expect(tool(page, "Eraser")).toHaveAttribute("title", "Nothing to erase yet.");
    await expect(page.getByRole("button", { name: "Clear ink" })).toHaveCount(0);
    await page.keyboard.press("e");
    await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  });

  test("the seeded demo board has ink, so the Eraser can be picked", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await expect(tool(page, "Eraser")).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("e");
    await expect(tool(page, "Eraser")).toHaveAttribute("aria-pressed", "true");
  });

  test("every tool waits, saying so, while the board is loading", async ({ page }) => {
    await demoSession(page);
    await page.route(`${API_URL}/board`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/");

    await expect(dock(page)).toBeVisible();
    for (const name of ["Select", "Pen", "Highlighter", "Eraser", "Sticky", "Text", "Comment"]) {
      await expect(tool(page, name)).toHaveAttribute("title", "Waiting for the board.");
      await expect(tool(page, name)).toHaveAttribute("aria-disabled", "true");
    }
    await expect(page.locator("[data-canvas-state=ready]")).toBeVisible();
    await expect(tool(page, "Pen")).not.toHaveAttribute("aria-disabled", "true");
  });

  test("connect mode (now L) disables the drawing tools until it is finished", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await page.keyboard.press("p");

    await page.keyboard.press("l");

    await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
    for (const name of ["Pen", "Highlighter", "Eraser"]) {
      await expect(tool(page, name)).toHaveAttribute("title", "Finish connecting first.");
    }
    await page.keyboard.press("Escape");
    await expect(tool(page, "Pen")).not.toHaveAttribute("aria-disabled", "true");
  });

  test("Tab reaches every tool in the dock, in order, with a visible focus ring", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    await tool(page, "Select").focus();
    for (const name of ["Pen", "Highlighter", "Eraser", "Sticky", "Text", "Comment"]) {
      await page.keyboard.press("Tab");
      await expect(tool(page, name)).toBeFocused();
      const ring = await tool(page, name).evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(ring).not.toBe("none");
    }
  });
});
