// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, deferred, emptyBoard, json, network, openAt, resetApp, serveEmptyBoard, user } from "./harness";

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /creat/i }) as HTMLButtonElement;

function fillAll(overrides: Partial<Record<"Name" | "Email" | "Password" | "Confirm password", string>> = {}) {
  const values = { Name: "Ada", Email: "ada@example.com", Password: "12345678", "Confirm password": "12345678", ...overrides };
  for (const [label, value] of Object.entries(values)) fireEvent.change(field(label), { target: { value } });
}

beforeEach(resetApp);
afterEach(cleanup);

describe("Sign up", () => {
  it("shows the 8-character rule as guidance from the start, and marks it met live", async () => {
    await openAt("/signup");
    const rule = await screen.findByText("At least 8 characters");

    fireEvent.change(field("Password"), { target: { value: "12345678" } });

    expect(rule.textContent).toContain("At least 8 characters");
    expect(rule.getAttribute("data-met")).toBe("true");
  });

  it("blocks a mismatched confirmation and names that field", async () => {
    await openAt("/signup");
    fillAll({ "Confirm password": "12345679" });

    fireEvent.click(submit());

    const error = await screen.findByText("Passwords don't match.");
    expect(field("Confirm password").getAttribute("aria-describedby")).toBe(error.id);
    expect(network.calls).toHaveLength(0);
  });

  it("renders email_taken with a link to sign in, keeping everything but the passwords", async () => {
    network.on("POST /auth/signup", () => apiError(409, "email_taken", "raw server text"));
    await openAt("/signup");
    fillAll({ Email: "taken@example.com" });

    fireEvent.click(submit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("That email is already registered. Sign in instead, or use a different address.");
    expect(within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin");
    expect(field("Name").value).toBe("Ada");
    expect(field("Email").value).toBe("taken@example.com");
    expect(field("Password").value).toBe("");
    expect(field("Confirm password").value).toBe("");
    expect(submit().disabled).toBe(false);
  });

  it("disables every field and labels the button Creating… while pending", async () => {
    const gate = deferred<Response>();
    network.on("POST /auth/signup", () => gate.promise);
    await openAt("/signup");
    fillAll();

    fireEvent.click(submit());

    await screen.findByRole("button", { name: "Creating…" });
    expect(submit().disabled).toBe(true);
    for (const label of ["Name", "Email", "Password", "Confirm password"]) expect(field(label).disabled).toBe(true);
    gate.resolve(apiError(409, "email_taken"));
    await screen.findByRole("alert");
  });

  it("lands on / and shows the first-run empty state for the new, empty board", async () => {
    network.on("POST /auth/signup", () => json(201, { token: "tok_new", user, board: emptyBoard }));
    serveEmptyBoard();
    const { router } = await openAt("/signup");
    fillAll();

    fireEvent.click(submit());

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Nothing on the canvas yet.")).toBeTruthy();
    expect(network.callsTo("POST /auth/signup")[0]?.body).toEqual({
      name: "Ada",
      email: "ada@example.com",
      password: "12345678",
    });
  });
});
