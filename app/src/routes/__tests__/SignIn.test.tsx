// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, deferred, json, network, openAt, renderAt, resetApp, serveEmptyBoard, user } from "./harness";
import { appStore } from "../../store";

const email = () => screen.getByLabelText("Email") as HTMLInputElement;
const password = () => screen.getByLabelText("Password") as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /sign(ing)? in/i });

function fill(values: { email?: string; password?: string }) {
  if (values.email !== undefined) fireEvent.change(email(), { target: { value: values.email } });
  if (values.password !== undefined) fireEvent.change(password(), { target: { value: values.password } });
}

beforeEach(resetApp);
afterEach(cleanup);

describe("Sign in", () => {
  it("focuses the email field on load", async () => {
    await openAt("/signin");
    await waitFor(() => expect(document.activeElement).toBe(email()));
  });

  it("blocks an email without @ client-side, names the field, and sends nothing", async () => {
    await openAt("/signin");
    fill({ email: "ada.example.com", password: "12345678" });

    fireEvent.click(submit());

    const error = await screen.findByText("Enter a valid email address.");
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(email().getAttribute("aria-describedby")).toBe(error.id);
    expect(document.activeElement).toBe(email());
    expect(network.calls).toHaveLength(0);
  });

  it("blocks a 7-character password with the 8-character rule", async () => {
    await openAt("/signin");
    fill({ email: "ada@example.com", password: "1234567" });

    fireEvent.click(submit());

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeTruthy();
    expect(network.calls).toHaveLength(0);
  });

  it("clears a field's error as soon as that field is edited", async () => {
    await openAt("/signin");
    fill({ email: "nope", password: "12345678" });
    fireEvent.click(submit());
    await screen.findByText("Enter a valid email address.");

    fill({ email: "nope@" });

    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
  });

  it("labels and disables the submit button while pending, and freezes the fields", async () => {
    const gate = deferred<Response>();
    network.on("POST /auth/login", () => gate.promise);
    await openAt("/signin");
    fill({ email: "ada@example.com", password: "12345678" });

    fireEvent.click(submit());

    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(email().readOnly).toBe(true);
    expect(password().readOnly).toBe(true);
    gate.resolve(apiError(401, "bad_credentials"));
    await screen.findByRole("button", { name: "Sign in" });
  });

  it("keeps both values, shows a form-level error and re-enables submit on bad_credentials", async () => {
    network.on("POST /auth/login", () => apiError(401, "bad_credentials", "raw server text"));
    await openAt("/signin");
    fill({ email: "ada@example.com", password: "wrongpass" });

    fireEvent.click(submit());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't sign you in. Check your email and password, then try again.");
    expect(alert.textContent).not.toContain("raw server text");
    expect(email().value).toBe("ada@example.com");
    expect(password().value).toBe("wrongpass");
    expect((submit() as HTMLButtonElement).disabled).toBe(false);
    expect(appStore.getState().token).toBeNull();
  });

  it("offers Retry when the server can't be reached, and retrying resubmits", async () => {
    network.on("POST /auth/login", () => Promise.reject(new TypeError("Failed to fetch")));
    await openAt("/signin");
    fill({ email: "ada@example.com", password: "12345678" });
    fireEvent.click(submit());

    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't reach the server.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(network.callsTo("POST /auth/login")).toHaveLength(2));
  });

  it("stores the token and sends it as a bearer on every later request", async () => {
    network.on("POST /auth/login", () => json(200, { token: "tok_live", user }));
    serveEmptyBoard();
    const { router } = await openAt("/signin");
    fill({ email: "ada@example.com", password: "12345678" });

    fireEvent.click(submit());

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(localStorage.getItem("mc-session-token")).toBe("tok_live");
    await waitFor(() => expect(network.callsTo("GET /board")).toHaveLength(1));
    const later = network.calls.filter((c) => !c.url.endsWith("/auth/login"));
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((c) => c.headers["authorization"] === "Bearer tok_live")).toBe(true);
    // The password goes to the API and nowhere else.
    expect(JSON.stringify(localStorage)).not.toContain("12345678");
  });

  it("redirects a signed-in visitor to / without ever rendering the form", async () => {
    serveEmptyBoard();
    appStore.getState().signIn({ token: "tok_1", user });

    let router!: ReturnType<typeof renderAt>["router"];
    act(() => {
      router = renderAt("/signin").router;
    });

    expect(screen.queryByLabelText("Email")).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("links to sign-up", async () => {
    const { router } = await openAt("/signin");

    fireEvent.click(await screen.findByRole("link", { name: "Create one" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
  });
});
