import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { appStore } from "../../store";
import {
  COPY,
  formErrorFor,
  redirectIfSignedIn,
  requireSession,
  validateSignIn,
  validateSignUp,
  returnPath,
} from "../session";

const user = { id: "us_1", name: "Ada", email: "ada@example.com", avatarUrl: null };

describe("validateSignIn", () => {
  it("passes a valid email and an 8-character password", () => {
    expect(validateSignIn({ email: "ada@example.com", password: "12345678" })).toEqual({});
  });

  it.each(["ada", "ada@", "@example.com", "ada example@x.co", ""])("rejects %j as an email", (email) => {
    expect(validateSignIn({ email, password: "12345678" })).toEqual({ email: COPY.invalidEmail });
  });

  it("rejects a 7-character password with the 8-character rule", () => {
    expect(validateSignIn({ email: "ada@example.com", password: "1234567" })).toEqual({
      password: "Password must be at least 8 characters.",
    });
  });

  it("names the email field in its message", () => {
    expect(COPY.invalidEmail).toBe("Enter a valid email address.");
  });
});

describe("validateSignUp", () => {
  const valid = { name: "Ada", email: "ada@example.com", password: "12345678", confirmPassword: "12345678" };

  it("passes valid input", () => {
    expect(validateSignUp(valid)).toEqual({});
  });

  it("puts a mismatch on the confirmation field", () => {
    expect(validateSignUp({ ...valid, confirmPassword: "12345679" })).toEqual({
      confirmPassword: "Passwords don't match.",
    });
  });

  it("requires a name", () => {
    expect(validateSignUp({ ...valid, name: "   " })).toEqual({ name: COPY.nameRequired });
  });

  it("reports every broken rule at once", () => {
    expect(Object.keys(validateSignUp({ name: "", email: "x", password: "1", confirmPassword: "2" }))).toEqual([
      "name",
      "email",
      "password",
      "confirmPassword",
    ]);
  });
});

describe("formErrorFor", () => {
  const err = (code: string, status = 400) => new ApiError(status, code, "raw server text");

  it("uses the state matrix copy for rejected credentials, never the raw message", () => {
    expect(formErrorFor(err("bad_credentials", 401), "signin")).toEqual({
      message: "We couldn't sign you in. Check your email and password, then try again.",
      kind: "rejected",
    });
  });

  it("offers a retry on a network failure", () => {
    expect(formErrorFor(err("network_error", 0), "signin")).toEqual({
      message: "Couldn't reach the server. Check your connection and try again.",
      kind: "network",
    });
  });

  it("links to sign in when the address is taken", () => {
    expect(formErrorFor(err("email_taken", 409), "signup")).toEqual({
      message: "That email is already registered. Sign in instead, or use a different address.",
      kind: "email-taken",
    });
  });

  it("keeps a server failure distinct from a rejection", () => {
    const serverError = formErrorFor(err("server_error", 500), "signin");
    expect(serverError.kind).toBe("server");
    expect(serverError.message).not.toBe(formErrorFor(err("bad_credentials", 401), "signin").message);
  });
});

describe("route guards", () => {
  const at = (path: string) => ({ request: new Request(`http://app.test${path}`) });

  beforeEach(() => {
    appStore.setState({ token: null, user: null });
  });

  it("sends a signed-out visitor from / to /signin", () => {
    const result = requireSession(at("/"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/signin");
  });

  it("remembers a deep link, so signing in returns to /node/:id", () => {
    const result = requireSession(at("/node/nd_goal"));
    expect((result as Response).headers.get("Location")).toBe("/signin?next=%2Fnode%2Fnd_goal");
  });

  it("lets a signed-in visitor through to /", () => {
    appStore.getState().signIn({ token: "tok", user });
    expect(requireSession(at("/"))).toBeNull();
  });

  it("sends a signed-in visitor from /signin to /, or to where they were headed", () => {
    appStore.getState().signIn({ token: "tok", user });
    expect((redirectIfSignedIn(at("/signin")) as Response).headers.get("Location")).toBe("/");
    expect((redirectIfSignedIn(at("/signin?next=%2Fnode%2Fnd_1")) as Response).headers.get("Location")).toBe(
      "/node/nd_1",
    );
  });

  it("lets a signed-out visitor see /signin", () => {
    expect(redirectIfSignedIn(at("/signin"))).toBeNull();
  });

  it("only returns to paths on this site", () => {
    expect(returnPath("?next=%2Fnode%2Fnd_1")).toBe("/node/nd_1");
    expect(returnPath("?next=https%3A%2F%2Fevil.test")).toBe("/");
    expect(returnPath("?next=%2F%2Fevil.test")).toBe("/");
    expect(returnPath("")).toBe("/");
  });
});
