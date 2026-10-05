export const CHAT_OPEN_ID = "chat-open";

/** Focus follows the control that replaced the one you used, instead of falling to the page. */
export const focusChatOpenButton = () => requestAnimationFrame(() => document.getElementById(CHAT_OPEN_ID)?.focus());
