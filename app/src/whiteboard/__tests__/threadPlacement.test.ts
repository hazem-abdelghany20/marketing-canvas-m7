import { describe, expect, it } from "vitest";
import { placeThread } from "../threadPlacement";

const PANEL = { width: 280, height: 240 };
const CANVAS = { width: 1000, height: 700 };

describe("placeThread", () => {
  it("opens to the right of the pin, a little below its tip, when there is room", () => {
    expect(placeThread({ anchor: { x: 200, y: 300 }, container: CANVAS, panel: PANEL })).toEqual({
      left: 218,
      top: 290,
      side: "right",
    });
  });

  it("flips to the other side of the pin when the right side would leave the canvas", () => {
    const placed = placeThread({ anchor: { x: 900, y: 300 }, container: CANVAS, panel: PANEL });

    expect(placed.side).toBe("left");
    expect(placed.left).toBe(900 - 18 - 280);
    expect(placed.left + PANEL.width).toBeLessThan(900);
  });

  it("flips at the exact point where the right side stops fitting", () => {
    // Fits while anchor + 18 + 280 + 12 margin <= 1000, i.e. anchor <= 690.
    expect(placeThread({ anchor: { x: 690, y: 300 }, container: CANVAS, panel: PANEL }).side).toBe("right");
    expect(placeThread({ anchor: { x: 691, y: 300 }, container: CANVAS, panel: PANEL }).side).toBe("left");
  });

  it("stays on the right for a pin near the left edge", () => {
    expect(placeThread({ anchor: { x: 20, y: 300 }, container: CANVAS, panel: PANEL }).side).toBe("right");
  });

  it("keeps the panel inside the canvas vertically: lifted off the bottom, held off the top", () => {
    expect(placeThread({ anchor: { x: 200, y: 690 }, container: CANVAS, panel: PANEL }).top).toBe(700 - 240 - 12);
    expect(placeThread({ anchor: { x: 200, y: 2 }, container: CANVAS, panel: PANEL }).top).toBe(12);
  });

  it("never leaves the canvas on either axis, even when neither side has room", () => {
    const tiny = { width: 300, height: 200 };

    const placed = placeThread({ anchor: { x: 150, y: 100 }, container: tiny, panel: PANEL });

    expect(placed.left).toBeGreaterThanOrEqual(12);
    expect(placed.top).toBeGreaterThanOrEqual(12);
  });
});
