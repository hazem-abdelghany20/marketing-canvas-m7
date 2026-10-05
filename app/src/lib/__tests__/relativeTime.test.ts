import { describe, expect, it } from "vitest";
import { relativeTime } from "../format";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it.each([
    [0, "now"],
    [20_000, "now"],
    [59_000, "now"],
    [MIN, "1m"],
    [5 * MIN, "5m"],
    [59 * MIN, "59m"],
    [HOUR, "1h"],
    [2 * HOUR + 20 * MIN, "2h"],
    [23 * HOUR, "23h"],
    [DAY, "1d"],
    [6 * DAY, "6d"],
    [7 * DAY, "1w"],
    [20 * DAY, "2w"],
    [60 * DAY, "8w"],
  ])("says %i ms ago as %s", (elapsed, text) => {
    expect(relativeTime(ago(elapsed), NOW)).toBe(text);
  });

  it("calls a time slightly in the future, from a clock that is a little behind, now", () => {
    expect(relativeTime(ago(-30_000), NOW)).toBe("now");
  });

  it("says nothing sensible about a date it cannot read, but does not throw", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});
