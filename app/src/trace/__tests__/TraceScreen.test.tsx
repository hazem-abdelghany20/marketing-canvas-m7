// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, emptyBoard, json, network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { edge, node, SEED_ANNOTATIONS, SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { CanvasNode, Edge } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard({ nodes: SEED_NODES, edges: SEED_EDGES, annotations: SEED_ANNOTATIONS });
  stubViewport(375);
});
afterEach(() => {
  cleanup();
  unstubViewport();
});

async function openTrace(path = "/") {
  const rendered = renderAt(path);
  await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return rendered;
}

const trace = () => within(screen.getByRole("region", { name: "Trace" }));
const row = (name: string | RegExp) => trace().getByRole("group", { name });
const card = (title: string) => trace().getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, `) });
const isCurrent = (el: HTMLElement) => el.getAttribute("aria-current") === "true";

describe("Trace on a board with goals", () => {
  it("opens on the first goal, with a row for each layer that serves it, and says which card is on screen in each", async () => {
    await openTrace();

    expect(row("Goal, 1 of 2")).toBeTruthy();
    expect(row("Strategy, 1 of 2")).toBeTruthy();
    expect(row("Campaign, 1 of 1")).toBeTruthy();
    expect(row("Content, 1 of 2")).toBeTruthy();
    for (const title of [
      "Vayn: 500 orders/month by Q4",
      "Vayn ICP: 25-34 urban women",
      "Vayn linen drop - September",
      "Reel: 3 ways to style linen",
    ]) {
      expect(isCurrent(card(title))).toBe(true);
    }
    expect(isCurrent(card("Mental Diet: 1,000 course completions by December"))).toBe(false);
    expect(trace().getByRole("heading", { level: 1, name: "Trace" })).toBeTruthy();
  });

  it("redraws every row under a goal when another goal is chosen", async () => {
    await openTrace();

    fireEvent.click(trace().getByRole("button", { name: "Goal 2" }));

    expect(row("Goal, 2 of 2")).toBeTruthy();
    expect(isCurrent(card("Mental Diet: 1,000 course completions by December"))).toBe(true);
    expect(row("Strategy, 1 of 1")).toBeTruthy();
    expect(card("Mental Diet voice: clinician, not coach")).toBeTruthy();
    expect(trace().queryByRole("button", { name: /^Vayn ICP/ })).toBeNull();
    expect(card("Reel: the 2am hunger loop")).toBeTruthy();
  });

  it("brings a card that is peeking in on screen when it is tapped, and redraws what is under it", async () => {
    await openTrace();
    const positioning = card("Vayn positioning: quiet luxury, not fast fashion");
    expect(isCurrent(positioning)).toBe(false);

    fireEvent.click(positioning);

    expect(isCurrent(card("Vayn positioning: quiet luxury, not fast fashion"))).toBe(true);
    expect(row("Strategy, 2 of 2")).toBeTruthy();
    expect(card("Vayn Ramadan push")).toBeTruthy();
    expect(card("Email: Ramadan lookbook drop")).toBeTruthy();
    expect(trace().queryByRole("button", { name: /^Vayn linen drop/ })).toBeNull();
  });

  it("moves along a row with the arrow keys, keeping focus on the card that comes on screen", async () => {
    await openTrace();
    const icp = card("Vayn ICP: 25-34 urban women");
    icp.focus();

    fireEvent.keyDown(icp, { key: "ArrowRight" });

    const positioning = card("Vayn positioning: quiet luxury, not fast fashion");
    expect(isCurrent(positioning)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(positioning));

    fireEvent.keyDown(positioning, { key: "ArrowLeft" });
    expect(isCurrent(card("Vayn ICP: 25-34 urban women"))).toBe(true);
  });

  it("opens a node's detail when the card on screen is tapped", async () => {
    const { router } = await openTrace();

    fireEvent.click(card("Vayn ICP: 25-34 urban women"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_str_icp"));
    expect(await screen.findByRole("complementary", { name: "Node detail" })).toBeTruthy();
  });

  it("tells a goal how many nodes sit under it, and the others how many serve them", async () => {
    await openTrace();

    expect(within(card("Vayn: 500 orders/month by Q4")).getByText("7 under it")).toBeTruthy();
    expect(within(card("Vayn ICP: 25-34 urban women")).getByText("1 campaign")).toBeTruthy();
    expect(within(card("Vayn linen drop - September")).getByText("2 pieces of content")).toBeTruthy();
  });

  it("shows what a card is joined to, and how many notes it carries, as chips", async () => {
    await openTrace();

    expect(within(card("Reel: 3 ways to style linen")).getByText("linen-shoot-hero.jpg")).toBeTruthy();
    expect(within(card("Reel: 3 ways to style linen")).getByText("1 note")).toBeTruthy();
    expect(within(card("Vayn: 500 orders/month by Q4")).getByText("1 note")).toBeTruthy();
    expect(within(card("Vayn positioning: quiet luxury, not fast fashion")).getByText("Competitor dropped price 20%")).toBeTruthy();
  });

  it("shows the type on every card of a row that mixes types, and labels the row 'Served by'", async () => {
    const direct: CanvasNode = node("nd_con_direct", "content", "A reel made straight for the goal");
    const edges: Edge[] = [...SEED_EDGES, edge(99, "nd_con_direct", "nd_goal_vayn")];
    serveBoard({ nodes: [...SEED_NODES, direct], edges, annotations: SEED_ANNOTATIONS });
    await openTrace();

    const mixed = row("Served by, 1 of 3");
    for (const el of within(mixed).getAllByRole("button")) {
      expect(el.querySelector("[data-type-chip]")).not.toBeNull();
    }
    // A row of one type does not repeat it on each card: the row's label says it.
    expect(card("Vayn linen drop - September").querySelector("[data-type-chip]")).toBeNull();
  });

  it("says nothing serves a card, under a goal that nothing serves", async () => {
    serveBoard({ nodes: [SEED_NODES[0]!], edges: [] });
    await openTrace();

    expect(row("Strategy, empty")).toBeTruthy();
    expect(within(row("Strategy, empty")).getByText("Nothing serves this yet.")).toBeTruthy();
  });

  it("asks nothing of content: no empty row under a piece of content", async () => {
    await openTrace();

    expect(trace().queryByText("Nothing serves this yet.")).toBeNull();
    expect(trace().getAllByRole("group")).toHaveLength(4);
  });
});

describe("Trace on a board with no goals", () => {
  it("says there are no goals yet, and how a trace starts", async () => {
    serveBoard({ nodes: SEED_NODES.filter((n) => n.type !== "goal"), edges: SEED_EDGES });
    await openTrace();

    expect(trace().getByText("No goals yet.")).toBeTruthy();
    expect(trace().getByText(COPY.traceNoGoalsBody)).toBeTruthy();
    expect(trace().queryAllByRole("group")).toHaveLength(0);
  });

  it("says the same on an empty board", async () => {
    serveBoard({ nodes: [], edges: [] });
    await openTrace();

    expect(trace().getByText("No goals yet.")).toBeTruthy();
    expect(trace().getByRole("button", { name: "Add a goal" })).toBeTruthy();
  });
});

describe("Trace before the board is there", () => {
  it("says the board didn't load, and offers to try again, when it did not", async () => {
    network.on("GET /board", () => apiError(500, "forced_failure", "Down."));
    renderAt("/");
    await screen.findByRole("navigation", { name: "Main" });

    expect(await trace().findByText(COPY.boardLoadFailed)).toBeTruthy();
    network.on("GET /board", () => json(200, emptyBoard));
    fireEvent.click(trace().getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  });
});

describe("remembering where Trace was", () => {
  it("keeps the chain on screen for this tab, in session storage and nowhere else", async () => {
    await openTrace();

    fireEvent.click(trace().getByRole("button", { name: "Goal 2" }));

    expect(sessionStorage.getItem("mc-trace-path")).toBe(JSON.stringify(["nd_goal_md"]));
    expect(Object.keys(localStorage).filter((key) => key !== "mc-session-token")).toEqual([]);
  });

  it("fills in the cards above one that is chosen lower down, so the whole chain is kept", async () => {
    await openTrace();

    fireEvent.click(card("Vayn positioning: quiet luxury, not fast fashion"));

    expect(sessionStorage.getItem("mc-trace-path")).toBe(JSON.stringify(["nd_goal_vayn", "nd_str_pos"]));
  });

  it("opens on the chain that was on screen when the page was last open in this tab", async () => {
    sessionStorage.setItem("mc-trace-path", JSON.stringify(["nd_goal_md"]));

    await openTrace();

    expect(isCurrent(card("Mental Diet: 1,000 course completions by December"))).toBe(true);
    expect(card("Reel: the 2am hunger loop")).toBeTruthy();
  });

  it("starts at the first goal when the node it remembered has gone, or what it kept makes no sense", async () => {
    sessionStorage.setItem("mc-trace-path", JSON.stringify(["nd_deleted"]));
    await openTrace();
    expect(isCurrent(card("Vayn: 500 orders/month by Q4"))).toBe(true);
    cleanup();

    sessionStorage.setItem("mc-trace-path", "{not json");
    uiStore.getState().reset();
    await openTrace();
    expect(isCurrent(card("Vayn: 500 orders/month by Q4"))).toBe(true);
  });
});

describe("Undo on Trace", () => {
  it("is there, and says there is nothing to undo while there is nothing", async () => {
    await openTrace();

    const undo = trace().getByRole("button", { name: "Undo" });

    expect(undo.getAttribute("aria-disabled")).toBe("true");
    expect(undo.title).toBe(COPY.nothingToUndo);
  });
});
