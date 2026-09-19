// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NODE_TYPES, TypeChip } from "../TypeChip";

afterEach(cleanup);

describe("TypeChip", () => {
  it.each(NODE_TYPES)("labels %s in words and colors its dot from --node-%s", (type) => {
    const { container } = render(<TypeChip type={type} />);
    const chip = container.querySelector(`[data-type-chip="${type}"]`)!;
    expect(chip.textContent?.toLowerCase()).toBe(type);
    expect(chip.querySelector("[data-type-dot]")!.className).toContain(`bg-node-${type}`);
  });

  it("keeps the dot out of the accessibility tree, so the label carries the meaning", () => {
    const { container } = render(<TypeChip type="goal" />);
    expect(container.querySelector("[data-type-dot]")!.getAttribute("aria-hidden")).toBe("true");
  });
});
