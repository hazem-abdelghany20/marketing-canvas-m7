// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import type { Annotation, CanvasNode, Edge } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, user } from "./harness";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string, type: CanvasNode["type"], title: string, x = 0): CanvasNode => ({
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

// content → strategy → goal, plus a node with no connections at all.
const nodes = [
  node("nd_goal", "goal", "500 orders", 0),
  node("nd_str", "strategy", "Vayn ICP", 300),
  node("nd_reel", "content", "Reel: linen", 600),
  node("nd_lone", "note", "Loose thought", 900),
];
const edges: Edge[] = [
  { id: "ed_1", fromId: "nd_str", toId: "nd_goal", kind: "serves", label: null },
  { id: "ed_2", fromId: "nd_reel", toId: "nd_str", kind: "serves", label: null },
];

function serveBoard(annotations: Annotation[] = []) {
  network.on("GET /board", () => json(200, emptyBoard));
  network.on("GET /nodes", () => json(200, nodes));
  network.on("GET /edges", () => json(200, edges));
  for (const p of ["/files", "/strokes", "/marks", "/pins"]) network.on(`GET ${p}`, () => json(200, []));
  for (const n of nodes) {
    network.on(`GET /nodes/${n.id}/annotations`, () => json(200, annotations.filter((a) => a.nodeId === n.id)));
    network.on(`PATCH /nodes/${n.id}`, (call) =>
      json(200, { ...appStore.getState().nodes[n.id], ...(call.body as object), updatedAt: "2026-09-03T00:00:00.000Z" }),
    );
  }
}

beforeEach(() => {
  resetApp();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  serveBoard();
});
afterEach(cleanup);

