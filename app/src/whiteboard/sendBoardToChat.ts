import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";
import { currentScene, renderBoardPng } from "./exportPng";

/** What your message says; the picture is what it is about. */
export const BOARD_MESSAGE = "Read my markup on the board.";

/**
 * The API refuses a request over 2MB, and reading a board has no use for 2x detail. So the picture is drawn at
 * 1x and no more than 1600 on the long edge, and drawn smaller again if the board is so full that it is still big.
 */
const ATTEMPTS = [
  { scale: 1, maxEdge: 1600 },
  { scale: 0.6, maxEdge: 1100 },
  { scale: 0.35, maxEdge: 700 },
];
const MAX_IMAGE_CHARS = 1_500_000;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The picture could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** The board as a picture to send, drawn by the same rasteriser as Save. */
export async function boardImageForChat(): Promise<string> {
  let image = "";
  for (const attempt of ATTEMPTS) {
    image = await toDataUrl(await renderBoardPng(currentScene(), attempt));
    if (image.length <= MAX_IMAGE_CHARS) break;
  }
  return image;
}

/** Whether there is any ink or any written note on the board: what the assistant would be reading. */
export function boardHasMarkup(state: ReturnType<typeof appStore.getState>): boolean {
  return Object.keys(state.strokes).length > 0 || Object.values(state.marks).some((m) => m.body.trim() !== "");
}

/**
 * Send: draws the board, opens the conversation, and sends your message carrying the picture. The reply is an
 * ordinary streamed one (and cites nodes the ordinary way). One at a time, and never over a reply still streaming.
 * If the board cannot be drawn nothing is sent, and it says so.
 */
export async function sendBoardToChat(): Promise<boolean> {
  const app = appStore.getState();
  if (app.chatStreaming || uiStore.getState().preparingBoard || !boardHasMarkup(app)) return false;

  uiStore.getState().setPreparingBoard(true);
  let image: string;
  try {
    image = await boardImageForChat();
  } catch {
    uiStore.getState().toast({ message: COPY.sendBoardFailed, tone: "danger" });
    return false;
  } finally {
    uiStore.getState().setPreparingBoard(false);
  }

  uiStore.getState().revealChat();
  await appStore.getState().sendChat(BOARD_MESSAGE, undefined, { image });
  return true;
}
