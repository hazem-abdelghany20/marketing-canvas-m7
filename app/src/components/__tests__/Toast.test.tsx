// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiStore } from "../../ui/uiStore";
import { ToastViewport } from "../Toast";

beforeEach(() => {
  vi.useFakeTimers();
  uiStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = (input: Parameters<ReturnType<typeof uiStore.getState>["toast"]>[0]) =>
  act(() => void uiStore.getState().toast(input));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("Toast", () => {
  it("is a status for info and success, and an alert for warn and danger", () => {
    render(<ToastViewport />);

    show({ message: "Saved a thing.", tone: "success" });
    show({ message: "Heads up.", tone: "info" });
    show({ message: "Careful.", tone: "warn" });
    show({ message: "That failed.", tone: "danger" });

    expect(screen.getAllByRole("status").map((el) => el.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Saved a thing."), expect.stringContaining("Heads up.")]),
    );
    expect(screen.getAllByRole("alert").map((el) => el.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Careful."), expect.stringContaining("That failed.")]),
    );
  });

  it("carries its tone in an icon as well as a colour, for all four tones", () => {
    render(<ToastViewport />);
    for (const tone of ["info", "success", "warn", "danger"] as const) show({ message: `A ${tone} toast.`, tone });

    for (const tone of ["info", "success", "warn", "danger"] as const) {
      const toast = screen.getByText(`A ${tone} toast.`).closest("[data-tone]") as HTMLElement;
      expect(toast.dataset.tone).toBe(tone);
      expect(toast.querySelector("svg[data-toast-icon]")).toBeTruthy();
    }
  });

  it("goes away on its own after its duration", () => {
    render(<ToastViewport />);
    show({ message: "Gone soon.", durationMs: 3000 });

    wait(2900);
    expect(screen.queryByText("Gone soon.")).toBeTruthy();
    wait(200);
    expect(screen.queryByText("Gone soon.")).toBeNull();
  });

  it("waits while the pointer is on it, then gives a full duration again once the pointer leaves", () => {
    render(<ToastViewport />);
    show({ message: "Read me.", durationMs: 3000 });
    const toast = screen.getByText("Read me.").closest("[data-tone]") as HTMLElement;

    fireEvent.mouseEnter(toast);
    wait(20_000);
    expect(screen.queryByText("Read me.")).toBeTruthy();

    fireEvent.mouseLeave(toast);
    wait(2900);
    expect(screen.queryByText("Read me.")).toBeTruthy();
    wait(200);
    expect(screen.queryByText("Read me.")).toBeNull();
  });

  it("waits while focus is inside it, so its action can be reached from the keyboard", () => {
    render(<ToastViewport />);
    show({ message: "Undo me.", actionLabel: "Undo", durationMs: 3000, onAction: () => {} });
    const toast = screen.getByText("Undo me.").closest("[data-tone]") as HTMLElement;

    fireEvent.focus(within(toast).getByRole("button", { name: "Undo" }));
    wait(20_000);
    expect(screen.queryByText("Undo me.")).toBeTruthy();

    fireEvent.blur(within(toast).getByRole("button", { name: "Undo" }));
    wait(3100);
    expect(screen.queryByText("Undo me.")).toBeNull();
  });

  it("stays at least ten seconds when it carries an action and says nothing about how long", () => {
    render(<ToastViewport />);
    show({ message: "Couldn't save.", tone: "danger", actionLabel: "Retry", onAction: () => {} });

    wait(9_900);
    expect(screen.queryByText("Couldn't save.")).toBeTruthy();
    wait(200);
    expect(screen.queryByText("Couldn't save.")).toBeNull();
  });

  it("is still brief when it has no action", () => {
    render(<ToastViewport />);
    show({ message: "FYI." });

    wait(5_100);

    expect(screen.queryByText("FYI.")).toBeNull();
  });

  it("runs its action and dismisses when the action is used", () => {
    let ran = 0;
    render(<ToastViewport />);
    show({ message: "Deleted.", actionLabel: "Undo", onAction: () => void ran++ });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(ran).toBe(1);
    expect(screen.queryByText("Deleted.")).toBeNull();
  });

  it("can be dismissed", () => {
    render(<ToastViewport />);
    show({ message: "Close me." });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Close me.")).toBeNull();
  });
});
