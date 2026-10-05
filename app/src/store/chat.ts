import type { ChatMessage } from "../types";
import type { SliceCreator } from "./state";

/** Chat lives only in the tab; the API does not persist it. */
export interface ChatSlice {
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
  /**
   * Adds your message and an empty reply, then streams the reply in. Never rejects:
   * a reply that breaks is marked as failed, with your message kept. Blank text, and
   * anything sent while a reply is still streaming, is ignored.
   */
  sendChat: (text: string) => Promise<void>;
  /** Asks again into a failed reply, in place: no second copy of the question. */
  retryChat: (replyId: string) => Promise<void>;
}

let nextId = 1;
const newId = () => `msg_${nextId++}`;

export const createChatSlice: SliceCreator<ChatSlice> = (ctx) => (set, get) => {
  /** Streams the answer to `question` into the reply `replyId`, and settles it. */
  async function streamInto(replyId: string, question: string) {
    // The board may be reset (sign-out) mid-stream; then the reply is gone and this must change nothing.
    const alive = () => get().chatMessages.some((m) => m.id === replyId);
    const update = (change: (message: ChatMessage) => ChatMessage) =>
      set((s) => ({ chatMessages: s.chatMessages.map((m) => (m.id === replyId ? change(m) : m)) }));

    try {
      const done = await ctx.api.chat.stream(
        { message: question },
        {
          onStart: ({ mode }) => update((m) => ({ ...m, mode })),
          onToken: (token) => update((m) => ({ ...m, content: m.content + token })),
        },
      );
      update((m) => ({
        ...m,
        status: "done",
        citedNodeIds: done.citedNodeIds,
        ...(done.proposal ? { proposal: done.proposal } : {}),
      }));
    } catch {
      update((m) => ({ ...m, status: "error" }));
    } finally {
      if (alive()) set({ chatStreaming: false });
    }
  }

  return {
    chatMessages: [],
    chatStreaming: false,

    async sendChat(text) {
      const question = text.trim();
      if (!question || get().chatStreaming) return;
      const createdAt = new Date().toISOString();
      const reply: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: "",
        status: "streaming",
        citedNodeIds: [],
        createdAt,
      };
      const asked: ChatMessage = {
        id: newId(),
        role: "user",
        content: question,
        status: "done",
        citedNodeIds: [],
        createdAt,
      };
      set((s) => ({ chatStreaming: true, chatMessages: [...s.chatMessages, asked, reply] }));
      await streamInto(reply.id, question);
    },

    async retryChat(replyId) {
      const { chatMessages, chatStreaming } = get();
      const at = chatMessages.findIndex((m) => m.id === replyId);
      const reply = chatMessages[at];
      const asked = chatMessages[at - 1];
      if (chatStreaming || reply?.role !== "assistant" || reply.status !== "error" || asked?.role !== "user") return;
      set((s) => ({
        chatStreaming: true,
        chatMessages: s.chatMessages.map((m) =>
          m.id === replyId
            ? { id: m.id, role: m.role, content: "", status: "streaming", citedNodeIds: [], createdAt: m.createdAt }
            : m,
        ),
      }));
      await streamInto(replyId, asked.content);
    },
  };
};
