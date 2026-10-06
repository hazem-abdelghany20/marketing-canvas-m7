import type { Page } from "@playwright/test";

/**
 * A dependency-free stand-in for the structural rules an axe scan would run (docs/spec.md's manifest has
 * no axe). It checks the failures axe rates serious or critical that do not need a colour engine: names on
 * every control and image, a language and a title, ids that are unique and that aria attributes point at,
 * and a main landmark. Colour contrast is checked from the tokens in src/styles/__tests__/tokens.test.ts.
 */
export async function structuralProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
    };
    const textOf = (id: string) => document.getElementById(id)?.textContent?.trim() ?? "";
    const nameOf = (el: Element): string => {
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) return labelledby.split(/\s+/).map(textOf).join(" ").trim();
      const label = el.getAttribute("aria-label")?.trim();
      if (label) return label;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const viaLabel = Array.from(el.labels ?? [])
          .map((l) => l.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (viaLabel) return viaLabel;
      }
      const text = el.textContent?.replace(/\s+/g, " ").trim();
      if (text) return text;
      return el.getAttribute("title")?.trim() ?? "";
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}[${el.className.toString().slice(0, 40)}]`;

    if (!document.documentElement.lang) problems.push("html has no lang");
    if (!document.title.trim()) problems.push("page has no title");
    if (!document.querySelector("main")) problems.push("no main landmark");

    for (const el of document.querySelectorAll(
      "button, a[href], [role=button], input:not([type=hidden]), textarea, select",
    )) {
      if (!visible(el) && !(el instanceof HTMLInputElement && el.type === "file")) continue;
      if (el instanceof HTMLInputElement && el.type === "file" && el.hidden) continue;
      if (!nameOf(el)) problems.push(`no accessible name: ${describe(el)}`);
    }
    for (const img of document.querySelectorAll("img")) {
      if (!img.hasAttribute("alt")) problems.push(`img without alt: ${describe(img)}`);
    }

    const seen = new Set<string>();
    for (const el of document.querySelectorAll("[id]")) {
      if (seen.has(el.id)) problems.push(`duplicate id: ${el.id}`);
      seen.add(el.id);
    }
    for (const attr of ["aria-controls", "aria-describedby", "aria-labelledby", "aria-activedescendant"]) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        for (const id of el.getAttribute(attr)!.split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) problems.push(`${attr} points at a missing #${id} on ${describe(el)}`);
        }
      }
    }
    for (const el of document.querySelectorAll(
      "[role=dialog], [role=complementary], [role=toolbar], [role=list], [role=region]",
    )) {
      if (visible(el) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) {
        problems.push(`${el.getAttribute("role")} without a name: ${describe(el)}`);
      }
    }
    return problems;
  });
}
