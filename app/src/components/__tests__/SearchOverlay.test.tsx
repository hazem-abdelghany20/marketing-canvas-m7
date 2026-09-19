// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyBoard, json, network, renderAt, resetApp, serveEmptyBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { recentNodes, searchNodes } from "../SearchOverlay";

const node = (id: string, title: string, body: string, updatedAt: string): CanvasNode => ({
  id,
  type: "content",
  title,
  body,
  fileIds: [],
  x: 0,
  y: 0,
  createdAt: updatedAt,
  updatedAt,
});

const day = (d: number) => `2026-09-${String(d).padStart(2, "0")}T00:00:00.000Z`;
const nodes = [
  node("n1", "Reel: 3 ways to style linen", "Hook lands at 0:02.", day(1)),
  node("n2", "Vayn linen drop", "New SKU launch.", day(2)),
  node("n3", "Carousel: quiet luxury", "Compete on LINEN and fit.", day(3)),
  node("n4", "Email: Ramadan lookbook", "Single CTA.", day(4)),
  node("n5", "Mental Diet voice", "Clinician, not coach.", day(5)),
  node("n6", "IG reach down 30%", "Algo change.", day(6)),
];

describe("searchNodes", () => {
  it("matches title or body in any case, titles first, each newest first", () => {
    expect(searchNodes(nodes, "LiNeN").map((n) => n.id)).toEqual(["n2", "n1", "n3"]);
  });

  it("finds nothing for a blank query or a miss", () => {
    expect(searchNodes(nodes, "   ")).toEqual([]);
    expect(searchNodes(nodes, "podcast")).toEqual([]);
  });
});

describe("recentNodes", () => {
  it("lists the five most recently updated, newest first", () => {
    expect(recentNodes(nodes).map((n) => n.id)).toEqual(["n6", "n5", "n4", "n3", "n2"]);
  });
});

describe("SearchOverlay", () => {
  beforeEach(() => {
    resetApp();
    uiStore.getState().reset();
    appStore.getState().signIn({ token: "tok", user });
    serveEmptyBoard();
    network.on("GET /nodes", () => json(200, nodes));
    for (const n of nodes) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
  });
  afterEach(cleanup);

  async function openSearch() {
    renderAt("/");
    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
    await screen.findByRole("button", { name: "Search" });
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    return screen.findByRole("combobox", { name: "Search nodes by title or body" });
  }

  it("opens on Cmd/Ctrl+F with its input focused", async () => {
    const input = await openSearch();
    expect(document.activeElement).toBe(input);
  });

  it("lists the five most recently updated nodes under Recent before anything is typed", async () => {
    await openSearch();
    const list = screen.getByRole("listbox", { name: "Recent" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.dataset.searchResult),
    ).toEqual(["n6", "n5", "n4", "n3", "n2"]);
  });

  it("filters live, in any case, by title or body, with no submit", async () => {
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "lInEn" } });

    const list = screen.getByRole("listbox", { name: "Matches" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.dataset.searchResult),
    ).toEqual(["n2", "n1", "n3"]);
  });

  it("goes to the highlighted result on ↓ then Enter: selects it and closes", async () => {
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "linen" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toContain("n1");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: "Search nodes" })).toBeNull();
    expect(uiStore.getState().selectedIds).toEqual(["n1"]);
  });

  it("says nothing matches, offers a note with that title, and Enter goes nowhere", async () => {
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "podcast plan" } });

    expect(screen.getByText('No nodes match "podcast plan".')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create a note with this title" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Search nodes" })).toBeTruthy();
    expect(uiStore.getState().selectedIds).toEqual([]);
  });

  it("creates a note titled with the query", async () => {
    network.on("POST /nodes", (call) => json(201, { ...node("n_new", "", "", day(9)), ...(call.body as object) }));
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "podcast plan" } });

    fireEvent.click(screen.getByRole("button", { name: "Create a note with this title" }));

    await waitFor(() =>
      expect(network.callsTo("POST /nodes")[0]?.body).toMatchObject({ type: "note", title: "podcast plan" }),
    );
  });

  it("closes on Escape without going anywhere", async () => {
    const input = await openSearch();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search nodes" })).toBeNull();
    expect(uiStore.getState().selectedIds).toEqual([]);
  });

  it("is non-interactive with a reason on a board with no nodes, and Cmd/Ctrl+F is left to the browser", async () => {
    network.on("GET /nodes", () => json(200, []));
    network.on("GET /board", () => json(200, emptyBoard));
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");

    const search = screen.getByRole("button", { name: "Search" });
    expect(search.getAttribute("aria-disabled")).toBe("true");
    expect(search.title).toBe("Nothing to search yet.");

    const event = new KeyboardEvent("keydown", { key: "f", metaKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Search nodes" })).toBeNull();
  });
});
