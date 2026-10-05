import { beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { handleSessionExpired, signInTarget } from "../expired";

beforeEach(() => uiStore.getState().reset());

describe("signInTarget", () => {
  it("is plain /signin from the workspace", () => {
    expect(signInTarget("/")).toBe("/signin");
  });

  it("carries a node's address, so signing in lands back on it", () => {
    expect(signInTarget("/node/nd_str_icp")).toBe("/signin?next=%2Fnode%2Fnd_str_icp");
  });

  it("does not loop back to an auth screen", () => {
    expect(signInTarget("/signin")).toBe("/signin");
    expect(signInTarget("/signup")).toBe("/signin");
  });
});

describe("handleSessionExpired", () => {
  it("says the session expired, as a warning, and goes to sign in without leaving the dead page in history", () => {
    const navigate = vi.fn();

    handleSessionExpired(navigate, "/");

    expect(navigate).toHaveBeenCalledWith("/signin", { replace: true });
    const [toast] = uiStore.getState().toasts;
    expect(toast).toMatchObject({ message: COPY.sessionExpired, tone: "warn" });
    expect(COPY.sessionExpired).toBe("Your session expired. Sign in again.");
  });

  it("sends someone who was looking at a node back to it afterwards", () => {
    const navigate = vi.fn();

    handleSessionExpired(navigate, "/node/nd_goal_vayn");

    expect(navigate).toHaveBeenCalledWith("/signin?next=%2Fnode%2Fnd_goal_vayn", { replace: true });
  });
});
