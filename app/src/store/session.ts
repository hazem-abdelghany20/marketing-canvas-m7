import type { AuthResult, User } from "../types";
import type { SliceCreator } from "./state";

export const TOKEN_KEY = "mc-session-token";

export interface SessionSlice {
  token: string | null;
  user: User | null;
  signIn: (result: AuthResult) => void;
  /** Invalidates the token server-side if it can, then clears the session regardless. */
  signOut: () => Promise<void>;
  /** The API rejected the token. Safe to call any number of times; acts once per session. */
  expireSession: () => void;
}

function readToken(storage: Storage | null): string | null {
  try {
    return storage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeToken(storage: Storage | null, token: string | null): void {
  try {
    if (token) storage?.setItem(TOKEN_KEY, token);
    else storage?.removeItem(TOKEN_KEY);
  } catch {
    /* the session still holds for this tab */
  }
}

export const createSessionSlice: SliceCreator<SessionSlice> = (ctx) => (set, get) => {
  // Concurrent requests can all come back 401 at once; only the first one counts.
  let expiryHandled = false;

  function clear() {
    writeToken(ctx.storage, null);
    set({ token: null, user: null });
    get().resetBoard();
  }

  return {
    token: readToken(ctx.storage),
    user: null,

    signIn({ token, user }) {
      expiryHandled = false;
      writeToken(ctx.storage, token);
      set({ token, user });
    },

    async signOut() {
      if (get().token) {
        try {
          await ctx.api.auth.logout();
        } catch {
          /* the token is dropped locally either way */
        }
      }
      clear();
    },

    expireSession() {
      if (expiryHandled) return;
      expiryHandled = true;
      clear();
      ctx.onSessionExpired();
    },
  };
};