async function open(id: string, state?: unknown) {
  const rendered = renderAt(`/node/${id}`);
  if (state) await act(() => rendered.router.navigate(`/node/${id}`, { state }));
  const panel = await screen.findByRole("complementary", { name: "Node detail" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return { ...rendered, panel };
}

const title = () => screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
const cardFor = (id: string) => document.querySelector(`[data-node-card="${id}"]`) as HTMLElement;

describe("NodeDetail", () => {
  it("saves an edited title when focus leaves, and the canvas card shows it without a reload", async () => {
    await open("nd_str");
    await waitFor(() => expect(title().value).toBe("Vayn ICP"));

    fireEvent.focus(title());
    fireEvent.change(title(), { target: { value: "Vayn ICP: 25-34 urban women" } });
    fireEvent.blur(title());

    await waitFor(() => expect(network.callsTo("PATCH /nodes/nd_str")).toHaveLength(1));
    expect(network.callsTo("PATCH /nodes/nd_str")[0]!.body).toEqual({ title: "Vayn ICP: 25-34 urban women" });
    await waitFor(() => expect(cardFor("nd_str").textContent).toContain("Vayn ICP: 25-34 urban women"));
  });

  it("changes the type, and the card takes the new type at once", async () => {
    await open("nd_str");

    fireEvent.click(screen.getByRole("button", { name: /^Type: Strategy/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Campaign/ }));

    expect(cardFor("nd_str").dataset.type).toBe("campaign");
    await waitFor(() => expect(network.callsTo("PATCH /nodes/nd_str")[0]?.body).toEqual({ type: "campaign" }));
  });

  it("lists outgoing serves edges under Serves and incoming ones under Served by", async () => {
    await open("nd_str");

    const serves = screen.getByRole("list", { name: "Serves" });
    const servedBy = screen.getByRole("list", { name: "Served by" });
    expect(within(serves).getByRole("button", { name: /^500 orders, Goal/ })).toBeTruthy();
    expect(within(servedBy).getByRole("button", { name: /^Reel: linen, Content/ })).toBeTruthy();
  });

  it("shows the same stored edge from the other end", async () => {
    await open("nd_goal");
    const servedBy = screen.getByRole("list", { name: "Served by" });
    expect(within(servedBy).getByRole("button", { name: /^Vayn ICP, Strategy/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Serves" })).toBeNull();
  });

  it("keeps the panel on the opened node when a connection row is clicked, and selects the other node", async () => {
    const { router } = await open("nd_str");

    fireEvent.click(within(screen.getByRole("list", { name: "Serves" })).getByRole("button", { name: /^500 orders/ }));

    expect(router.state.location.pathname).toBe("/node/nd_str");
    expect(title().value).toBe("Vayn ICP");
    expect(uiStore.getState().selectedIds).toEqual(["nd_goal"]);
  });

  it("never sends a whitespace-only annotation", async () => {
    await open("nd_str");
    const box = screen.getByRole("textbox", { name: "New annotation" });
    const add = screen.getByRole("button", { name: "Add note" });

    fireEvent.change(box, { target: { value: "   \n  " } });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(add);
    fireEvent.submit(add.closest("form")!);

    expect(network.callsTo("POST /nodes/nd_str/annotations")).toHaveLength(0);
  });

  it("adds a timestamped annotation", async () => {
    network.on("POST /nodes/nd_str/annotations", (call) =>
      json(201, { id: "an_new", nodeId: "nd_str", createdAt: T, ...(call.body as object) }),
    );
    await open("nd_str");

    fireEvent.change(screen.getByRole("textbox", { name: "New annotation" }), { target: { value: " Check stock " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(document.querySelector("[data-annotation=an_new]")?.textContent).toContain("Check stock"));
    expect(network.callsTo("POST /nodes/nd_str/annotations")[0]!.body).toEqual({ body: "Check stock" });
    expect(document.querySelector("[data-annotation=an_new] time")).not.toBeNull();
  });

  it("says a missing node doesn't exist, offers the way back, and never reads like a save failure", async () => {
    const { router } = await open("nd_deleted");

    const heading = await screen.findByRole("heading", { name: "That node doesn't exist." });
    expect(heading).toBeTruthy();
    expect(screen.getByText("It may have been deleted.")).toBeTruthy();
    expect(screen.queryByText(COPY.autosaveFailed)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to canvas" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows the empty connections state with a connect action", async () => {
    const { panel } = await open("nd_lone");
    expect(screen.getByText("Not connected to anything yet")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Connect" }));
    expect(uiStore.getState().connect).toEqual({ active: true, sourceId: "nd_lone", targetId: null });
  });

  it("locks the type picker while an autosave is in flight, and typing carries on", async () => {
    const gate = deferred<Response>();
    network.on("PATCH /nodes/nd_str", () => gate.promise);
    await open("nd_str");

    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Buys for herself" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Description" }));

    const picker = await screen.findByRole("button", { name: /^Type: Strategy/ });
    await waitFor(() => expect(picker.getAttribute("aria-disabled")).toBe("true"));
    expect(document.querySelector("[data-save-state]")!.textContent).toBe("Saving…");

    fireEvent.change(title(), { target: { value: "Still typing" } });
    expect(title().value).toBe("Still typing");
    expect(title().disabled || title().readOnly).toBe(false);

    gate.resolve(json(200, { ...nodes[1], body: "Buys for herself" }));
    await waitFor(() => expect(picker.getAttribute("aria-disabled")).toBeNull());
  });

  it("keeps the text and says changes aren't saving when an autosave fails", async () => {
    network.on("PATCH /nodes/nd_str", () => apiError(503, "forced_failure"));
    await open("nd_str");

    fireEvent.change(title(), { target: { value: "Unsaved words" } });
    fireEvent.blur(title());

    expect((await screen.findByRole("alert")).textContent).toBe(COPY.autosaveFailed);
    expect(title().value).toBe("Unsaved words");
  });

  it("closes and says so when the open node is deleted", async () => {
    const { router } = await open("nd_str");

    act(() => {
      const { nd_str: _gone, ...rest } = appStore.getState().nodes;
      appStore.setState({ nodes: rest });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(uiStore.getState().toasts.map((t) => t.message)).toContain(COPY.nodeDeletedElsewhere);
  });

  it("focuses the title of a freshly created node", async () => {
    await open("nd_lone", { focusTitle: true });
    await waitFor(() => expect(document.activeElement).toBe(title()));
  });

  it("closes on Escape and on the close button, returning to the canvas", async () => {
    const { router } = await open("nd_str");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(router.state.location.pathname).toBe("/");

    await act(() => router.navigate("/node/nd_str"));
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows the panel's shape while a deep link waits for the board", async () => {
    const gate = deferred<Response>();
    network.on("GET /board", () => gate.promise);
    renderAt("/node/nd_str");

    expect(await screen.findByRole("status", { name: "Loading node" })).toBeTruthy();
    gate.resolve(json(200, emptyBoard));
    await waitFor(() => expect(title().value).toBe("Vayn ICP"));
  });
});
