import { describe, expect, it } from "vitest";
import { rectInView } from "../ensureInView";

// A 236x140 card, and a 1000x700 canvas whose camera is at the origin at zoom 1.
const card = { x: 100, y: 100, width: 236, height: 140 };
const size = { width: 1000, height: 700 };

describe("rectInView", () => {
  it("is true for a card wholly on screen", () => {
    expect(rectInView(card, { x: 0, y: 0, zoom: 1 }, size)).toBe(true);
  });

  it("is false once any edge of the card is past the edge of the canvas", () => {
    expect(rectInView(card, { x: -150, y: 0, zoom: 1 }, size)).toBe(false); // left edge at -50
    expect(rectInView(card, { x: 700, y: 0, zoom: 1 }, size)).toBe(false); // right edge at 1036
    expect(rectInView(card, { x: 0, y: -150, zoom: 1 }, size)).toBe(false); // top edge at -50
    expect(rectInView(card, { x: 0, y: 500, zoom: 1 }, size)).toBe(false); // bottom edge at 740
  });

  it("is true when the card touches the edge exactly", () => {
    expect(rectInView(card, { x: -100, y: -100, zoom: 1 }, size)).toBe(true);
  });

  it("scales the card and its place by the zoom", () => {
    // At 0.5 the card spans screen x 50..168 and y 50..120.
    expect(rectInView(card, { x: 0, y: 0, zoom: 0.5 }, size)).toBe(true);
    // At 2 it spans x 200..672 and y 200..480; moved left by 250 its left edge is at -50.
    expect(rectInView(card, { x: -250, y: 0, zoom: 2 }, size)).toBe(false);
    expect(rectInView(card, { x: -200, y: 0, zoom: 2 }, size)).toBe(true);
  });

  it("does not count the part of the canvas something else covers on the right", () => {
    const right = { x: 600, y: 100, width: 236, height: 140 }; // screen x 600..836 at zoom 1
    expect(rectInView(right, { x: 0, y: 0, zoom: 1 }, size)).toBe(true);
    expect(rectInView(right, { x: 0, y: 0, zoom: 1 }, size, 480)).toBe(false); // only 0..520 is left
    expect(rectInView(card, { x: 0, y: 0, zoom: 1 }, size, 480)).toBe(true);
  });
});
