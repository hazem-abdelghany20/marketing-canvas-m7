// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewport } from "../../types";
import { useCameraGesture, type GestureCamera } from "../useCameraGesture";
import type { SurfaceHandlers } from "../useDrawing";

afterEach(cleanup);

/** A camera that says where it is and records where it was sent. At 100%, with the board's origin at the canvas's corner. */
function fakeCamera() {
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  const moves: Viewport[] = [];
  const camera: GestureCamera = {
    viewport: () => viewport,
    origin: () => ({ x: 0, y: 0 }),
    toBoard: ({ x, y }) => ({ x: (x - viewport.x) / viewport.zoom, y: (y - viewport.y) / viewport.zoom }),
    move: (next) => {
      viewport = next;
      moves.push(next);
    },
  };
  return { camera, moves };
}

function tool() {
  return {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
  } satisfies SurfaceHandlers;
}

function surface(handlers: SurfaceHandlers, camera: GestureCamera) {
  function Surface() {
    const { handlers: wrapped } = useCameraGesture(handlers, camera);
    return <div data-testid="surface" {...wrapped} />;
  }
  const rendered = render(<Surface />);
  const el = rendered.getByTestId("surface");
  const at = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY, button: 0 });
  return {
    down: (id: number, x: number, y: number) => fireEvent.pointerDown(el, at(id, x, y)),
    move: (id: number, x: number, y: number) => fireEvent.pointerMove(el, at(id, x, y)),
    up: (id: number, x: number, y: number) => fireEvent.pointerUp(el, at(id, x, y)),
  };
}

let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe("one finger", () => {
  it("is the tool's: every event goes to it, and the camera is left alone", () => {
    const handlers = tool();
    const { camera, moves } = fakeCamera();
    const finger = surface(handlers, camera);

    finger.down(1, 10, 10);
    finger.move(1, 20, 20);
    finger.up(1, 20, 20);

    expect(handlers.onPointerDown).toHaveBeenCalledTimes(1);
    expect(handlers.onPointerMove).toHaveBeenCalledTimes(1);
    expect(handlers.onPointerUp).toHaveBeenCalledTimes(1);
    expect(handlers.onPointerCancel).not.toHaveBeenCalled();
    expect(moves).toEqual([]);
  });
});

describe("a second finger", () => {
  it("throws the stroke in progress away, and takes the tool no more events", () => {
    const handlers = tool();
    const { camera } = fakeCamera();
    const fingers = surface(handlers, camera);
    fingers.down(1, 50, 50);
    fingers.move(1, 60, 60);

    fingers.down(2, 150, 50);

    // The first finger's stroke is cancelled (never saved), and told which pointer it was.
    expect(handlers.onPointerCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onPointerCancel.mock.calls[0]![0]).toMatchObject({ pointerId: 1 });
    expect(handlers.onPointerDown).toHaveBeenCalledTimes(1);

    fingers.move(1, 70, 70);
    fingers.move(2, 160, 60);
    fingers.up(2, 160, 60);
    fingers.up(1, 70, 70);
    expect(handlers.onPointerMove).toHaveBeenCalledTimes(1); // only the one before the second finger landed
    expect(handlers.onPointerUp).not.toHaveBeenCalled();
  });

  it("pans the board with the two fingers, the point under them staying under them", () => {
    const handlers = tool();
    const { camera, moves } = fakeCamera();
    const fingers = surface(handlers, camera);
    fingers.down(1, 50, 50);
    fingers.down(2, 150, 50);

    fingers.move(1, 80, 70);
    fingers.move(2, 180, 70);

    // Both fingers moved 30 right and 20 down: so did the board.
    expect(moves.at(-1)).toEqual({ x: 30, y: 20, zoom: 1 });
  });

  it("zooms with the pinch, about the point between the fingers", () => {
    const { camera, moves } = fakeCamera();
    const fingers = surface(tool(), camera);
    fingers.down(1, 100, 100);
    fingers.down(2, 200, 100); // 100px apart, around (150, 100)

    fingers.move(1, 50, 100);
    fingers.move(2, 250, 100); // 200px apart, around the same point

    const last = moves.at(-1)!;
    expect(last.zoom).toBe(2);
    // The board point that was under (150, 100) is still there.
    expect(150 - last.x).toBeCloseTo(150 * 2);
    expect(100 - last.y).toBeCloseTo(100 * 2);
  });

  it("leaves a finger that stays down drawing nothing, and the other one lifting changes nothing", () => {
    const handlers = tool();
    const { camera, moves } = fakeCamera();
    const fingers = surface(handlers, camera);
    fingers.down(1, 50, 50);
    fingers.down(2, 150, 50);

    fingers.up(2, 150, 50);
    const movesBefore = moves.length;
    fingers.move(1, 90, 90);
    fingers.up(1, 90, 90);

    expect(moves).toHaveLength(movesBefore);
    expect(handlers.onPointerMove).not.toHaveBeenCalled();
    expect(handlers.onPointerUp).not.toHaveBeenCalled();
  });

  it("ignores a third finger", () => {
    const handlers = tool();
    const { camera, moves } = fakeCamera();
    const fingers = surface(handlers, camera);
    fingers.down(1, 50, 50);
    fingers.down(2, 150, 50);

    fingers.down(3, 300, 300);
    fingers.move(3, 320, 320);

    expect(handlers.onPointerDown).toHaveBeenCalledTimes(1);
    expect(moves).toEqual([]);
  });

  it("gives the tool the next finger once every finger has lifted", () => {
    const handlers = tool();
    const { camera } = fakeCamera();
    const fingers = surface(handlers, camera);
    fingers.down(1, 50, 50);
    fingers.down(2, 150, 50);
    fingers.up(1, 50, 50);
    fingers.up(2, 150, 50);

    fingers.down(4, 10, 10);
    fingers.move(4, 30, 30);
    fingers.up(4, 30, 30);

    expect(handlers.onPointerDown).toHaveBeenCalledTimes(2);
    expect(handlers.onPointerUp).toHaveBeenCalledTimes(1);
  });
});

describe("a tap that ends a gesture", () => {
  it("is not a click for a moment afterwards, so lifting two fingers does not drop a sticky", () => {
    const { camera } = fakeCamera();
    const { result } = renderHook(() => useCameraGesture(tool(), camera));
    expect(result.current.recently()).toBe(false);
  });

  it("says a gesture has just ended, until the moment has passed", () => {
    const { camera } = fakeCamera();
    function Probe({ out }: { out: { recently?: () => boolean } }) {
      const { handlers, recently } = useCameraGesture(tool(), camera);
      out.recently = recently;
      return <div data-testid="surface" {...handlers} />;
    }
    const out: { recently?: () => boolean } = {};
    const { getByTestId } = render(<Probe out={out} />);
    const el = getByTestId("surface");
    const at = (pointerId: number, clientX: number) => ({ pointerId, clientX, clientY: 50, button: 0 });

    fireEvent.pointerDown(el, at(1, 50));
    fireEvent.pointerDown(el, at(2, 150));
    fireEvent.pointerUp(el, at(1, 50));
    fireEvent.pointerUp(el, at(2, 150));

    expect(out.recently!()).toBe(true);
    now += 1000;
    expect(out.recently!()).toBe(false);
  });
});
