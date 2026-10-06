import { useStore } from "zustand";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore, useUi } from "../ui/uiStore";
import { boardHasContent, saveBoardPng } from "./exportPng";
import { boardHasMarkup, sendBoardToChat } from "./sendBoardToChat";

/**
 * What the dock's Send and Save decide: whether they can be used right now, and if not why. They are used from the dock on a
 * desktop, and from the top bar and its menu on a phone, so the rules live here once. Waiting beats empty beats busy: the
 * reason that cannot be fixed by waiting is not hidden by one that can.
 */
export function useSendBoard() {
  const boardReady = useStore(appStore, (s) => s.boardStatus === "ready");
  const hasMarkup = useStore(appStore, boardHasMarkup);
  const replying = useStore(appStore, (s) => s.chatStreaming);
  const preparing = useUi((s) => s.preparingBoard);
  const reason = !boardReady
    ? COPY.loading
    : !hasMarkup
      ? COPY.drawFirst
      : replying
        ? COPY.waitForReply
        : preparing
          ? COPY.preparingBoard
          : null;
  return { reason, preparing, send: () => void sendBoardToChat() };
}

export function useSavePng() {
  const boardReady = useStore(appStore, (s) => s.boardStatus === "ready");
  const hasContent = useStore(appStore, boardHasContent);
  const exporting = useUi((s) => s.exporting);
  const reason = !boardReady ? COPY.loading : !hasContent ? COPY.nothingToSave : exporting ? COPY.savingImage : null;
  return { reason, exporting, save: () => void saveBoardPng() };
}

/**
 * A disabled control says why in its tooltip, which a touch screen never shows. On a phone, tapping one says it in a toast
 * instead.
 */
export function explainWhy(reason: string | null) {
  if (reason) uiStore.getState().toast({ message: reason, tone: "info" });
}
