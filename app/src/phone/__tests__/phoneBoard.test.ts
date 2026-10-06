// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitConnect, startConnect } from "../../canvas/connect";
import { appStore } from "../../store";
import { byIdMap, node, SEED_NODES } from "../../test/seed";
import { stubViewport, unstubViewport } from "../../test/viewport";
import type { Viewport } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { nothingInView } from "../boardView";

beforeEach(() => {
  uiStore.getState().reset();
  appStore.getState().resetBoard();
  appStore.setState({ nodes: byIdMap(SEED_NODES) });
});
afterEach(() => {
  exitConnect();
  unstubViewport();
});

const ui = () => uiStore.getState();

describe("connect mode on a phone", () => {
  it("shows the Board tab when it starts, wherever it started: connecting is done on the board", () => {
    stubViewport(375);
    ui().setPhoneTab("trace");

    expect(startConnect("nd_goal_vayn")).toBe(true);

    expect(ui().phoneTab).toBe("board");
    expect(ui().connect).toMatchObject({ active: true, sourceId: "nd_goal_vayn" });
  });

  it("does not touch the tab on a wide window", () => {
    stubViewport(1280);

    startConnect();

    expect(ui().phoneTab).toBe("trace");
  });

  it("does not move the tab when there is nothing to connect, and says so instead", () => {
    stubViewport(375);
    appStore.setState({ nodes: byIdMap([SEED_NODES[0]!]) });
    ui().setPhoneTab("find");

    expect(startConnect()).toBe(false);

    expect(ui().phoneTab).toBe("find");
  });

  it("ends when the Board tab is left, so it cannot sit unseen under another screen with the drawing tools disabled", () => {
    stubViewport(375);
    startConnect();
    expect(ui().connect.active).toBe(true);

    ui().setPhoneTab("chat");

    expect(ui().connect.active).toBe(false);
    expect(ui().phoneTab).toBe("chat");
  });

  it("is left alone when the tab it is already on is the board", () => {
    stubViewport(375);
    ui().setPhoneTab("board");
    startConnect();

    ui().setPhoneTab("board");

    expect(ui().connect.active).toBe(true);
  });
});

describe("whether the board needs bringing into view the first time it is shown", () => {
  const size = { width: 360, height: 700 };
  const camera = (x: number, y: number, zoom = 1): Viewport => ({ x, y, zoom });

  it("does not when a card is on screen", () => {
    expect(nothingInView([node("a", "note", "A", "", 0, 0)], camera(0, 0), size)).toBe(false);
    // A card partly on screen is on screen.
    expect(nothingInView([node("a", "note", "A", "", 300, 600)], camera(0, 0), size)).toBe(false);
  });

  it("does when every card is somewhere else: the camera was left by a wider screen", () => {
    expect(nothingInView([node("a", "note", "A", "", 5000, 40)], camera(0, 0), size)).toBe(true);
    expect(nothingInView(SEED_NODES, camera(-5000, -5000), size)).toBe(true);
  });

  it("follows the camera's pan and zoom", () => {
    // At 100%, panned so that board point (1000, 1000) is at the screen's (100, 100).
    expect(nothingInView([node("a", "note", "A", "", 1000, 1000)], camera(-900, -900), size)).toBe(false);
    // At 25%, a card 5000 away is 1250 away on screen.
    expect(nothingInView([node("a", "note", "A", "", 5000, 0)], camera(0, 0, 0.25), size)).toBe(true);
  });

  it("does not when there are no cards: there is nothing to bring into view", () => {
    expect(nothingInView([], camera(0, 0), size)).toBe(false);
  });

  it("does not when the canvas has no size yet: it cannot be known", () => {
    expect(nothingInView(SEED_NODES, camera(-5000, -5000), { width: 0, height: 0 })).toBe(false);
  });
});
