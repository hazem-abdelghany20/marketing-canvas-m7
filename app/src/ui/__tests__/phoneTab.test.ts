// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubViewport, unstubViewport } from "../../test/viewport";
import { uiStore } from "../uiStore";

beforeEach(() => {
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false });
});
afterEach(unstubViewport);

const ui = () => uiStore.getState();

describe("the phone's tab", () => {
  it("starts on Trace", () => {
    expect(ui().phoneTab).toBe("trace");
  });

  it("changes with setPhoneTab, and reset puts it back to Trace", () => {
    ui().setPhoneTab("board");
    expect(ui().phoneTab).toBe("board");

    ui().reset();
    expect(ui().phoneTab).toBe("trace");
  });

  it("is not kept across a reload: it is neither session nor local storage", () => {
    ui().setPhoneTab("chat");

    expect(sessionStorage.length).toBe(0);
    expect(Object.keys(localStorage)).toEqual([]);
  });
});

describe("opening the assistant", () => {
  it("shows the Chat tab on a phone and asks for the composer, leaving the sheet and the rail alone", () => {
    stubViewport(375);

    ui().openChat();

    expect(ui().phoneTab).toBe("chat");
    expect(ui().composerFocusPending).toBe(true);
    expect(ui().chatSheetOpen).toBe(false);
  });

  it("reveals Chat on a phone without asking for focus, as sending the board does", () => {
    stubViewport(375);

    ui().revealChat();

    expect(ui().phoneTab).toBe("chat");
    expect(ui().composerFocusPending).toBe(false);
    expect(ui().chatSheetOpen).toBe(false);
  });

  it("still opens the overlay sheet between 640px and 900px, where there is no tab bar", () => {
    stubViewport(700);

    ui().openChat();

    expect(ui().chatSheetOpen).toBe(true);
    expect(ui().phoneTab).toBe("trace");
  });

  it("still opens the rail's column on a wide window", () => {
    stubViewport(1280);
    ui().setRailCollapsed(true);

    ui().openChat();

    expect(ui().railCollapsed).toBe(false);
    expect(ui().phoneTab).toBe("trace");
  });
});
