import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/**
 * Where to send someone whose session ended. A node's address rides along as `next`, so
 * signing in lands them back on it; the auth screens themselves never carry one.
 */
export function signInTarget(pathname: string): string {
  if (pathname === "/" || pathname === "/signin" || pathname === "/signup") return "/signin";
  return `/signin?next=${encodeURIComponent(pathname)}`;
}

/** The API rejected the token: say so, and go to sign-in without leaving the dead page in history. */
export function handleSessionExpired(navigate: (to: string, options: { replace: true }) => void, pathname: string) {
  uiStore.getState().toast({ message: COPY.sessionExpired, tone: "warn" });
  navigate(signInTarget(pathname), { replace: true });
}
