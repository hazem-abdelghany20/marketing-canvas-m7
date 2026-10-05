import { expect, test, type Page } from "@playwright/test";
import { card, demoSession, freshSession, openCanvas, setViewport, type Session } from "./support";

// The seeded board: twelve nodes on content → campaign → strategy → goal chains,
// and four with no serves edge (two assets and two notes, linked only by relates-to or not at all).
const GOALS = ["nd_goal_vayn", "nd_goal_md"];
const STRATEGIES = ["nd_str_icp", "nd_str_pos", "nd_str_voice"];
const CAMPAIGNS = ["nd_cmp_ramadan", "nd_cmp_linen", "nd_cmp_ee"];
const CONTENT = ["nd_con_linenstyle", "nd_con_quiet", "nd_con_2am", "nd_con_email"];
const LOOSE = ["nd_ast_lookbook", "nd_ast_hero", "nd_not_price", "nd_not_reach"];
const CARD_HEIGHT = 140;

const arrangeButton = (page: Page) => page.getByRole("toolbar").getByRole("button", { name: "Auto-arrange" });

type Positions = Record<string, { x: number; y: number }>;

async function positions(s: Session): Promise<Positions> {
  return Object.fromEntries((await s.nodes()).map((n) => [n.id, { x: n.x, y: n.y }]));
}

/** Clicks Auto-arrange and waits for the toast, which only appears once every save has landed. */
async function arrange(page: Page) {
  await arrangeButton(page).click();
  await expect(page.getByText("Arranged 16 nodes.")).toBeVisible();
}

const ys = (at: Positions, ids: string[]) => ids.map((id) => at[id]!.y);

/** A box that has stopped moving: the camera glides for a moment after an arrange. */
async function settledBox(page: Page, id: string) {
  let last = JSON.stringify(await card(page, id).boundingBox());
  for (let steady = 0; steady < 3;) {
    await page.waitForTimeout(120);
    const now = JSON.stringify(await card(page, id).boundingBox());
    steady = now === last ? steady + 1 : 0;
    last = now;
  }
  return JSON.parse(last) as { x: number; y: number; width: number; height: number };
}

test("on a board with no nodes the control is non-interactive and says why", async ({ page }) => {
  await freshSession(page);
  await openCanvas(page);

  await expect(arrangeButton(page)).toHaveAttribute("aria-disabled", "true");
  await expect(arrangeButton(page)).toHaveAttribute("title", "Nothing to arrange yet.");
});

let s: Session;

test.describe("on the seeded board", () => {
  test.beforeEach(async ({ page }) => {
    s = await demoSession(page);
    await setViewport(s, { x: 0, y: 0, zoom: 0.5 });
  });

  test("lays the seeded board out in layers: goals, strategies, campaigns, content", async ({ page }) => {
    await openCanvas(page);

    await arrange(page);
    const at = await positions(s);

    for (const row of [GOALS, STRATEGIES, CAMPAIGNS, CONTENT]) expect(new Set(ys(at, row)).size).toBe(1);
    expect(at.nd_goal_vayn!.y).toBeLessThan(at.nd_str_icp!.y);
    expect(at.nd_str_icp!.y).toBeLessThan(at.nd_cmp_linen!.y);
    expect(at.nd_cmp_linen!.y).toBeLessThan(at.nd_con_quiet!.y);
  });

  test("puts the nodes with no serves edge in one row beneath the layers, and omits none", async ({ page }) => {
    await openCanvas(page);

    await arrange(page);
    const at = await positions(s);

    expect(Object.keys(at)).toHaveLength(16);
    expect(new Set(ys(at, LOOSE)).size).toBe(1);
    expect(at.nd_ast_hero!.y).toBeGreaterThanOrEqual(at.nd_con_quiet!.y + CARD_HEIGHT);
  });

  test("brings the whole arrangement into view", async ({ page }) => {
    await setViewport(s, { x: 4000, y: 4000, zoom: 1 }); // looking at empty space
    const canvas = await openCanvas(page);
    const area = (await canvas.boundingBox())!;
    const toolbar = (await page.getByRole("toolbar").boundingBox())!;
    const everyCard = [...GOALS, ...STRATEGIES, ...CAMPAIGNS, ...CONTENT, ...LOOSE];
    const inView = async () => {
      const boxes = await Promise.all(everyCard.map((id) => card(page, id).boundingBox()));
      return boxes.every(
        (b) =>
          b &&
          b.x >= area.x &&
          b.y >= area.y &&
          b.x + b.width <= area.x + area.width &&
          b.y + b.height <= area.y + area.height &&
          // and not tucked under the floating toolbar
          (b.y >= toolbar.y + toolbar.height || b.x + b.width <= toolbar.x || b.x >= toolbar.x + toolbar.width),
      );
    };
    expect(await inView()).toBe(false); // the camera starts out looking at empty space

    await arrange(page);

    await expect.poll(inView).toBe(true);
  });

  test("one Cmd/Ctrl+Z puts every node back where it was", async ({ page }) => {
    await openCanvas(page);
    const before = await positions(s);

    await arrange(page);
    expect(await positions(s)).not.toEqual(before);
    await page.keyboard.press("ControlOrMeta+z");

    await expect.poll(() => positions(s)).toEqual(before);
  });

  test("a node dragged after arranging stays where it is dropped, and nothing re-arranges", async ({ page }) => {
    await openCanvas(page);
    await arrange(page);
    const arranged = await positions(s);

    const box = await settledBox(page, "nd_goal_vayn");
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 90, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await positions(s)).nd_goal_vayn!.x).not.toBe(arranged.nd_goal_vayn!.x);
    const dropped = await positions(s);

    // Every other node is exactly where Auto-arrange left it...
    for (const id of Object.keys(arranged)) {
      if (id !== "nd_goal_vayn") expect(dropped[id]).toEqual(arranged[id]);
    }
    // ...and stays there: arranging is an action, not a mode.
    await page.waitForTimeout(1200);
    expect(await positions(s)).toEqual(dropped);
  });

  /**
   * Clicks Auto-arrange from inside the page, so no round trip to the test runner
   * lands between the click and the next frame, and reads every card's transform
   * on that first frame and again once things have settled.
   */
  async function firstFrameAfterArrange(page: Page) {
    return page.evaluate(async () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"));
      const read = () => Object.fromEntries(cards.map((c) => [c.dataset.id!, c.style.transform]));
      const before = read();
      document.querySelector<HTMLButtonElement>('[role=toolbar] button[aria-label="Auto-arrange"]')!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = read();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return { before, first, final: read() };
    });
  }

  const stillMoving = (frames: { first: Record<string, string>; final: Record<string, string> }) =>
    Object.keys(frames.final).filter((id) => frames.first[id] !== frames.final[id]).length;

  test("with motion allowed the cards are still travelling on the first frame (so the reduced-motion test below can fail)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openCanvas(page);

    const frames = await firstFrameAfterArrange(page);

    expect(frames.final).not.toEqual(frames.before);
    expect(stillMoving(frames)).toBeGreaterThan(0);
  });

  test("with reduced motion every card is already at its new place on the first frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCanvas(page);

    const frames = await firstFrameAfterArrange(page);

    expect(frames.final).not.toEqual(frames.before);
    expect(stillMoving(frames)).toBe(0);
  });
});
