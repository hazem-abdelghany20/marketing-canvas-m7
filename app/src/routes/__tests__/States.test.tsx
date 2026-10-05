// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, serveEmptyBoard, user } from "./harness";

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
  serveEmptyBoard();
});
afterEach(cleanup);

const skeleton = () => document.querySelectorAll("[data-chat-placeholder]");

describe("Workspace loading, S3", () => {
  it("shows the chat rail its own skeleton, three message placeholders, while the board loads", async () => {
    const gate = deferred<Response>();
    network.on("GET /board", () => gate.promise);
    renderAt("/");

    const loading = await screen.findByRole("status", { name: "Loading the conversation" });

    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(skeleton()).toHaveLength(3);
    expect(screen.queryByText(COPY.chatEmptyPrompt)).toBeNull();
    expect(screen.queryByRole("list", { name: "Example prompts" })).toBeNull();
  });

  it("swaps the skeleton for the examples when the board arrives, with no change to the rail's width", async () => {
    const gate = deferred<Response>();
    network.on("GET /board", () => gate.promise);
    renderAt("/");
    await screen.findByRole("status", { name: "Loading the conversation" });
    const rail = screen.getByRole("complementary", { name: "Assistant" });

    gate.resolve(json(200, emptyBoard));

    await screen.findByText(COPY.chatEmptyPrompt);
    expect(skeleton()).toHaveLength(0);
    expect(screen.getByRole("complementary", { name: "Assistant" })).toBe(rail);
  });

  it("does not hide a conversation behind the skeleton when there already is one", async () => {
    const gate = deferred<Response>();
    network.on("GET /board", () => gate.promise);
    appStore.setState({
      chatMessages: [
        {
          id: "q",
          role: "user",
          content: "hello again",
          status: "done",
          citedNodeIds: [],
          createdAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    renderAt("/");

    expect(await screen.findByText("hello again")).toBeTruthy();
    expect(skeleton()).toHaveLength(0);
  });
});

describe("Workspace error, S3", () => {
  it("says the board didn't load, to check the connection, as an alert with a Reload that works", async () => {
    network.on("GET /board", () => apiError(503, "forced_failure"));
    renderAt("/");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load your board. Check your connection, then reload.");

    network.on("GET /board", () => json(200, emptyBoard));
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("Nothing on the canvas yet.")).toBeTruthy();
  });

  it("says a board that came back unreadable is a different problem from being offline, and still offers Reload", async () => {
    network.on("GET /board", () => new Response("<html>not a board</html>", { status: 200 }));
    renderAt("/");

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(COPY.boardUnreadable);
    expect(alert.textContent).not.toContain("Check your connection");
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("tells the toolbar the board did not load, rather than that it is still being waited for", async () => {
    network.on("GET /board", () => apiError(503, "forced_failure"));
    renderAt("/");
    await screen.findByRole("alert");

    const fit = screen.getByRole("button", { name: "Fit to screen" });

    expect(fit.title).toBe(COPY.boardFailed);
    expect(fit.title).not.toBe(COPY.loading);
  });
});

describe("Workspace empty, S3", () => {
  it("is a heading, a way in and a line naming the six types, with Fit and Auto-arrange explaining why they wait", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Nothing on the canvas yet." })).toBeTruthy();
    expect(screen.getByText(/goal, strategy, campaign, content, asset and note/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add your first node" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fit to screen" }).title).toBe(COPY.nothingToFit);
    expect(screen.getByRole("button", { name: "Auto-arrange" }).title).toBe(COPY.nothingToArrange);
  });

  it("keeps the first-run panel off the screen while a dropped file is still being read, so it never sits over its card", async () => {
    renderAt("/");
    await screen.findByText("Nothing on the canvas yet.");

    uiStore.getState().addPending({ id: "p1", name: "hero.png", mime: "image/png", sizeBytes: 100, x: 0, y: 0 });

    await waitFor(() => expect(screen.queryByText("Nothing on the canvas yet.")).toBeNull());
  });
});

describe("Workspace loading status", () => {
  it("is announced in words, not by an empty spinner", async () => {
    const gate = deferred<Response>();
    network.on("GET /board", () => gate.promise);
    renderAt("/");

    const status = await screen.findByRole("status", { name: "Loading your board" });

    expect(status.textContent).toContain("Loading your board");
  });
});
