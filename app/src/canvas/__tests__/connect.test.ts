// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { apiError, json, network, resetApp, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { byId } from "../../store/records";
import type { CanvasNode, Edge } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { chooseKind, CONNECT_COPY, connectByDrag, exitConnect, pickNode, startConnect } from "../connect";

const T = "2026-09-02T00:00:00.000Z";
const node = (id: string): CanvasNode => ({
  id,
  type: "note",
  title: id,
  body: "",
  fileIds: [],
  x: 0,
  y: 0,
  createdAt: T,
  updatedAt: T,
});

function board(ids: string[], edges: Edge[] = []) {
  appStore.setState({ nodes: byId(ids.map(node)), edges: byId(edges) });
}

const messages = () => uiStore.getState().toasts.map((t) => t.message);
const connect = () => uiStore.getState().connect;

beforeEach(() => {
  resetApp();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user });
  network.on("POST /edges", (call) => json(201, { id: "ed_new", label: null, ...(call.body as object) }));
});

describe("connect mode", () => {
  it("does not activate with fewer than two nodes, and says connections need two", () => {
    board(["a"]);
    expect(startConnect()).toBe(false);
    expect(connect().active).toBe(false);
    expect(messages()).toEqual([CONNECT_COPY.needsTwo]);
  });

  it("creates one serves edge from the source to the target, exits, and flashes both ends", async () => {
    board(["a", "b"]);
    startConnect();
    pickNode("a");
    pickNode("b");
    expect(connect()).toEqual({ active: true, sourceId: "a", targetId: "b" });

    const edge = await chooseKind("serves");

    expect(network.callsTo("POST /edges").map((c) => c.body)).toEqual([{ fromId: "a", toId: "b", kind: "serves" }]);
    expect(edge).toMatchObject({ fromId: "a", toId: "b", kind: "serves" });
    expect(appStore.getState().edges.ed_new).toBeTruthy();
    expect(connect().active).toBe(false);
    expect(uiStore.getState().flashIds).toEqual(["a", "b"]);
  });

  it("refuses a node as its own target, explains why, and creates nothing", () => {
    board(["a", "b"]);
    startConnect("a");
    pickNode("a");

    expect(messages()).toEqual([CONNECT_COPY.self]);
    expect(connect()).toEqual({ active: true, sourceId: null, targetId: null });
    expect(network.callsTo("POST /edges")).toHaveLength(0);
  });

  it("refuses a pair that is already connected, in either direction", () => {
    board(["a", "b"], [{ id: "ed_1", fromId: "a", toId: "b", kind: "relates-to", label: null }]);

    startConnect("b");
    pickNode("a");

    expect(messages()).toEqual([CONNECT_COPY.duplicate]);
    expect(connect().targetId).toBeNull();
    expect(network.callsTo("POST /edges")).toHaveLength(0);
  });

  it("leaves without creating anything when exited with a source picked", () => {
    board(["a", "b"]);
    startConnect();
    pickNode("a");
    exitConnect();

    expect(connect()).toEqual({ active: false, sourceId: null, targetId: null });
    expect(network.callsTo("POST /edges")).toHaveLength(0);
  });

  it("opens the kind picker for a drag between two handles, with the same checks", () => {
    board(["a", "b"]);
    connectByDrag("a", "a");
    expect(connect().active).toBe(false);
    expect(messages()).toEqual([CONNECT_COPY.self]);

    connectByDrag("a", "b");
    expect(connect()).toEqual({ active: true, sourceId: "a", targetId: "b" });
  });

  it("says the nodes are already connected when the API says so", async () => {
    board(["a", "b"]);
    network.on("POST /edges", () => apiError(409, "edge_exists"));
    startConnect("a");
    pickNode("b");

    expect(await chooseKind("relates-to")).toBeNull();
    expect(messages()).toEqual([CONNECT_COPY.duplicate]);
    expect(Object.keys(appStore.getState().edges)).toHaveLength(0);
  });
});
