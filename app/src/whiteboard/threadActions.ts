import { appStore } from "../store";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/** Closes the open thread. A pin nobody said anything on goes with it: an empty pin is an abandoned gesture. */
export function closeThread() {
  const id = uiStore.getState().openPinId;
  if (id === null) return;
  uiStore.getState().openPin(null);
  appStore.getState().discardPin(id);
}

/** A pin was pressed: open its thread, or close it if it is the one already open. */
export function toggleThread(id: string) {
  const open = uiStore.getState().openPinId;
  closeThread();
  if (open !== id) uiStore.getState().openPin(id);
}

/** Said when the API reports that the pin a thread was open on is gone: the thread closes and a toast says why. */
export function threadWasDeleted() {
  closeThread();
  uiStore.getState().toast({ message: COPY.threadDeleted, tone: "warn" });
}
