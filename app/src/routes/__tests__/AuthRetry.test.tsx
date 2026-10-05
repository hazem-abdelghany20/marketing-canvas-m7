// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, emptyBoard, json, network, openAt, resetApp, serveEmptyBoard, user } from "./harness";

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(resetApp);
afterEach(cleanup);

const NETWORK = "Couldn't reach the server. Check your connection and try again.";

describe("Sign up Retry", () => {
  it("sends the same sign-up again, passwords included, when the network failed", async () => {
    let attempts = 0;
    network.on("POST /auth/signup", () => {
      if (++attempts === 1) throw new TypeError("Failed to fetch");
      return json(201, { token: "tok", user, board: emptyBoard });
    });
    serveEmptyBoard();
    await openAt("/signup");
    for (const [label, value] of Object.entries({
      Name: "Ada",
      Email: "ada@example.com",
      Password: "12345678",
      "Confirm password": "12345678",
    })) {
      fireEvent.change(field(label), { target: { value } });
    }

    fireEvent.click(screen.getByRole("button", { name: /creat/i }));
    await screen.findByText(NETWORK);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(network.callsTo("POST /auth/signup")).toHaveLength(2));
    expect(network.callsTo("POST /auth/signup")[1]!.body).toEqual({
      name: "Ada",
      email: "ada@example.com",
      password: "12345678",
    });
  });

  it("still clears the passwords when the address is already registered, as the state matrix says", async () => {
    network.on("POST /auth/signup", () => apiError(409, "email_taken", "raw"));
    await openAt("/signup");
    for (const [label, value] of Object.entries({
      Name: "Ada",
      Email: "taken@example.com",
      Password: "12345678",
      "Confirm password": "12345678",
    })) {
      fireEvent.change(field(label), { target: { value } });
    }

    fireEvent.click(screen.getByRole("button", { name: /creat/i }));

    await screen.findByText(/already registered/);
    expect(field("Password").value).toBe("");
    expect(field("Confirm password").value).toBe("");
    expect(field("Email").value).toBe("taken@example.com");
  });
});

describe("a form-level error", () => {
  it("goes away as soon as the person starts correcting the form", async () => {
    network.on("POST /auth/login", () => apiError(401, "bad_credentials", "raw"));
    await openAt("/signin");
    fireEvent.change(field("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(field("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(/We couldn't sign you in/);

    fireEvent.change(field("Password"), { target: { value: "wrong-password!" } });

    expect(screen.queryByText(/We couldn't sign you in/)).toBeNull();
  });
});
