// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeNode, renderCards } from "./cards";

afterEach(cleanup);

const nodes = [
  makeNode({ id: "a", type: "campaign", title: "Ramadan push" }),
  makeNode({ id: "b", type: "content", title: "Reel: linen" }),
];
const card = (id: string) => document.querySelector(`[data-node-card="${id}"]`) as HTMLElement;

describe("NodeCard cited by chat", () => {
  it("says so in words on the card, not by colour alone", () => {
    renderCards(nodes, { cited: ["a"] });

    expect(card("a").textContent).toContain("Cited");
    expect(card("a").hasAttribute("data-cited")).toBe(true);
    expect(card("b").textContent).not.toContain("Cited");
    expect(card("b").hasAttribute("data-cited")).toBe(false);
  });

  it("tells a screen reader, through the card's name, that the assistant cited it", () => {
    renderCards(nodes, { cited: ["a"] });

    expect(screen.getByRole("button", { name: "Ramadan push, Campaign, cited in chat" })).toBe(card("a"));
    expect(screen.getByRole("button", { name: "Reel: linen, Content" })).toBe(card("b"));
  });

  it("looks different from an unselected card that was not cited", () => {
    renderCards(nodes, { cited: ["a"] });

    expect(card("a").querySelector("[data-cited-ring]")).toBeTruthy();
    expect(card("b").querySelector("[data-cited-ring]")).toBeNull();
  });

  it("keeps the cited mark when the card is also selected", () => {
    renderCards(nodes, { cited: ["a"], selected: ["a"] });

    expect(card("a").getAttribute("aria-pressed")).toBe("true");
    expect(card("a").textContent).toContain("Cited");
  });

  it("is a card like any other when nothing is cited", () => {
    renderCards(nodes);

    for (const id of ["a", "b"]) {
      expect(card(id).hasAttribute("data-cited")).toBe(false);
      expect(card(id).textContent).not.toContain("Cited");
    }
  });
});
