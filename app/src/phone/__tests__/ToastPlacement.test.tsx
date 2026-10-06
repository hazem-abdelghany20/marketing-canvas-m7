// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToastViewport } from "../../components/Toast";
import { stubViewport, unstubViewport } from "../../test/viewport";
import { uiStore } from "../../ui/uiStore";

beforeEach(() => uiStore.getState().reset());
afterEach(() => {
  cleanup();
  unstubViewport();
});

const viewport = () => document.querySelector<HTMLElement>("[data-toast-viewport]")!;

describe("where toasts stand in the phone layout", () => {
  it("sit above the tab bar on a screen that has nothing else along the bottom", () => {
    stubViewport(375);
    render(<ToastViewport contained />);

    for (const tab of ["trace", "chat", "find"] as const) {
      act(() => uiStore.getState().setPhoneTab(tab));
      expect(viewport().className).toMatch(/bottom-3(\s|$)/);
    }
  });

  it("sit above the dock on the Board, where the tools are along the bottom", () => {
    stubViewport(375);
    render(<ToastViewport contained />);

    act(() => uiStore.getState().setPhoneTab("board"));

    expect(viewport().className).toMatch(/bottom-\[76px\]/);
  });

  it("are where they were on a tablet and on a desktop: above the assistant's button, or the corner", () => {
    stubViewport(700);
    render(<ToastViewport contained />);
    expect(viewport().className).toMatch(/max-\[899px\]:bottom-\[68px\]/);
    cleanup();

    stubViewport(1280);
    render(<ToastViewport contained />);
    expect(viewport().className).toMatch(/bottom-\[18px\]/);
  });
});
