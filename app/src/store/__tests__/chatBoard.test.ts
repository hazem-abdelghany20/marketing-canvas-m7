import { describe, expect, it } from "vitest";
import { apiError, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { loadedStore, seededRoutes } from "./fakeBackend";

const IMAGE = "data:image/png;base64,cG5n";
const reply = () =>
  sseResponse([sseFrame("start", { mode: "reasoner" }), sseFrame("token", { token: "Read." }), sseFrame("done", { citedNodeIds: ["nd_camp"], proposal: null })]);

async function chatStore(answer: () => Response) {
  const made = await loadedStore({ ...seededRoutes(), "POST /chat": answer });
  return { ...made, chat: () => made.store.getState(), posts: () => made.backend.callsTo("POST /chat") };
}

describe("sendChat with the board", () => {
  it("sends the picture beside the message, and no mode, so the server reads the board", async () => {
    const { chat, posts } = await chatStore(reply);

    await chat().sendChat("Read my markup on the board.", undefined, { image: IMAGE });

    expect(posts()[0]!.body).toEqual({ message: "Read my markup on the board.", board: { image: IMAGE } });
  });

  it("keeps the picture on your message, so the conversation shows what was sent", async () => {
    const { chat } = await chatStore(reply);

    await chat().sendChat("Read my markup on the board.", undefined, { image: IMAGE });

    expect(chat().chatMessages[0]).toMatchObject({ role: "user", content: "Read my markup on the board.", image: IMAGE, status: "done" });
    expect(chat().chatMessages[1]).toMatchObject({ role: "assistant", status: "done", mode: "reasoner", citedNodeIds: ["nd_camp"] });
  });

  it("sends no picture for an ordinary message", async () => {
    const { chat, posts } = await chatStore(reply);

    await chat().sendChat("what serves the Ramadan push?");

    expect("board" in (posts()[0]!.body as object)).toBe(false);
    expect(chat().chatMessages[0]!.image).toBeUndefined();
  });

  it("keeps your message, with its picture, when the reply fails, and the composer can be used again", async () => {
    const { chat } = await chatStore(() => apiError(503, "forced_failure"));

    await chat().sendChat("Read my markup on the board.", undefined, { image: IMAGE });

    expect(chat().chatStreaming).toBe(false);
    expect(chat().chatMessages[0]).toMatchObject({ role: "user", image: IMAGE });
    expect(chat().chatMessages[1]).toMatchObject({ role: "assistant", status: "error" });
  });

  it("sends the same picture again on retry, without a second copy of the message", async () => {
    let attempts = 0;
    const { chat, posts } = await chatStore(() => (++attempts === 1 ? apiError(503, "forced_failure") : reply()));
    await chat().sendChat("Read my markup on the board.", undefined, { image: IMAGE });

    await chat().retryChat(chat().chatMessages[1]!.id);

    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toEqual({ message: "Read my markup on the board.", board: { image: IMAGE } });
    expect(chat().chatMessages).toHaveLength(2);
    expect(chat().chatMessages[1]).toMatchObject({ status: "done", mode: "reasoner" });
  });
});
