import type { ChatMessage } from "../types";
import type { SliceCreator } from "./state";

/** Chat lives only in the tab; the API does not persist it. Sending arrives with ticket 012. */
export interface ChatSlice {
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
}

export const createChatSlice: SliceCreator<ChatSlice> = () => () => ({
  chatMessages: [],
  chatStreaming: false,
});
