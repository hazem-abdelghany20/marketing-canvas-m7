import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

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

function variables(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
}

const light = variables(block(":root {"));
const darkByMedia = variables(block(':root:not([data-theme="light"]) {'));
const darkByAttribute = variables(block('[data-theme="dark"] {'));

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg-canvas", "bg-panel", "bg-rail", "bg-elevated"];
// Every colour the app sets text in, over every surface it sits on.
const TEXT = ["fg-primary", "fg-muted", "danger", "warn", "ok", "accent"];

describe("design tokens", () => {
  it("write the dark palette once behind the media query and once behind the attribute, and keep them the same", () => {
    expect(Object.keys(darkByMedia).length).toBeGreaterThan(20);
    expect(darkByAttribute).toEqual(darkByMedia);
  });

  for (const [name, palette] of [
    ["light", light],
    ["dark", darkByMedia],
  ] as const) {
    it(`give every text colour at least 4.5:1 on every surface in the ${name} theme`, () => {
      const failures = TEXT.flatMap((text) =>
        SURFACES.flatMap((surface) => {
          const ratio = contrast(palette[text]!, palette[surface]!);
          return ratio >= 4.5 ? [] : [`${text} on ${surface}: ${ratio.toFixed(2)}:1`];
        }),
      );
      expect(failures).toEqual([]);
    });

    it(`keep the text on a primary button (inverse on accent) at 4.5:1 in the ${name} theme`, () => {
      expect(contrast(palette["fg-inverse"]!, palette.accent!)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keep the text on a toast (inverse on primary) at 4.5:1 in the ${name} theme`, () => {
      expect(contrast(palette["fg-inverse"]!, palette["fg-primary"]!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
