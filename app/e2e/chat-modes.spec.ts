import { expect, test, type Page } from "@playwright/test";
import { demoSession, freshSession, openCanvas } from "./support";

const rail = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
const mode = (page: Page, name: string) => rail(page).getByRole("radiogroup", { name: "Reply mode" }).getByRole("radio", { name });
const ask = async (page: Page, text: string) => {
  await rail(page).getByRole("textbox", { name: "Message" }).fill(text);
  await rail(page).getByRole("button", { name: "Send" }).click();
};
const reply = (page: Page) => rail(page).getByRole("status", { name: "Assistant reply" }).last();
const cited = (page: Page) => page.locator("[data-node-card][data-cited]");

test.describe("the chat mode picker, against the real API", () => {
  test("offers four modes with Auto chosen, and no Operator", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);

    const group = rail(page).getByRole("radiogroup", { name: "Reply mode" });
    await expect(group.getByRole("radio")).toHaveText(["Auto", "Generator", "Librarian", "Reasoner"]);
    await expect(mode(page, "Auto")).toHaveAttribute("aria-checked", "true");
    await expect(rail(page).getByText(/operator/i)).toHaveCount(0);
  });

  test("Auto sends no mode, and the server's own choice is shown on the reply", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    const bodies: unknown[] = [];
    page.on("request", (r) => r.url().endsWith("/chat") && bodies.push(r.postDataJSON()));

    await ask(page, "what serves the Ramadan push?");

    await expect(rail(page).getByText("Assistant · librarian")).toBeVisible();
    expect(bodies).toEqual([{ message: "what serves the Ramadan push?" }]);
  });

  test("a message that would be a Generator's is answered by the Librarian when that is chosen, with no proposal", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await mode(page, "Librarian").click();

    await ask(page, "Draft a reel script about linen care");

    await expect(rail(page).getByText("Assistant · librarian")).toBeVisible();
    await expect(rail(page).getByRole("button", { name: "Add to canvas" })).toHaveCount(0);
  });

  test("the Reasoner names the disconnected node, and the canvas marks it", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await mode(page, "Reasoner").click();

    await ask(page, "how is the board doing?");

    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();
    // The seeded board has one node connected to nothing: the IG reach note.
    await expect(reply(page)).toContainText("IG reach down 30% since the algo change");
    await expect(cited(page)).toHaveCount(1);
    await expect(cited(page)).toHaveAttribute("data-node-card", "nd_not_reach");
    await expect(rail(page).getByRole("button", { name: "IG reach down 30% since the algo change" })).toBeVisible();
    await expect(rail(page).getByRole("button", { name: "Add to canvas" })).toHaveCount(0);
  });

  test("the Reasoner on an empty board says so, and marks nothing", async ({ page }) => {
    await freshSession(page);
    await openCanvas(page);
    await mode(page, "Reasoner").click();

    await ask(page, "how is the board doing?");

    await expect(reply(page)).toContainText("board is empty");
    await expect(cited(page)).toHaveCount(0);
  });

  test("the picker waits while a reply streams, and the choice survives collapsing the rail", async ({ page }) => {
    await demoSession(page);
    await openCanvas(page);
    await mode(page, "Reasoner").click();

    await ask(page, "how is the board doing?");
    await expect(mode(page, "Generator")).toHaveAttribute("aria-disabled", "true");
    await expect(rail(page).getByText("Assistant · reasoner")).toBeVisible();
    await expect(mode(page, "Generator")).not.toHaveAttribute("aria-disabled", "true");

    await rail(page).getByRole("button", { name: "Collapse assistant" }).click();
    await page.getByRole("button", { name: "Open assistant" }).click();
    await expect(mode(page, "Reasoner")).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(mode(page, "Reasoner")).toHaveAttribute("aria-checked", "true");
  });
});
