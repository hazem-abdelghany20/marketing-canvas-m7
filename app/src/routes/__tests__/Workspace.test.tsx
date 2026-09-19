// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp, serveEmptyBoard, user } from "./harness";
import { appStore } from "../../store";

beforeEach(() => {
  resetApp();
  appStore.getState().signIn({ token: "tok", user });
});
afterEach(cleanup);

const canvas = () => document.querySelector("[data-canvas-state]") as HTMLElement;

describe("Workspace", () => {
  it("shows a dimmed grid and a loading indicator while the board hydrates", async () => {
    const gate = deferred<Response>();
    serveEmptyBoard();
    network.on("GET /board", () => gate.promise);
    renderAt("/");

    expect(await screen.findByRole("status", { name: "Loading your board" })).toBeTruthy();
    expect(canvas().dataset.canvasState).toBe("loading");

    gate.resolve(json(200, emptyBoard));
    await waitFor(() => expect(canvas().dataset.canvasState).toBe("ready"));
    expect(screen.queryByRole("status", { name: "Loading your board" })).toBeNull();
  });

  it("uses one full-bleed container for loading and loaded, so nothing shifts", async () => {
    const gate = deferred<Response>();
    serveEmptyBoard();
    network.on("GET /board", () => gate.promise);
    renderAt("/");
    await screen.findByRole("status", { name: "Loading your board" });
    const loading = canvas();

    gate.resolve(json(200, emptyBoard));
    await waitFor(() => expect(canvas().dataset.canvasState).toBe("ready"));

    expect(canvas()).toBe(loading);
  });

  it("renders the first-run empty state for a board with no nodes", async () => {
    serveEmptyBoard();
    renderAt("/");
    expect(await screen.findByText("Nothing on the canvas yet.")).toBeTruthy();
  });

  it("explains a failed load and reloads on request", async () => {
    serveEmptyBoard();
    network.on("GET /board", () => apiError(503, "forced_failure"));
    renderAt("/");

    expect(await screen.findByText("We couldn't load your board. Check your connection, then reload.")).toBeTruthy();

    network.on("GET /board", () => json(200, emptyBoard));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("Nothing on the canvas yet.")).toBeTruthy();
  });
});
