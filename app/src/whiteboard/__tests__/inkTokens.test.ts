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
