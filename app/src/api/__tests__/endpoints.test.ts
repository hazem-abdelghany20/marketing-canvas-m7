import { describe, expect, it, vi } from "vitest";
import { ApiError, createClient } from "../client";
import { createEndpoints, type Endpoints } from "../endpoints";
import { apiError, json, stubFetch } from "./helpers";

const BASE = "http://api.test";

function setup(...responders: Parameters<typeof stubFetch>) {
  const { fetch, calls } = stubFetch(...responders);
  const client = createClient({ baseUrl: BASE, getToken: () => "tok", onUnauthorized: vi.fn(), fetch });
  return { api: createEndpoints(client), calls };
}

type Case = [name: string, call: (api: Endpoints) => Promise<unknown>, method: string, path: string, body?: unknown];

const cases: Case[] = [
  ["auth.signup", (a) => a.auth.signup({ name: "Ada", email: "a@b.co", password: "12345678" }), "POST", "/auth/signup", { name: "Ada", email: "a@b.co", password: "12345678" }],
  ["auth.login", (a) => a.auth.login({ email: "a@b.co", password: "12345678" }), "POST", "/auth/login", { email: "a@b.co", password: "12345678" }],
  ["auth.logout", (a) => a.auth.logout(), "POST", "/auth/logout"],
  ["auth.me", (a) => a.auth.me(), "GET", "/me"],
  ["board.get", (a) => a.board.get(), "GET", "/board"],
  ["board.update", (a) => a.board.update({ name: "Q4" }), "PATCH", "/board", { name: "Q4" }],
  ["nodes.list", (a) => a.nodes.list(), "GET", "/nodes"],
  ["nodes.create", (a) => a.nodes.create({ type: "note", x: 1, y: 2 }), "POST", "/nodes", { type: "note", x: 1, y: 2 }],
  ["nodes.get", (a) => a.nodes.get("nd_1"), "GET", "/nodes/nd_1"],
  ["nodes.update", (a) => a.nodes.update("nd_1", { title: "T" }), "PATCH", "/nodes/nd_1", { title: "T" }],
  ["nodes.remove", (a) => a.nodes.remove("nd_1"), "DELETE", "/nodes/nd_1"],
  ["edges.list", (a) => a.edges.list(), "GET", "/edges"],
  ["edges.create", (a) => a.edges.create({ fromId: "a", toId: "b", kind: "serves" }), "POST", "/edges", { fromId: "a", toId: "b", kind: "serves" }],
  ["edges.remove", (a) => a.edges.remove("ed_1"), "DELETE", "/edges/ed_1"],
  ["annotations.list", (a) => a.annotations.list("nd_1"), "GET", "/nodes/nd_1/annotations"],
  ["annotations.create", (a) => a.annotations.create("nd_1", "Hi"), "POST", "/nodes/nd_1/annotations", { body: "Hi" }],
  ["annotations.remove", (a) => a.annotations.remove("an_1"), "DELETE", "/annotations/an_1"],
  ["files.list", (a) => a.files.list(), "GET", "/files"],
  ["files.create", (a) => a.files.create({ name: "a.pdf", mime: "application/pdf", sizeBytes: 3 }), "POST", "/files", { name: "a.pdf", mime: "application/pdf", sizeBytes: 3 }],
  ["files.remove", (a) => a.files.remove("fl_1"), "DELETE", "/files/fl_1"],
  ["strokes.list", (a) => a.strokes.list(), "GET", "/strokes"],
  ["strokes.create", (a) => a.strokes.create({ tool: "pen", color: "c", width: 3, points: [0, 0, 1, 1] }), "POST", "/strokes", { tool: "pen", color: "c", width: 3, points: [0, 0, 1, 1] }],
  ["strokes.clear", (a) => a.strokes.clear(), "DELETE", "/strokes"],
  ["strokes.remove", (a) => a.strokes.remove("st_1"), "DELETE", "/strokes/st_1"],
  ["marks.list", (a) => a.marks.list(), "GET", "/marks"],
  ["marks.create", (a) => a.marks.create({ variant: "sticky", x: 1, y: 2 }), "POST", "/marks", { variant: "sticky", x: 1, y: 2 }],
  ["marks.update", (a) => a.marks.update("mk_1", { body: "B" }), "PATCH", "/marks/mk_1", { body: "B" }],
  ["marks.remove", (a) => a.marks.remove("mk_1"), "DELETE", "/marks/mk_1"],
  ["pins.list", (a) => a.pins.list(), "GET", "/pins"],
  ["pins.create", (a) => a.pins.create({ x: 1, y: 2 }), "POST", "/pins", { x: 1, y: 2 }],
  ["pins.update", (a) => a.pins.update("pn_1", { resolved: true }), "PATCH", "/pins/pn_1", { resolved: true }],
  ["pins.remove", (a) => a.pins.remove("pn_1"), "DELETE", "/pins/pn_1"],
  ["pins.addComment", (a) => a.pins.addComment("pn_1", "Hook lands late."), "POST", "/pins/pn_1/comments", { body: "Hook lands late." }],
  ["pins.removeComment", (a) => a.pins.removeComment("cm_1"), "DELETE", "/comments/cm_1"],
  ["health", (a) => a.health(), "GET", "/health"],
];

