import { describe, expect, it, vi } from "vitest";
import { apiError } from "../../api/__tests__/helpers";
import { makeStore, memoryStorage, seededRoutes } from "./fakeBackend";

const user = { id: "us_1", name: "Ada", email: "ada@example.com", avatarUrl: null };

describe("session", () => {
  it("restores the token from storage and sends it on every request", async () => {
    const { store, backend } = makeStore(seededRoutes(), { storage: memoryStorage({ "mc-session-token": "tok_saved" }) });

    expect(store.getState().token).toBe("tok_saved");
    await store.getState().loadBoard();
    expect(backend.calls.every((c) => c.headers["authorization"] === "Bearer tok_saved")).toBe(true);
  });

  it("stores the token on sign-in, and nothing else", () => {
    const storage = memoryStorage();
    const { store } = makeStore(seededRoutes(), { storage });

    store.getState().signIn({ token: "tok_new", user });

    expect(store.getState()).toMatchObject({ token: "tok_new", user });
    expect(storage.getItem("mc-session-token")).toBe("tok_new");
    expect(storage.length).toBe(1);
  });

  it("clears the session and the cache on sign-out, even if logout fails", async () => {
    const storage = memoryStorage({ "mc-session-token": "tok_1" });
    const { store } = makeStore({ ...seededRoutes(), "POST /auth/logout": () => apiError(503, "forced_failure") }, { storage });
    await store.getState().loadBoard();

    await store.getState().signOut();

    expect(store.getState()).toMatchObject({ token: null, user: null, board: null, nodes: {}, boardStatus: "idle" });
    expect(storage.getItem("mc-session-token")).toBeNull();
  });

  it("ends the session once when concurrent requests all come back 401", async () => {
    const onSessionExpired = vi.fn();
    const storage = memoryStorage({ "mc-session-token": "tok_dead" });
    const expired = () => apiError(401, "invalid_token", "Sign in again.");
    const { store } = makeStore(
      {
        "GET /board": expired,
        "GET /nodes": expired,
        "GET /edges": expired,
        "GET /files": expired,
        "GET /strokes": expired,
        "GET /marks": expired,
        "GET /pins": expired,
      },
      { storage, onSessionExpired },
    );

    await Promise.all([store.getState().loadBoard(), store.getState().loadBoard()]);

    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(store.getState().token).toBeNull();
    expect(storage.getItem("mc-session-token")).toBeNull();
  });

  it("ends the next session too, after signing in again", async () => {
    const onSessionExpired = vi.fn();
    const { store } = makeStore({ "GET /board": () => apiError(401, "invalid_token") }, { onSessionExpired });

    await store.getState().loadBoard();
    store.getState().signIn({ token: "tok_2", user });
    await store.getState().loadBoard();

    expect(onSessionExpired).toHaveBeenCalledTimes(2);
  });

  it("does not end the session on a wrong password", async () => {
    const onSessionExpired = vi.fn();
    const { store } = makeStore({ "GET /board": () => apiError(401, "bad_credentials") }, { onSessionExpired });

    await store.getState().loadBoard();

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(store.getState().token).toBe("tok_1");
  });
});
