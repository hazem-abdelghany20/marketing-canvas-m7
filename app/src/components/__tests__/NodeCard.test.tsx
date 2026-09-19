// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NodeType } from "../../types";
import { NUDGE_PX } from "../NodeCard";
import { NODE_TYPES } from "../TypeChip";
import { makeNode, renderCards } from "./cards";

afterEach(cleanup);

const card = (name: string | RegExp) => screen.getByRole("button", { name });

describe("NodeCard", () => {
  it("shows each of the six types in its token color and as text", () => {
    renderCards(NODE_TYPES.map((type, i) => makeNode({ id: `nd_${type}`, type, title: `A ${type}`, x: i * 300 })));

    for (const type of NODE_TYPES) {
      const el = card(`A ${type}, ${type[0]!.toUpperCase()}${type.slice(1)}`);
      expect(el.dataset.type).toBe(type);
      expect(el.querySelector("[data-type-bar]")!.className).toContain(`bg-node-${type}`);
      expect(within(el).getByText(new RegExp(`^${type}$`, "i"))).toBeTruthy();
    }
  });

  it("clamps a long body to a two-line excerpt", () => {
    const body = "A long description that keeps going. ".repeat(12);
    renderCards([makeNode({ id: "nd_1", title: "Long", body })]);
    const excerpt = card(/Long/).querySelector("[data-excerpt]")!;
    expect(excerpt.textContent).toBe(body);
    expect(excerpt.className).toContain("line-clamp-2");
  });

  it("badges each non-zero count and renders no badge at zero", () => {
    renderCards(
      [
        makeNode({ id: "nd_busy", title: "Busy", fileIds: ["fl_1", "fl_2"] }),
        makeNode({ id: "nd_other", title: "Other", x: 300 }),
        makeNode({ id: "nd_bare", title: "Bare", x: 600 }),
      ],
      {
        edges: [{ id: "ed_1", fromId: "nd_busy", toId: "nd_other", kind: "serves", label: null }],
        annotations: [{ id: "an_1", nodeId: "nd_busy", body: "Check stock", createdAt: "2026-09-01T00:00:00.000Z" }],
      },
    );

    const busy = card(/Busy/);
    expect(within(busy).getByLabelText("2 files").textContent).toBe("2");
    expect(within(busy).getByLabelText("1 annotation").textContent).toBe("1");
    expect(within(busy).getByLabelText("1 connection").textContent).toBe("1");

    const other = card(/Other/);
    expect(within(other).getByLabelText("1 connection")).toBeTruthy();
    expect(other.querySelectorAll("[data-badge]")).toHaveLength(1);

    expect(card(/Bare/).querySelectorAll("[data-badge]")).toHaveLength(0);
  });

  it("opens the detail panel on Enter", () => {
    const { actions } = renderCards([makeNode({ id: "nd_1", title: "Focus me" })]);
    const el = card(/Focus me/);
    el.focus();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(actions.open).toHaveBeenCalledWith("nd_1");
  });

  it.each([
    ["ArrowUp", 0, -NUDGE_PX],
    ["ArrowDown", 0, NUDGE_PX],
    ["ArrowLeft", -NUDGE_PX, 0],
    ["ArrowRight", NUDGE_PX, 0],
  ])("moves 8px on %s", (key, dx, dy) => {
    expect(NUDGE_PX).toBe(8);
    const { actions } = renderCards([makeNode({ id: "nd_1", title: "Nudge me" })]);
    fireEvent.keyDown(card(/Nudge me/), { key });
    expect(actions.nudge).toHaveBeenCalledWith("nd_1", dx, dy);
  });

  it("names itself by title and type, and is reachable by keyboard", () => {
    renderCards([makeNode({ id: "nd_1", type: "campaign" as NodeType, title: "Ramadan push" })]);
    const el = card("Ramadan push, Campaign");
    expect(el.tabIndex).toBe(0);
  });

  it("shows an asset's file name, size and, for an image in this tab, a thumbnail", () => {
    const T = "2026-09-01T00:00:00.000Z";
    renderCards(
      [
        makeNode({ id: "nd_img", type: "asset", title: "hero.jpg", fileIds: ["fl_img"] }),
        makeNode({ id: "nd_pdf", type: "asset", title: "deck.pdf", fileIds: ["fl_pdf"], x: 300 }),
      ],
      {
        files: [
          { id: "fl_img", name: "hero.jpg", mime: "image/jpeg", sizeBytes: 2 * 1024 * 1024, thumbUrl: null, createdAt: T },
          { id: "fl_pdf", name: "deck.pdf", mime: "application/pdf", sizeBytes: 4096, thumbUrl: null, createdAt: T },
        ],
        objectUrls: { fl_img: "blob:hero" },
      },
    );

    const img = card(/hero\.jpg/);
    expect(img.textContent).toContain("2.0MB");
    expect(img.querySelector("[data-thumbnail] img")!.getAttribute("src")).toBe("blob:hero");

    const pdf = card(/deck\.pdf/);
    expect(pdf.textContent).toContain("4KB");
    expect(pdf.querySelector("[data-thumbnail] img")).toBeNull();
    expect(pdf.textContent).toContain("Not loaded in this tab");
  });
});
