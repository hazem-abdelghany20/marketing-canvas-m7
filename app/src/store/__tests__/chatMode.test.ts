import { describe, expect, it, vi } from "vitest";
import { apiError, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { loadedStore, seededRoutes } from "./fakeBackend";

const done = (citedNodeIds: string[] = [], proposal: unknown = null) => sseFrame("done", { citedNodeIds, proposal });
const reply = (mode: string) => sseResponse([sseFrame("start", { mode }), sseFrame("token", { token: "Ok." }), done()]);

async function chatStore(answer: () => Response) {
  const made = await loadedStore({ ...seededRoutes(), "POST /chat": answer });
  return { ...made, chat: () => made.store.getState(), posts: () => made.backend.callsTo("POST /chat") };
}

describe("sendChat with a mode", () => {
  it("sends no mode at all for Auto, so the server picks as it always did", async () => {
    const { chat, posts } = await chatStore(() => reply("librarian"));

    await chat().sendChat("what serves the Ramadan push?");
    await chat().sendChat("what serves the Ramadan push?", "auto");

    expect(posts()).toHaveLength(2);
    for (const call of posts()) {
      expect(call.body).toEqual({ message: "what serves the Ramadan push?" });
      expect("mode" in (call.body as object)).toBe(false);
    }
  });

  it.each(["generator", "librarian", "reasoner"] as const)("sends %s, and only that", async (mode) => {
    const { chat, posts } = await chatStore(() => reply(mode));

    await chat().sendChat("how is the board doing?", mode);

    expect(posts()[0]!.body).toEqual({ message: "how is the board doing?", mode });
  });

  it("shows the mode the server answered in, whatever was asked for", async () => {
    const { chat } = await chatStore(() => reply("librarian"));

    await chat().sendChat("Draft a reel script about linen care", "librarian");

    expect(chat().chatMessages[1]).toMatchObject({ role: "assistant", status: "done", mode: "librarian" });
    expect(chat().chatMessages[1]!.proposal).toBeUndefined();
  });

  it("remembers the mode on the question, so a retry asks the same way", async () => {
    let attempts = 0;
    const { chat, posts } = await chatStore(() => (++attempts === 1 ? apiError(503, "forced_failure") : reply("reasoner")));

    await chat().sendChat("how is the board doing?", "reasoner");
    expect(chat().chatMessages[0]).toMatchObject({ role: "user", requestedMode: "reasoner" });
    expect(chat().chatMessages[1]!.status).toBe("error");
    await chat().retryChat(chat().chatMessages[1]!.id);

    await vi.waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual({ message: "how is the board doing?", mode: "reasoner" });
    expect(chat().chatMessages).toHaveLength(2);
  });

  it("retries an Auto question as Auto, with no mode", async () => {
    let attempts = 0;
    const { chat, posts } = await chatStore(() => (++attempts === 1 ? apiError(503, "forced_failure") : reply("librarian")));

    await chat().sendChat("what serves the Ramadan push?");
    await chat().retryChat(chat().chatMessages[1]!.id);

    expect("mode" in (posts()[1]!.body as object)).toBe(false);
  });
});
