// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uiStore } from "../../ui/uiStore";
import { emptyBoard, json, network, openAt, resetApp, serveEmptyBoard, user } from "./harness";

beforeEach(() => {
  resetApp();
  uiStore.getState().reset();
});
afterEach(cleanup);

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("Sign in states, S1", () => {
  it("starts empty: both fields blank, submit ready, nothing flagged", async () => {
    await openAt("/signin");

    expect(field("Email").value).toBe("");
    expect(field("Password").value).toBe("");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(field("Email").getAttribute("aria-invalid")).toBeNull();
  });

  it("on success holds a check for about 200ms, with no toast, then goes to the workspace", async () => {
    serveEmptyBoard();
    network.on("POST /auth/login", () => json(200, { token: "tok", user }));
    await openAt("/signin");
    fireEvent.change(field("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(field("Password"), { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByLabelText("Signed in");
    const shown = performance.now();

    expect(uiStore.getState().toasts).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    await screen.findByText("Nothing on the canvas yet.");
    expect(performance.now() - shown).toBeGreaterThanOrEqual(150);
    expect(uiStore.getState().toasts).toHaveLength(0);
  });
});

describe("Sign up states, S2", () => {
  it("starts with four blank fields and the password rule as guidance, not as an error", async () => {
    await openAt("/signup");

    for (const label of ["Name", "Email", "Password", "Confirm password"]) expect(field(label).value).toBe("");
    expect(screen.getByText("At least 8 characters").getAttribute("data-met")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is not shown to a visitor who is already signed in", async () => {
    const { appStore } = await import("../../store");
    appStore.getState().signIn({ token: "tok", user });
    serveEmptyBoard();
    network.on("GET /board", () => json(200, emptyBoard));

    const { router } = await import("./harness").then((h) => h.renderAt("/signup"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByLabelText("Name")).toBeNull();
  });
});
