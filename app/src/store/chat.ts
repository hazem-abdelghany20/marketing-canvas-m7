import type { ChatDone, ChatMessage } from "../types";
import type { AppState, SliceCreator } from "./state";

/** What a proposal created, so the reply can tell whether it is still on the canvas. */
export interface AppliedRef {
  kind: "node" | "edge";
  id: string;
}

/** Chat lives only in the tab; the API does not persist it. */
export interface ChatSlice {
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
  /** Replies whose proposal has been added to the canvas, by message id. */
  chatApplied: Record<string, AppliedRef>;
  markProposalApplied: (messageId: string, ref: AppliedRef) => void;
  /**
   * Adds your message and an empty reply, then streams the reply in. Never rejects:
   * a reply that breaks is marked as failed, with your message kept. Blank text, and
   * anything sent while a reply is still streaming, is ignored.
   */
  sendChat: (text: string) => Promise<void>;
  /** Asks again into a failed reply, in place: no second copy of the question. */
  retryChat: (replyId: string) => Promise<void>;
}

/**
 * A proposal counts as applied only while what it created is still there, so undoing it (or
 * deleting the node) frees the action to be used again.
 */
export function isProposalApplied(state: AppState, messageId: string): boolean {
  const ref = state.chatApplied[messageId];
  if (!ref) return false;
  return ref.kind === "node" ? ref.id in state.nodes : ref.id in state.edges;
}

let nextId = 1;
const newId = () => `msg_${nextId++}`;

/** The titles of the two nodes a connection proposal names, while they are still on the canvas. */
function proposalTitles(proposal: ChatDone["proposal"], nodes: AppState["nodes"]): Record<string, string> | undefined {
  if (proposal?.kind !== "create-edge") return undefined;
  const titles: Record<string, string> = {};
  for (const id of [proposal.payload.fromId, proposal.payload.toId]) {
    const node = id ? nodes[id] : undefined;
    if (id && node) titles[id] = node.title.trim() || "Untitled";
  }
  return titles;
}

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
      const titles = proposalTitles(done.proposal, get().nodes);
      update((m) => ({
        ...m,
        status: "done",
        citedNodeIds: done.citedNodeIds,
        ...(done.proposal ? { proposal: done.proposal } : {}),
        ...(titles ? { proposalTitles: titles } : {}),
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
    chatApplied: {},
    markProposalApplied: (messageId, ref) => set((s) => ({ chatApplied: { ...s.chatApplied, [messageId]: ref } })),

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
