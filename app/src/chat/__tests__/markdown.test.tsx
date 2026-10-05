// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "../markdown";

afterEach(cleanup);

function html(text: string) {
  const { container } = render(<Markdown text={text} />);
  return container;
}

describe("Markdown", () => {
  it("bolds **text** and sets `code` in a code element", () => {
    const c = html("Keep it **pointed** at one outcome via a `serves` edge.");

    expect(c.querySelector("strong")?.textContent).toBe("pointed");
    expect(c.querySelector("code")?.textContent).toBe("serves");
    expect(c.textContent).toBe("Keep it pointed at one outcome via a serves edge.");
  });

  it("splits paragraphs on a blank line", () => {
    const c = html("First thought.\n\nSecond thought.");

    expect([...c.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["First thought.", "Second thought."]);
  });

  it("renders - items as a bulleted list, with the lead-in and the sign-off as paragraphs", () => {
    const c = html("2 nodes speak to that.\n\n- **Reel** — content\n- **Email** — content\n\nI have highlighted them.");

    expect([...c.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual([
      "Reel — content",
      "Email — content",
    ]);
    expect(c.querySelectorAll("li strong")).toHaveLength(2);
    expect([...c.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "2 nodes speak to that.",
      "I have highlighted them.",
    ]);
  });

  it("keeps a numbered list one list, numbered right, even with blank lines between its items", () => {
    const c = html("1. **One** thing.\n\n2. **Two** things.\n\n3. Three.");

    expect(c.querySelectorAll("ol")).toHaveLength(1);
    expect([...c.querySelectorAll("ol > li")].map((li) => li.textContent)).toEqual([
      "One thing.",
      "Two things.",
      "Three.",
    ]);
  });

  it("leaves a half-typed marker as plain text while a reply is still streaming", () => {
    const c = html("Here is **a half-");

    expect(c.textContent).toBe("Here is **a half-");
    expect(c.querySelector("strong")).toBeNull();
  });

  it("never turns text into markup", () => {
    const c = html('<img src=x onerror="alert(1)"> and <b>bold</b>');

    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector("b")).toBeNull();
    expect(c.textContent).toBe('<img src=x onerror="alert(1)"> and <b>bold</b>');
  });

  it("keeps the trailing space of a token, so a streamed reply reads right word by word", () => {
    expect(html("3 nodes ").textContent).toBe("3 nodes ");
  });

  it("renders nothing for an empty reply", () => {
    expect(html("").textContent).toBe("");
  });
});
