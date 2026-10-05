import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** The body of the `{ ... }` that opens at the first `marker`, braces counted. */
function block(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`tokens.css has no ${marker}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error(`unclosed block after ${marker}`);
}

const inkIn = (body: string) =>
  Object.fromEntries([...body.matchAll(/--(ink-\d):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));

const NAMES = ["ink-1", "ink-2", "ink-3", "ink-4", "ink-5", "ink-6"];

describe("the ink palette", () => {
  const light = inkIn(block(":root {"));
  const darkByMedia = inkIn(block(':root:not([data-theme="light"]) {'));
  const darkByAttribute = inkIn(block('[data-theme="dark"] {'));

  it("is six tokens in the light theme", () => {
    expect(Object.keys(light)).toEqual(NAMES);
  });

  it("is the same six in the dark theme, written behind the media query and behind the attribute alike", () => {
    expect(Object.keys(darkByMedia)).toEqual(NAMES);
    expect(darkByAttribute).toEqual(darkByMedia);
  });

  it("changes with the theme, so the darkest ink is not invisible on a dark canvas", () => {
    for (const name of NAMES) expect(darkByMedia[name]).not.toBe(light[name]);
  });
});

const stickyIn = (body: string) =>
  Object.fromEntries([...body.matchAll(/--(sticky-[a-z0-9]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));

describe("the sticky palette", () => {
  const WANT = ["sticky-1", "sticky-2", "sticky-3", "sticky-4", "sticky-5", "sticky-fg"];
  const light = stickyIn(block(":root {"));
  const darkByMedia = stickyIn(block(':root:not([data-theme="light"]) {'));
  const darkByAttribute = stickyIn(block('[data-theme="dark"] {'));

  it("is five card colours and the one ink that is written on them, in the light theme", () => {
    expect(Object.keys(light)).toEqual(WANT);
  });

  it("is the same in the dark theme, behind the media query and behind the attribute alike", () => {
    expect(Object.keys(darkByMedia)).toEqual(WANT);
    expect(darkByAttribute).toEqual(darkByMedia);
  });

  it("keeps the text on a sticky readable on every card colour, in both themes", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const palette of [light, darkByMedia]) {
      for (const card of WANT.slice(0, 5)) expect(contrast(palette["sticky-fg"]!, palette[card]!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("components", () => {
  const dir = new URL("../", import.meta.url);
  const sources = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));

  it("have something to check", () => {
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources)("%s holds no raw hex colour: every colour is a token", (file) => {
    const text = readFileSync(new URL(file, dir), "utf8");
    expect(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
