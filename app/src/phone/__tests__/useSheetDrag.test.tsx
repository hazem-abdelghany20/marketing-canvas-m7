// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHEET_CLOSE_DISTANCE, useSheetDrag } from "../useSheetDrag";

afterEach(cleanup);

function Sheet({ onClose }: { onClose: () => void }) {
  const drag = useSheetDrag(onClose);
  return (
    <div data-testid="sheet" style={drag.style}>
      <div data-testid="handle" {...drag.handleProps} />
    </div>
  );
}

function setup() {
  const onClose = vi.fn();
  const { getByTestId } = render(<Sheet onClose={onClose} />);
  const handle = getByTestId("handle");
  const sheet = getByTestId("sheet");
  const at = (y: number) => ({ pointerId: 1, clientX: 100, clientY: y, button: 0 });
  return {
    onClose,
    sheet,
    down: (y: number) => fireEvent.pointerDown(handle, at(y)),
    move: (y: number) => fireEvent.pointerMove(handle, at(y)),
    up: (y: number) => fireEvent.pointerUp(handle, at(y)),
    cancel: (y: number) => fireEvent.pointerCancel(handle, at(y)),
  };
}

describe("dragging a sheet down by its handle", () => {
  it("follows the finger down, with no transition, so it moves as it is moved", () => {
    const s = setup();

    s.down(100);
    s.move(160);

    expect(s.sheet.style.transform).toBe("translateY(60px)");
    expect(s.sheet.style.transition).toBe("none");
  });

  it("does not go above where it started: it is pulled down, not up", () => {
    const s = setup();

    s.down(100);
    s.move(40);

    expect(s.sheet.style.transform).toBe("");
  });

  it("closes when it is let go far enough down", () => {
    const s = setup();

    s.down(100);
    s.move(100 + SHEET_CLOSE_DISTANCE + 20);
    s.up(100 + SHEET_CLOSE_DISTANCE + 20);

    expect(s.onClose).toHaveBeenCalledTimes(1);
  });

  it("comes back, and stays open, when it is let go before that", () => {
    const s = setup();

    s.down(100);
    s.move(100 + SHEET_CLOSE_DISTANCE - 20);
    s.up(100 + SHEET_CLOSE_DISTANCE - 20);

    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.sheet.style.transform).toBe("");
  });

  it("comes back when the gesture is cancelled, as when the system takes the touch", () => {
    const s = setup();

    s.down(100);
    s.move(300);
    s.cancel(300);

    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.sheet.style.transform).toBe("");
  });

  it("ignores a move that never had a press", () => {
    const s = setup();

    s.move(300);
    s.up(300);

    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.sheet.style.transform).toBe("");
  });
});
