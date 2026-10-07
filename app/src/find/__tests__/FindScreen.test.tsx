// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { json, network, renderAt, resetApp, serveBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { SEED_ANNOTATIONS, SEED_EDGES, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import { uiStore } from "../../ui/uiStore";

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  stubViewport(375);
});
afterEach(() => {
  cleanup();
  unstubViewport();
});

async function openFind(
  content: Parameters<typeof serveBoard>[0] = { nodes: SEED_NODES, edges: SEED_EDGES, annotations: SEED_ANNOTATIONS },
) {
  serveBoard(content);
  const rendered = renderAt("/");
  const nav = await screen.findByRole("navigation", { name: "Main" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  fireEvent.click(within(nav).getByRole("button", { name: "Find" }));
  return rendered;
}

const find = () => within(screen.getByRole("region", { name: "Find" }));
const field = () => screen.getByRole("searchbox", { name: "Find a node" }) as HTMLInputElement;
const row = (title: string) =>
  find().getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

describe("the Find screen with nothing typed", () => {
  it("has a title, a field, a filter for every type, and the nodes in groups", async () => {
    await openFind();

    expect(find().getByRole("heading", { level: 1, name: "Find" })).toBeTruthy();
    expect(field().placeholder).toBe("Find a node to trace");
    const filters = within(find().getByRole("radiogroup", { name: "Type" })).getAllByRole("radio");
    expect(filters.map((el) => el.textContent)).toEqual([
      `All ${SEED_NODES.length}`,
      "Goals",
      "Campaigns",
      "Content",
      "Strategies",
      "Assets",
      "Notes",
    ]);
    expect(filters[0]!.getAttribute("aria-checked")).toBe("true");
    const headings = find()
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Goals", "Content", "Not connected to a goal"]);
  });

  it("says how each node connects, on its row", async () => {
    await openFind();

    expect(within(row("Vayn: 500 orders/month by Q4")).getByText("7 under it")).toBeTruthy();
    expect(within(row("Reel: 3 ways to style linen")).getByText("trace →")).toBeTruthy();
    expect(within(row("IG reach down 30% since the algo change")).getByText("no links")).toBeTruthy();
    expect(within(row("Competitor dropped price 20%")).getByText("relates only")).toBeTruthy();
  });

  it("has a field that is 16px, so the browser does not zoom the page when it takes focus", async () => {
    await openFind();

    expect(field().className).toMatch(/\btext-base\b/);
  });
});

describe("choosing a node", () => {
  it("shows Trace on a goal that is chosen", async () => {
    await openFind();

    fireEvent.click(row("Mental Diet: 1,000 course completions by December"));

    expect(uiStore.getState().phoneTab).toBe("trace");
    expect(uiStore.getState().tracePath).toEqual(["nd_goal_md"]);
  });

  it("lines Trace up on the whole chain of a node that reaches a goal", async () => {
    await openFind();

    fireEvent.click(row("Email: Ramadan lookbook drop"));

    expect(uiStore.getState().phoneTab).toBe("trace");
    expect(uiStore.getState().tracePath).toEqual(["nd_goal_vayn", "nd_str_pos", "nd_cmp_ramadan", "nd_con_email"]);
    const trace = within(screen.getByRole("region", { name: "Trace" }));
    expect(trace.getByRole("button", { name: /^Email: Ramadan lookbook drop, / }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(trace.getByRole("group", { name: "Strategy, 2 of 2" })).toBeTruthy();
  });

  it("opens a node that no goal is above, since there is no chain to show", async () => {
    const { router } = await openFind();

    fireEvent.click(row("IG reach down 30% since the algo change"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_not_reach"));
    expect(uiStore.getState().phoneTab).toBe("find");
  });
});

describe("the Find screen with something typed", () => {
  it("gives way to the matches, each with its type and the start of its body", async () => {
    await openFind();

    type("linen");

    expect(find().queryByRole("heading", { level: 2 })).toBeNull();
    const reel = row("Reel: 3 ways to style linen");
    expect(reel.textContent).toContain("Content");
    expect(reel.textContent).toContain("Hook lands at 0:02");
    expect(find().getAllByRole("button", { name: /linen/i }).length).toBeGreaterThanOrEqual(3);
  });

  it("chooses the first match when Enter is pressed", async () => {
    await openFind();
    type("ramadan");

    fireEvent.keyDown(field(), { key: "Enter" });

    expect(uiStore.getState().phoneTab).toBe("trace");
    expect(uiStore.getState().tracePath).toEqual(["nd_goal_vayn", "nd_str_pos", "nd_cmp_ramadan"]);
  });

  it("does nothing on Enter when nothing matches", async () => {
    await openFind();
    type("zzzz");

    fireEvent.keyDown(field(), { key: "Enter" });

    expect(uiStore.getState().phoneTab).toBe("find");
  });

  it("says what matched nothing, and offers to make a note with that title", async () => {
    network.on("POST /nodes", (call) =>
      json(201, {
        ...(call.body as object),
        id: "nd_new",
        body: "",
        fileIds: [],
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      }),
    );
    const { router } = await openFind();
    type("a brand new thought");

    expect(find().getByText("No nodes match “a brand new thought”.")).toBeTruthy();
    fireEvent.click(find().getByRole("button", { name: "Create a note with this title" }));

    await waitFor(() => expect(network.callsTo("POST /nodes")).toHaveLength(1));
    expect(network.callsTo("POST /nodes")[0]!.body).toMatchObject({ type: "note", title: "a brand new thought" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/node/nd_new"));
  });

  it("goes by the filter as well", async () => {
    await openFind();
    type("linen");

    fireEvent.click(find().getByRole("radio", { name: "Content" }));

    expect(find().getAllByRole("button", { name: /linen/i })).toHaveLength(1);
    expect(row("Reel: 3 ways to style linen")).toBeTruthy();
  });
});

describe("the Find screen with a type chosen", () => {
  it("lists every node of the type, connected or not, saying how each connects", async () => {
    await openFind();

    fireEvent.click(find().getByRole("radio", { name: "Notes" }));

    expect(find().getByRole("radio", { name: "Notes" }).getAttribute("aria-checked")).toBe("true");
    expect(find().queryByRole("heading", { level: 2 })).toBeNull();
    expect(row("Competitor dropped price 20%")).toBeTruthy();
    expect(within(row("IG reach down 30% since the algo change")).getByText("no links")).toBeTruthy();
    expect(find().queryByRole("button", { name: /^Reel/ })).toBeNull();
  });

  it("says there are none of a type, when there are none", async () => {
    await openFind({
      nodes: SEED_NODES.filter((n) => n.type !== "note"),
      edges: SEED_EDGES.filter((e) => e.kind === "serves"),
    });

    fireEvent.click(find().getByRole("radio", { name: "Notes" }));

    expect(find().getByText("No notes yet.")).toBeTruthy();
  });

  it("moves between the filters with the arrow keys, as the reply modes do", async () => {
    await openFind();
    const all = find().getByRole("radio", { name: new RegExp("^All") });
    all.focus();

    fireEvent.keyDown(all, { key: "ArrowRight" });

    expect(find().getByRole("radio", { name: "Goals" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("the Find screen on a board with nothing on it", () => {
  it("says there is nothing to find yet, and offers the first step", async () => {
    await openFind({});

    expect(find().getByText("Nothing to find yet.")).toBeTruthy();
    expect(find().getByRole("button", { name: "Add your first node" })).toBeTruthy();
    fireEvent.click(find().getByRole("button", { name: "Add your first node" }));
    expect(uiStore.getState().addMenuOpen).toBe(true);
  });
});
