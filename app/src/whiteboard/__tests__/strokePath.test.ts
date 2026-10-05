import { describe, expect, it } from "vitest";
import { appendPoint, distanceToStroke, simplify, smoothPath, strokeHit } from "../strokePath";

describe("appendPoint", () => {
  it("starts a stroke with its first point", () => {
    expect(appendPoint([], 10, 20, 3)).toEqual([10, 20]);
  });

  it("coalesces a move that has not gone far enough from the last kept point", () => {
    const points = [10, 20];

    const same = appendPoint(points, 11, 21, 3);

    expect(same).toBe(points); // the very same array: nothing to render, nothing to keep
  });

  it("keeps a move that has gone far enough, as a flat pair", () => {
    expect(appendPoint([10, 20], 13, 24, 3)).toEqual([10, 20, 13, 24]);
  });

  it("measures from the last point that was kept, not the last that was offered", () => {
    let points: number[] = [0, 0];
    for (const x of [1, 2, 3, 4, 5, 6, 7]) points = appendPoint(points, x, 0, 3);

    expect(points).toEqual([0, 0, 3, 0, 6, 0]);
  });

  it("rounds to a tenth of a board unit, which is plenty on screen and halves what is sent", () => {
    expect(appendPoint([], 10.123456, 20.987654, 3)).toEqual([10.1, 21]);
  });

  it("does not mutate the array it was given", () => {
    const points = Object.freeze([0, 0]) as unknown as number[];

    expect(() => appendPoint(points, 50, 50, 3)).not.toThrow();
  });
});

describe("simplify", () => {
  it("keeps a stroke of two points as it is", () => {
    expect(simplify([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
  });

  it("collapses a straight line, however many points it was sampled at, to its two ends", () => {
    const line = Array.from({ length: 2000 }, (_, i) => [i, i * 0.5]).flat();

    expect(simplify(line, 0.75)).toEqual([0, 0, 1999, 999.5]);
  });

  it("keeps a corner", () => {
    const elbow = [0, 0, 10, 0, 20, 0, 30, 0, 30, 10, 30, 20, 30, 30];

    expect(simplify(elbow, 0.75)).toEqual([0, 0, 30, 0, 30, 30]);
  });

  it("turns a circle sampled at every pixel into a few dozen points, not hundreds", () => {
    const circle = Array.from({ length: 630 }, (_, i) => {
      const a = (i / 630) * Math.PI * 2;
      return [200 + 100 * Math.cos(a), 200 + 100 * Math.sin(a)];
    }).flat();

    const kept = simplify(circle, 0.75);

    expect(kept.length / 2).toBeLessThan(80);
    expect(kept.length / 2).toBeGreaterThan(12);
    // The ends are never lost.
    expect(kept.slice(0, 2)).toEqual(circle.slice(0, 2));
    expect(kept.slice(-2)).toEqual(circle.slice(-2));
  });

  it("never returns fewer than two points, whatever it is given", () => {
    expect(simplify([4, 4, 4, 4], 1)).toEqual([4, 4, 4, 4]);
  });
});

describe("smoothPath", () => {
  it("draws a stroke of two points as a straight line", () => {
    expect(smoothPath([10, 20, 30, 40])).toBe("M10 20 L30 40");
  });

  it("draws a dot, which is a stroke whose two points are the same, as a zero-length line", () => {
    expect(smoothPath([7, 7, 7, 7])).toBe("M7 7 L7 7");
  });

  it("smooths a longer stroke with quadratic curves through the midpoints, ending on the last point", () => {
    const d = smoothPath([0, 0, 10, 0, 20, 10, 30, 10]);

    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain(" Q");
    expect(d.endsWith("30 10")).toBe(true);
  });

  it("is empty for no points", () => {
    expect(smoothPath([])).toBe("");
  });
});

describe("hit testing", () => {
  const line = { tool: "pen" as const, width: 4, points: [0, 0, 100, 0] };

  it("measures to the nearest part of the stroke, whichever segment it is", () => {
    const bend = [0, 0, 100, 0, 100, 100];

    expect(distanceToStroke(bend, 50, 30)).toBeCloseTo(30);
    expect(distanceToStroke(bend, 130, 50)).toBeCloseTo(30);
    expect(distanceToStroke(bend, 100, 50)).toBeCloseTo(0);
  });

  it("measures to a dot as to a point", () => {
    expect(distanceToStroke([10, 10, 10, 10], 13, 14)).toBeCloseTo(5);
  });

  it("hits on the stroke, and within half its width plus the slop beside it", () => {
    expect(strokeHit(line, 50, 0, 0)).toBe(true);
    expect(strokeHit(line, 50, 2, 0)).toBe(true); // half of 4
    expect(strokeHit(line, 50, 5, 4)).toBe(true); // 2 + 4 = 6
    expect(strokeHit(line, 50, 7, 4)).toBe(false);
  });

  it("does not hit past the end of a stroke by more than its reach", () => {
    expect(strokeHit(line, 104, 0, 0)).toBe(false);
    expect(strokeHit(line, 101, 0, 0)).toBe(true);
  });

  it("gives a wide highlighter the reach of its width", () => {
    const wide = { tool: "highlighter" as const, width: 30, points: [0, 0, 100, 0] };

    expect(strokeHit(wide, 50, 14, 0)).toBe(true);
    expect(strokeHit(wide, 50, 16, 0)).toBe(false);
  });
});
