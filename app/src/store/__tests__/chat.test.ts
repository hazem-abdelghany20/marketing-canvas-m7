import { describe, expect, it, vi } from "vitest";
import { apiError, controlledSse, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { loadedStore, seededRoutes } from "./fakeBackend";

const done = (citedNodeIds: string[] = [], proposal: unknown = null) => sseFrame("done", { citedNodeIds, proposal });

/** A store whose POST /chat answers with whatever `answer` returns each time it is called. */
async function chatStore(answer: () => Response) {
  const made = await loadedStore({ ...seededRoutes(), "POST /chat": answer });
  const chat = () => made.store.getState();
  return { ...made, chat, posts: () => made.backend.callsTo("POST /chat") };
}

describe("sendChat", () => {
  it("adds your message and a streaming reply, fills the reply token by token, and settles on done", async () => {
    const stream = controlledSse();
    const { chat, posts } = await chatStore(() => stream.response);

    const sent = chat().sendChat("what serves the Ramadan push?");
    await vi.waitFor(() => expect(posts()).toHaveLength(1));

    expect(chat().chatStreaming).toBe(true);
    const [mine, reply] = chat().chatMessages;
    expect(mine).toMatchObject({ role: "user", content: "what serves the Ramadan push?", status: "done" });
    expect(reply).toMatchObject({ role: "assistant", content: "", status: "streaming", citedNodeIds: [] });

    stream.push("start", { mode: "librarian" });
    stream.push("token", { token: "3 nodes " });
    await vi.waitFor(() => expect(chat().chatMessages[1]?.content).toBe("3 nodes "));
    stream.push("token", { token: "speak to that." });
    await vi.waitFor(() => expect(chat().chatMessages[1]?.content).toBe("3 nodes speak to that."));
    expect(chat().chatMessages[1]?.status).toBe("streaming");
    expect(chat().chatMessages[1]).toMatchObject({ mode: "librarian" });

    stream.push("done", { citedNodeIds: ["nd_camp"], proposal: { kind: "create-node", payload: { title: "T" } } });
    stream.close();
    await sent;

    expect(chat().chatStreaming).toBe(false);
    expect(chat().chatMessages[1]).toMatchObject({
      status: "done",
      content: "3 nodes speak to that.",
      citedNodeIds: ["nd_camp"],
      proposal: { kind: "create-node", payload: { title: "T" } },
    });
  });

  it("changes nothing on the canvas, whatever the reply proposes or cites", async () => {
    const { chat, backend, store } = await chatStore(() =>
      sseResponse([
        sseFrame("token", { token: "Here." }),
        done(["nd_goal"], { kind: "create-edge", payload: { fromId: "nd_reel", toId: "nd_camp", kind: "serves" } }),
      ]),
    );
    const nodesBefore = structuredClone(store.getState().nodes);
    const edgesBefore = structuredClone(store.getState().edges);

    await chat().sendChat("connect the reel to the campaign");

    expect(backend.callsTo("POST /nodes")).toHaveLength(0);
    expect(backend.callsTo("POST /edges")).toHaveLength(0);
    expect(store.getState().nodes).toEqual(nodesBefore);
    expect(store.getState().edges).toEqual(edgesBefore);
  });

  it("is already streaming the moment sendChat returns, so a second call in the same tick is refused", async () => {
    const stream = controlledSse();
    const { chat, posts } = await chatStore(() => stream.response);

    const first = chat().sendChat("one");
    const second = chat().sendChat("two");

    expect(chat().chatStreaming).toBe(true);
    await second;
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await first;
    expect(posts()).toHaveLength(1);
  });

  it("posts just the message, trimmed, and gives every message its own id and a real time", async () => {
    const { chat, posts } = await chatStore(() => sseResponse([done()]));

    await chat().sendChat("  hello  ");
    await chat().sendChat("again");

    expect(posts().map((c) => c.body)).toEqual([{ message: "hello" }, { message: "again" }]);
    const messages = chat().chatMessages;
    expect(new Set(messages.map((m) => m.id)).size).toBe(4);
    for (const m of messages) expect(Number.isNaN(Date.parse(m.createdAt))).toBe(false);
  });

  it("sends nothing for a blank message", async () => {
    const { chat, posts } = await chatStore(() => sseResponse([done()]));

    await chat().sendChat("   \n ");

    expect(posts()).toHaveLength(0);
    expect(chat().chatMessages).toEqual([]);
    expect(chat().chatStreaming).toBe(false);
  });

  it("ignores a second message while a reply is still streaming", async () => {
    const stream = controlledSse();
    const { chat, posts } = await chatStore(() => stream.response);
    const first = chat().sendChat("one");
    await vi.waitFor(() => expect(posts()).toHaveLength(1));

    await chat().sendChat("two");

    expect(posts()).toHaveLength(1);
    expect(chat().chatMessages.map((m) => m.content)).toEqual(["one", ""]);
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await first;
  });

  it("when the stream breaks, keeps your message and what arrived, marks the reply as failed, and frees the composer", async () => {
    const { chat } = await chatStore(() =>
      sseResponse([
        sseFrame("start", { mode: "librarian" }),
        sseFrame("token", { token: "Half a " }),
        sseFrame("error", { code: "stream_failed", message: "The response was interrupted." }),
      ]),
    );

    await expect(chat().sendChat("what is going on __fail")).resolves.toBeUndefined();

    const [mine, reply] = chat().chatMessages;
    expect(mine).toMatchObject({ role: "user", content: "what is going on __fail", status: "done" });
    expect(reply).toMatchObject({ role: "assistant", status: "error", content: "Half a " });
    expect(chat().chatStreaming).toBe(false);
  });

  it("treats a dropped connection and a refused request as failed replies too", async () => {
    let attempt = 0;
    const { chat, backend } = await chatStore(() => sseResponse([done()]));
    backend.on("POST /chat", () => {
      attempt++;
      if (attempt === 1) throw new TypeError("Failed to fetch");
      return apiError(503, "forced_failure", "Down.");
    });

    await chat().sendChat("first");
    await chat().sendChat("second");

    expect(chat().chatMessages.map((m) => [m.role, m.status])).toEqual([
      ["user", "done"],
      ["assistant", "error"],
      ["user", "done"],
      ["assistant", "error"],
    ]);
    expect(chat().chatStreaming).toBe(false);
  });
});

describe("retryChat", () => {
  async function failedOnce() {
    let attempt = 0;
    const made = await chatStore(() =>
      ++attempt === 1
        ? sseResponse([
            sseFrame("token", { token: "Half a " }),
            sseFrame("error", { code: "stream_failed", message: "x" }),
          ])
        : sseResponse([
            sseFrame("start", { mode: "librarian" }),
            sseFrame("token", { token: "Whole answer." }),
            done(["nd_goal"]),
          ]),
    );
    await made.chat().sendChat("what is going on?");
    return made;
  }

  it("asks again into the same reply: no second copy of your message, and the partial text is replaced", async () => {
    const { chat, posts } = await failedOnce();
    const failed = chat().chatMessages[1]!;

    await chat().retryChat(failed.id);

    expect(posts().map((c) => c.body)).toEqual([{ message: "what is going on?" }, { message: "what is going on?" }]);
    expect(chat().chatMessages).toHaveLength(2);
    expect(chat().chatMessages[1]).toMatchObject({
      id: failed.id,
      status: "done",
      content: "Whole answer.",
      citedNodeIds: ["nd_goal"],
    });
    expect(chat().chatStreaming).toBe(false);
  });

  it("shows the reply as streaming again while it retries", async () => {
    const { chat, backend } = await failedOnce();
    const stream = controlledSse();
    backend.on("POST /chat", () => stream.response);

    const retrying = chat().retryChat(chat().chatMessages[1]!.id);

    await vi.waitFor(() => expect(chat().chatMessages[1]).toMatchObject({ status: "streaming", content: "" }));
    expect(chat().chatStreaming).toBe(true);
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await retrying;
  });

  it("does nothing for a reply that did not fail, or for an id it does not have", async () => {
    const { chat, posts } = await chatStore(() => sseResponse([sseFrame("token", { token: "Fine." }), done()]));
    await chat().sendChat("fine?");

    await chat().retryChat(chat().chatMessages[1]!.id);
    await chat().retryChat("not-an-id");

    expect(posts()).toHaveLength(1);
    expect(chat().chatMessages[1]).toMatchObject({ status: "done", content: "Fine." });
  });

  it("refuses to retry an old failed reply while a newer one is streaming", async () => {
    const stream = controlledSse();
    let attempt = 0;
    const { chat, posts, backend } = await chatStore(() => {
      attempt++;
      return attempt === 1
        ? sseResponse([sseFrame("error", { code: "stream_failed", message: "x" })])
        : stream.response;
    });
    await chat().sendChat("first question");
    const failed = chat().chatMessages[1]!;
    expect(failed.status).toBe("error");
    const next = chat().sendChat("second question");
    await vi.waitFor(() => expect(posts()).toHaveLength(2));

    await chat().retryChat(failed.id);

    expect(posts()).toHaveLength(2);
    expect(chat().chatMessages[1]).toMatchObject({ id: failed.id, status: "error" });
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await next;
    expect(backend.callsTo("POST /chat")).toHaveLength(2);
  });

  it("asks the question that reply belongs to, not the latest one, and leaves the others alone", async () => {
    let attempt = 0;
    const { chat, posts } = await chatStore(() => {
      attempt++;
      if (attempt === 1) return sseResponse([sseFrame("error", { code: "stream_failed", message: "x" })]);
      return sseResponse([sseFrame("token", { token: `answer ${attempt}` }), done()]);
    });
    await chat().sendChat("question A");
    await chat().sendChat("question B");
    const [, replyA, , replyB] = chat().chatMessages;

    await chat().retryChat(replyA!.id);

    expect(posts().map((c) => c.body)).toEqual([
      { message: "question A" },
      { message: "question B" },
      { message: "question A" },
    ]);
    expect(chat().chatMessages).toHaveLength(4);
    expect(chat().chatMessages[3]).toMatchObject({ id: replyB!.id, content: "answer 2" });
    expect(chat().chatMessages[1]).toMatchObject({ id: replyA!.id, status: "done", content: "answer 3" });
  });
});

describe("chat and the session", () => {
  it("drops a reply that arrives after the board was reset, and does not leave the next chat stuck", async () => {
    const stale = controlledSse();
    const { chat, backend, store } = await chatStore(() => stale.response);
    const sent = chat().sendChat("hello");
    await vi.waitFor(() => expect(chat().chatStreaming).toBe(true));

    store.getState().resetBoard(); // signing out
    expect(chat().chatMessages).toEqual([]);
    expect(chat().chatStreaming).toBe(false);

    const fresh = controlledSse();
    backend.on("POST /chat", () => fresh.response);
    const next = chat().sendChat("new session");
    await vi.waitFor(() => expect(chat().chatStreaming).toBe(true));

    // The old stream finishes late. It must not bring its messages back or free the new one's composer.
    stale.push("token", { token: "ghost" });
    stale.push("done", { citedNodeIds: [], proposal: null });
    stale.close();
    await sent;

    expect(chat().chatMessages.map((m) => m.content)).toEqual(["new session", ""]);
    expect(chat().chatStreaming).toBe(true);
    fresh.push("done", { citedNodeIds: [], proposal: null });
    fresh.close();
    await next;
    expect(chat().chatStreaming).toBe(false);
  });
});
