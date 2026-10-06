import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../../canvas/useViewport";
import { distance, midpoint, pinchViewport, type PinchStart } from "../pinch";

const ORIGIN = { x: 0, y: 0 };
/** Two fingers 100px apart, centred on (60, 20), on the board point (100, 50) at 100%. */
const START: PinchStart = { anchor: { x: 100, y: 50 }, span: 100, zoom: 1 };

describe("midpoint and distance", () => {
  it("find the middle of two fingers and how far apart they are", () => {
    expect(midpoint({ x: 10, y: 20 }, { x: 110, y: 40 })).toEqual({ x: 60, y: 30 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("two fingers moving the board", () => {
  it("keeps the board point that was under the fingers under them as they pan", () => {
    const resting = pinchViewport(START, { x: 10, y: 20 }, { x: 110, y: 20 }, ORIGIN);
    expect(resting).toEqual({ x: -40, y: -30, zoom: 1 });

    // Both fingers move 30 right and 10 down: the board follows by exactly that.
    const panned = pinchViewport(START, { x: 40, y: 30 }, { x: 140, y: 30 }, ORIGIN);
    expect(panned).toEqual({ x: -10, y: -20, zoom: 1 });
  });

  it("zooms by how much the fingers spread, around the point between them", () => {
    // 100px apart to 200px apart: twice as close, about the same midpoint (60, 20).
    const zoomed = pinchViewport(START, { x: -40, y: 20 }, { x: 160, y: 20 }, ORIGIN);

    expect(zoomed.zoom).toBe(2);
    // The board point (100, 50) is still under (60, 20).
    expect(zoomed.x + 100 * zoomed.zoom).toBeCloseTo(60);
    expect(zoomed.y + 50 * zoomed.zoom).toBeCloseTo(20);
  });

  it("zooms out when the fingers come together", () => {
    const out = pinchViewport({ ...START, zoom: 1 }, { x: 35, y: 20 }, { x: 85, y: 20 }, ORIGIN);

    expect(out.zoom).toBe(0.5);
    expect(out.x + 100 * out.zoom).toBeCloseTo(60);
  });

  it("never goes past the canvas's own zoom range, and the point still holds at the limit", () => {
    const wide = pinchViewport(START, { x: -2000, y: 20 }, { x: 2120, y: 20 }, ORIGIN);
    expect(wide.zoom).toBe(MAX_ZOOM);
    expect(wide.x + 100 * wide.zoom).toBeCloseTo(60);

    const tight = pinchViewport(START, { x: 59, y: 20 }, { x: 61, y: 20 }, ORIGIN);
    expect(tight.zoom).toBe(MIN_ZOOM);
  });

  it("measures from the canvas's own corner, which is not always the window's", () => {
    const offset = pinchViewport(START, { x: 10, y: 20 }, { x: 110, y: 20 }, { x: 10, y: 5 });

    // The fingers are 10 and 5 further from the canvas's corner than they are from the window's.
    expect(offset).toEqual({ x: -50, y: -35, zoom: 1 });
  });

  it("does not divide by nothing when the fingers landed on the same spot", () => {
    const together = pinchViewport({ ...START, span: 0 }, { x: 10, y: 20 }, { x: 110, y: 20 }, ORIGIN);

    expect(together.zoom).toBe(1);
    expect(Number.isFinite(together.x)).toBe(true);
  });
});