describe("endpoints", () => {
  it.each(cases)("%s → %s %s", async (_name, call, method, requestPath, body) => {
    const { api, calls } = setup(json(200, { user: {} }));

    await call(api);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe(method);
    expect(new URL(calls[0]!.url).pathname).toBe(requestPath);
    expect(calls[0]?.body).toEqual(body);
  });

  it("unwraps GET /me to the user", async () => {
    const user = { id: "us_1", name: "Ada", email: "a@b.co", avatarUrl: null };
    const { api } = setup(json(200, { user }));

    await expect(api.auth.me()).resolves.toEqual(user);
  });
});

// ------------------------------------------------------------------ chat SSE

function sse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("chat.stream", () => {
  it("posts the message, reports start and every token, and resolves with done", async () => {
    const body =
      frame("start", { mode: "librarian" }) +
      frame("token", { token: "3 " }) +
      frame("token", { token: "nodes" }) +
      frame("done", { citedNodeIds: ["nd_1"], proposal: null });
    // Split mid-frame to prove the parser buffers across chunk boundaries.
    const { api, calls } = setup(sse([body.slice(0, 17), body.slice(17, 60), body.slice(60)]));
    const onStart = vi.fn();
    const tokens: string[] = [];

    const done = await api.chat.stream({ message: "linen?" }, { onStart, onToken: (t) => tokens.push(t) });

    expect(calls[0]).toMatchObject({ method: "POST", body: { message: "linen?" } });
    expect(new URL(calls[0]!.url).pathname).toBe("/chat");
    expect(onStart).toHaveBeenCalledWith({ mode: "librarian" });
    expect(tokens.join("")).toBe("3 nodes");
    expect(done).toEqual({ citedNodeIds: ["nd_1"], proposal: null });
  });

  it("sends an explicit mode", async () => {
    const { api, calls } = setup(sse([frame("done", { citedNodeIds: [], proposal: null })]));

    await api.chat.stream({ message: "audit", mode: "reasoner" }, {});

    expect(calls[0]?.body).toEqual({ message: "audit", mode: "reasoner" });
  });

  it("rejects with an ApiError when the stream reports an error event", async () => {
    const { api } = setup(
      sse([frame("start", { mode: "librarian" }), frame("token", { token: "partial " }), frame("error", { code: "stream_failed", message: "Interrupted." })]),
    );
    const tokens: string[] = [];

    const error = await api.chat.stream({ message: "__fail" }, { onToken: (t) => tokens.push(t) }).catch((e: unknown) => e);

    expect(tokens).toEqual(["partial "]);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "stream_failed", message: "Interrupted." });
  });

  it("rejects with an ApiError when the stream closes without done", async () => {
    const { api } = setup(sse([frame("start", { mode: "librarian" })]));

    await expect(api.chat.stream({ message: "hi" }, {})).rejects.toMatchObject({ code: "stream_incomplete" });
  });

  it("surfaces a pre-stream JSON error as an ApiError", async () => {
    const { api } = setup(apiError(422, "invalid_mode", "Bad mode.", "mode"));

    await expect(api.chat.stream({ message: "hi" }, {})).rejects.toMatchObject({ code: "invalid_mode", field: "mode" });
  });
});
