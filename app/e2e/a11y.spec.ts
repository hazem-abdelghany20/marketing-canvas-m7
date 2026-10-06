import { expect, test } from "@playwright/test";
import { demoSession, openCanvas, setViewport } from "./support";
import { structuralProblems } from "./structure";

test("the check itself can fail: it finds an unnamed button, an image with no alt and a dangling aria reference", async ({
  page,
}) => {
  await page.setContent(
    '<html><body><button></button><img src="x.png"><input aria-describedby="nope" aria-label="x"></body></html>',
  );

  const problems = await structuralProblems(page);

  expect(problems.join("\n")).toContain("html has no lang");
  expect(problems.join("\n")).toContain("no main landmark");
  expect(problems.join("\n")).toContain("no accessible name: button");
  expect(problems.join("\n")).toContain("img without alt");
  expect(problems.join("\n")).toContain("aria-describedby points at a missing #nope");
});

test.beforeEach(async ({ page }) => {
  const s = await demoSession(page);
  await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
});

test("the sign-in and sign-up screens have no structural problems", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("mc-session-token"));
  for (const path of ["/signin", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await structuralProblems(page), path).toEqual([]);
  }
});

test("the workspace has no structural problems", async ({ page }) => {
  await openCanvas(page);

  expect(await structuralProblems(page)).toEqual([]);
});

test("the workspace with a node panel, a quick-peek, search and a conversation open has none either", async ({
  page,
}) => {
  await openCanvas(page, "/node/nd_str_icp");
  expect(await structuralProblems(page), "node panel").toEqual([]);

  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Message" }).fill("What serves the Ramadan push?");
  await page.getByRole("textbox", { name: "Message" }).press("Enter");
  await expect(page.getByRole("list", { name: "Cited nodes" })).toBeVisible();
  expect(await structuralProblems(page), "conversation").toEqual([]);

  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.getByRole("dialog", { name: "Search nodes" })).toBeVisible();
  expect(await structuralProblems(page), "search").toEqual([]);
});

// 640px to 900px is the tablet layout, where the assistant is a sheet over the canvas. Below 640px it is the phone's
// (see phone-a11y.spec.ts), where the assistant is a screen.
test("the workspace between 640px and 900px, with the chat sheet open, has none", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openCanvas(page);
  expect(await structuralProblems(page), "narrow").toEqual([]);

  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  expect(await structuralProblems(page), "sheet").toEqual([]);
});
