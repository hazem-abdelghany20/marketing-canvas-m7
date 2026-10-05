// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { controlledSse, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { emptyBoard, json, network, renderAt, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, title: string, x: number): CanvasNode => ({
  id, type: "campaign", title, body: "", fileIds: [], x, y: 0, createdAt: T, updatedAt: T,
});
const nodes = [node("nd_a", "Vayn Ramadan push", 0), node("nd_b", "IG reach down 30%", 600)];

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
  serve(nodes);
});
afterEach(cleanup);

function serve(list: CanvasNode[]) {
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, list));
  for (const p of ["/edges", "/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of list) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
}

async function openBoard() {
  renderAt("/");
  await screen.findByRole("textbox", { name: "Message" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
}

const picker = () => screen.getByRole("radiogroup", { name: "Reply mode" });
const radio = (name: string) => within(picker()).getByRole("radio", { name });
const checked = () => within(picker()).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.textContent);
const type = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send" }));
const posts = () => network.callsTo("POST /chat");
const answer = (mode: string, extra: { cited?: string[]; proposal?: unknown; text?: string } = {}) =>
  network.on("POST /chat", () =>
    sseResponse([
      sseFrame("start", { mode }),
      sseFrame("token", { token: extra.text ?? "Done." }),
      sseFrame("done", { citedNodeIds: extra.cited ?? [], proposal: extra.proposal ?? null }),
    ]),
  );

describe("the picker", () => {
  it("offers exactly Auto, Generator, Librarian and Reasoner, with Auto chosen", async () => {
    await openBoard();

    const names = within(picker()).getAllByRole("radio").map((r) => r.textContent);
    expect(names).toEqual(["Auto", "Generator", "Librarian", "Reasoner"]);
    expect(checked()).toEqual(["Auto"]);
  });

  it("has no Operator, which the server reaches by itself when two nodes are named", async () => {
    await openBoard();

    expect(screen.queryByRole("radio", { name: /operator/i })).toBeNull();
    expect(picker().textContent).not.toMatch(/operator/i);
  });

  it("says in each one's tooltip what it is for", async () => {
    await openBoard();

    for (const name of ["Auto", "Generator", "Librarian", "Reasoner"]) expect(radio(name).title.length).toBeGreaterThan(15);
    expect(radio("Reasoner").title).toMatch(/audit/i);
  });

  it("chooses one when it is used, and only one", async () => {
    await openBoard();

    fireEvent.click(radio("Librarian"));

    expect(checked()).toEqual(["Librarian"]);
  });

  it("is a radio group with one tab stop, and the arrow keys move the choice", async () => {
    await openBoard();
    const auto = radio("Auto");
    expect(auto.getAttribute("tabindex")).toBe("0");
    expect(radio("Generator").getAttribute("tabindex")).toBe("-1");
    auto.focus();

    fireEvent.keyDown(auto, { key: "ArrowRight" });
    expect(checked()).toEqual(["Generator"]);
    expect(document.activeElement).toBe(radio("Generator"));
    fireEvent.keyDown(radio("Generator"), { key: "ArrowLeft" });
    fireEvent.keyDown(radio("Auto"), { key: "ArrowLeft" });
    expect(checked()).toEqual(["Reasoner"]);
  });
});

describe("what is sent", () => {
  it("sends no mode when Auto is chosen, and shows the mode the server picked on the finished reply", async () => {
    answer("librarian");
    await openBoard();

    type("what serves the Ramadan push?");
    send();

    await waitFor(() => expect(screen.getByText("Assistant · librarian")).toBeTruthy());
    expect(posts()[0]!.body).toEqual({ message: "what serves the Ramadan push?" });
  });

  it("sends the chosen mode, and the reply reports it on its start", async () => {
    answer("generator");
    await openBoard();
    fireEvent.click(radio("Generator"));

    type("something to say about linen");
    send();

    await waitFor(() => expect(screen.getByText("Assistant · generator")).toBeTruthy());
    expect(posts()[0]!.body).toEqual({ message: "something to say about linen", mode: "generator" });
  });

  it("answers a message that would auto-detect as Generator as the Librarian when that is chosen, with no proposal", async () => {
    answer("librarian", { cited: ["nd_a"], text: "One node speaks to that." });
    await openBoard();
    fireEvent.click(radio("Librarian"));

    type("Draft a reel script about linen care");
    send();

    await waitFor(() => expect(screen.getByText("Assistant · librarian")).toBeTruthy());
    expect(posts()[0]!.body).toEqual({ message: "Draft a reel script about linen care", mode: "librarian" });
    expect(screen.queryByRole("button", { name: "Add to canvas" })).toBeNull();
    expect(document.querySelector("[data-chat-proposal]")).toBeNull();
  });

  it("keeps the choice after a message, ready for the next", async () => {
    answer("reasoner");
    await openBoard();
    fireEvent.click(radio("Reasoner"));

    type("how is the board doing?");
    send();
    await waitFor(() => expect(screen.getByText("Assistant · reasoner")).toBeTruthy());

    expect(checked()).toEqual(["Reasoner"]);
  });

  it("asks again in the same mode when a failed reply is retried", async () => {
    let attempts = 0;
    network.on("POST /chat", () =>
      ++attempts === 1
        ? sseResponse([sseFrame("start", { mode: "reasoner" }), sseFrame("error", { code: "stream_failed", message: "x" })])
        : sseResponse([sseFrame("start", { mode: "reasoner" }), sseFrame("token", { token: "ok" }), sseFrame("done", { citedNodeIds: [], proposal: null })]),
    );
    await openBoard();
    fireEvent.click(radio("Reasoner"));
    type("how is the board doing?");
    send();
    await screen.findByText(COPY.chatReplyFailed);
    // The choice is changed in between: a retry is the same question, not a new one.
    fireEvent.click(radio("Librarian"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual({ message: "how is the board doing?", mode: "reasoner" });
  });
});

describe("the Reasoner", () => {
  it("names the nodes with nothing connected, and marks them on the canvas through the citation path", async () => {
    answer("reasoner", { cited: ["nd_b"], text: "1 node connected to nothing: IG reach down 30%." });
    await openBoard();
    fireEvent.click(radio("Reasoner"));

    type("how is the board doing?");
    send();

    await waitFor(() => expect(document.querySelector('[data-node-card="nd_b"]')!.hasAttribute("data-cited")).toBe(true));
    expect(document.querySelector('[data-node-card="nd_a"]')!.hasAttribute("data-cited")).toBe(false);
    expect(screen.getByRole("button", { name: "IG reach down 30%" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Assistant reply" }).textContent).toContain("IG reach down 30%");
  });

  it("says the board is empty, and cites nothing, on a board with no nodes", async () => {
    serve([]);
    answer("reasoner", { text: "This board is empty, so there is no structure to audit yet." });
    await openBoard();
    fireEvent.click(radio("Reasoner"));

    type("how is the board doing?");
    send();

    await waitFor(() => expect(screen.getByRole("status", { name: "Assistant reply" }).textContent).toContain("board is empty"));
    expect(document.querySelectorAll("[data-cited]")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Cited nodes" })).toBeNull();
  });
});

describe("while a reply is streaming", () => {
  it("is disabled, saying to wait, until the stream completes", async () => {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openBoard();
    fireEvent.click(radio("Reasoner"));
    type("how is the board doing?");
    send();
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    for (const r of within(picker()).getAllByRole("radio")) {
      expect(r.getAttribute("aria-disabled")).toBe("true");
      expect(r.title).toBe(COPY.waitForReply);
    }
    fireEvent.click(radio("Generator"));
    expect(checked()).toEqual(["Reasoner"]);
    fireEvent.keyDown(radio("Reasoner"), { key: "ArrowRight" });
    expect(checked()).toEqual(["Reasoner"]);

    await act(async () => {
      stream.push("start", { mode: "reasoner" });
      stream.push("done", { citedNodeIds: [], proposal: null });
      stream.close();
    });
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(false));
    expect(radio("Reasoner").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(radio("Generator"));
    expect(checked()).toEqual(["Generator"]);
  });
});

describe("keeping the choice", () => {
  it("survives the rail being collapsed and opened again", async () => {
    await openBoard();
    fireEvent.click(radio("Reasoner"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    expect(screen.queryByRole("radiogroup", { name: "Reply mode" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(checked()).toEqual(["Reasoner"]);
  });

  it("is kept for the tab's session, in sessionStorage and not localStorage, and read back after a reload", async () => {
    await openBoard();

    fireEvent.click(radio("Librarian"));

    expect(sessionStorage.getItem("mc-chat-mode")).toBe("librarian");
    expect(localStorage.getItem("mc-chat-mode")).toBeNull();
    act(() => uiStore.getState().reset());
    expect(uiStore.getState().chatMode).toBe("librarian");
  });

  it("goes back to Auto for a stored value that is not one of the four, Operator included", async () => {
    for (const bad of ["operator", "bogus", ""]) {
      sessionStorage.setItem("mc-chat-mode", bad);
      act(() => uiStore.getState().reset());
      expect(uiStore.getState().chatMode).toBe("auto");
    }
  });

  it("goes back to Auto once Auto is chosen again, and stores nothing for it", async () => {
    await openBoard();
    fireEvent.click(radio("Reasoner"));

    fireEvent.click(radio("Auto"));

    expect(sessionStorage.getItem("mc-chat-mode")).toBeNull();
    expect(checked()).toEqual(["Auto"]);
  });
});
