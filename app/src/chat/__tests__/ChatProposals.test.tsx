// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deferred,
  emptyBoard,
  json,
  apiError,
  network,
  renderAt,
  resetApp,
  user,
} from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { CanvasNode, ChatMessage, Proposal } from "../../types";
import { uiStore } from "../../ui/uiStore";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, type: CanvasNode["type"], title: string, x: number): CanvasNode => ({
  id,
  type,
  title,
  body: "",
  fileIds: [],
  x,
  y: 0,
  createdAt: T,
  updatedAt: T,
});
const nodes = [
  node("nd_goal", "goal", "500 orders", 0),
  node("nd_camp", "campaign", "Ramadan push", 600),
  node("nd_reel", "content", "Reel", 1200),
];

let seq = 0;
beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, []));
  for (const p of ["/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) network.on(`GET /nodes/${n.id}/annotations`, () => json(200, []));
  network.on("POST /nodes", (c) =>
    json(201, { fileIds: [], body: "", ...(c.body as object), id: `nd_new${++seq}`, createdAt: T, updatedAt: T }),
  );
  network.on("POST /edges", (c) => json(201, { label: null, ...(c.body as object), id: `ed_new${++seq}` }));
  network.on("DELETE /nodes/nd_new1", () => json(204));
  network.on("DELETE /edges/ed_new2", () => json(204));
});
afterEach(cleanup);

const generated: Proposal = {
  kind: "create-node",
  payload: { type: "content", title: "Reel: linen care", body: "Hook at 0:02." },
};
const connecting: Proposal = { kind: "create-edge", payload: { fromId: "nd_reel", toId: "nd_goal", kind: "serves" } };

function says(proposal: Proposal | undefined, extra: Partial<ChatMessage> = {}): ChatMessage[] {
  return [
    { id: "q1", role: "user", content: "do it", status: "done", citedNodeIds: [], createdAt: T },
    {
      id: "r1",
      role: "assistant",
      content: "Here.",
      status: "done",
      citedNodeIds: [],
      createdAt: T,
      mode: "generator",
      proposal,
      ...extra,
    },
  ];
}
async function openWith(messages: ChatMessage[]) {
  renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("textbox", { name: "Message" });
  act(() => appStore.setState({ chatMessages: messages }));
}
const addButton = () => screen.getByRole("button", { name: /^(Add to canvas|Adding…|Added)/ });
const posts = (route: string) => network.callsTo(route);

describe("proposal card", () => {
  it("offers a proposed node: what it is, its title, a preview and Add to canvas", async () => {
    await openWith(says(generated));

    expect(screen.getByText("Proposed node")).toBeTruthy();
    expect(screen.getByText("Reel: linen care")).toBeTruthy();
    expect(screen.getByText("Hook at 0:02.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeTruthy();
  });

  it("offers a proposed connection by the titles of the two nodes", async () => {
    await openWith(says(connecting));

    expect(screen.getByText("Proposed connection")).toBeTruthy();
    expect(screen.getByText("Reel → 500 orders")).toBeTruthy();
  });

  it("is not there for a reply with no proposal, or one that did not finish", async () => {
    await openWith(says(undefined));
    expect(screen.queryByRole("button", { name: "Add to canvas" })).toBeNull();

    act(() => appStore.setState({ chatMessages: says(generated, { status: "error" }) }));
    expect(screen.queryByRole("button", { name: "Add to canvas" })).toBeNull();
  });
});

describe("Add to canvas", () => {
  it("creates the node, then shows a non-interactive Added that cannot create another", async () => {
    await openWith(says(generated));

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));

    await waitFor(() => expect(addButton().textContent).toContain("Added"));
    expect(posts("POST /nodes")).toHaveLength(1);
    expect(posts("POST /nodes")[0]!.body).toMatchObject({
      type: "content",
      title: "Reel: linen care",
      body: "Hook at 0:02.",
    });
    expect(addButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(addButton());
    await new Promise((r) => setTimeout(r, 50));
    expect(posts("POST /nodes")).toHaveLength(1);
    expect(appStore.getState().nodes.nd_new1).toBeTruthy();
  });

  it("shows Adding… and sends one request however many times it is pressed while the request is out", async () => {
    const gate = deferred<Response>();
    network.on("POST /nodes", () => gate.promise);
    await openWith(says(generated));

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(addButton().textContent).toContain("Adding"));
    fireEvent.click(addButton());
    fireEvent.click(addButton());

    expect(addButton().getAttribute("aria-disabled")).toBe("true");
    gate.resolve(json(201, { ...nodes[0]!, id: "nd_slow", title: "Reel: linen care" }));
    await waitFor(() => expect(addButton().textContent).toContain("Added"));
    expect(posts("POST /nodes")).toHaveLength(1);
  });

  it("goes back to Add to canvas when the node is undone, from the toast", async () => {
    await openWith(says(generated));
    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));
    const toast = (await screen.findByText(/Added .*Reel: linen care/)).closest("[role=status]") as HTMLElement;
    await waitFor(() => expect(addButton().textContent).toContain("Added"));

    fireEvent.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add to canvas" })).toBeTruthy());
    expect(appStore.getState().nodes.nd_new1).toBeUndefined();
  });

  it("goes back to Add to canvas on Cmd/Ctrl+Z, too", async () => {
    await openWith(says(generated));
    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(addButton().textContent).toContain("Added"));
    await waitFor(() => expect(appStore.getState().undoStack).toHaveLength(1));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => expect(screen.getByRole("button", { name: "Add to canvas" })).toBeTruthy());
  });

  it("stays Added through collapsing and opening the rail", async () => {
    await openWith(says(generated));
    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));
    await waitFor(() => expect(addButton().textContent).toContain("Added"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(addButton().textContent).toContain("Added");
  });

  it("creates the connection and shows Added for a proposed connection", async () => {
    await openWith(says(connecting));

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));

    await waitFor(() => expect(addButton().textContent).toContain("Added"));
    expect(posts("POST /edges")[0]!.body).toEqual({ fromId: "nd_reel", toId: "nd_goal", kind: "serves" });
  });

  it("says which node is missing, and creates no connection, when one has been deleted", async () => {
    await openWith(says(connecting, { proposalTitles: { nd_reel: "Reel", nd_goal: "500 orders" } }));
    act(() =>
      appStore.setState((s) => ({
        nodes: Object.fromEntries(Object.entries(s.nodes).filter(([id]) => id !== "nd_goal")),
      })),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));

    expect((await screen.findByRole("alert")).textContent).toContain("500 orders");
    expect(posts("POST /edges")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Add to canvas" })).toBeTruthy();
  });

  it("asks you to check your connection, and stays actionable, when the API fails", async () => {
    network.on("POST /nodes", () => apiError(503, "forced_failure", "Down."));
    await openWith(says(generated));

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't add that to the canvas. Check your connection and try again.",
    );
    expect(screen.getByRole("button", { name: "Add to canvas" }).getAttribute("aria-disabled")).toBeNull();
  });
});
