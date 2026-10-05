// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTimestamp } from "../../lib/format";
import { apiError, deferred, emptyBoard, json, network, renderAt, resetApp } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import type { Comment, Pin } from "../../types";
import { uiStore } from "../../ui/uiStore";

const ME = { id: "usr_demo", name: "Ada", email: "ada@example.com", avatarUrl: null };
const RANIA = { id: "usr_rania", name: "Rania", avatarUrl: null };
const OMAR = { id: "usr_omar", name: "Omar", avatarUrl: null };
// Panned 100,40 and zoomed 2x: a screen point is (client - pan) / 2 on the board.
const VIEWPORT = { x: 100, y: 40, zoom: 2 };

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3_600_000).toISOString();
const comment = (id: string, body: string, author = RANIA, createdAt = TWO_HOURS_AGO): Comment => ({ id, body, createdAt, author });
const OPEN: Pin = {
  id: "pin_open", x: 100, y: 100, resolved: false, createdAt: TWO_HOURS_AGO,
  comments: [comment("c_1", "This one carried the whole drop."), comment("c_2", "Shooting Thursday.", OMAR)],
};
const DONE: Pin = {
  id: "pin_done", x: 300, y: 100, resolved: true, createdAt: TWO_HOURS_AGO,
  comments: [comment("c_3", "Held the line on price.")],
};

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  appStore.getState().signIn({ token: "tok", user: ME });
  serve();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function serve(pins: Pin[] = [OPEN, DONE]) {
  network.on("GET /board", () => json(200, { ...emptyBoard, viewport: VIEWPORT }));
  for (const p of ["/nodes", "/edges", "/files", "/strokes", "/marks"]) network.on(`GET ${p}`, () => json(200, []));
  network.on("GET /pins", () => json(200, pins));
  let made = 0;
  network.on("POST /pins", (call) => json(201, { id: `pin_new_${++made}`, resolved: false, createdAt: new Date().toISOString(), comments: [], ...(call.body as object) }));
  let said = 0;
  network.on("POST /pins/pin_open/comments", (call) => json(201, comment(`c_new_${++said}`, (call.body as { body: string }).body, ME, new Date().toISOString())));
  network.on("PATCH /pins/pin_open", (call) => json(200, { ...OPEN, ...(call.body as object) }));
  network.on("PATCH /pins/pin_done", (call) => json(200, { ...DONE, ...(call.body as object) }));
  network.on("DELETE /pins/pin_open", () => json(204));
  network.on("DELETE /comments/c_1", () => json(204));
  network.on("DELETE /comments/c_2", () => json(204));
}

async function openBoard() {
  const rendered = renderAt("/");
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  await screen.findByRole("group", { name: "Whiteboard tools" });
  await waitFor(() => expect(document.querySelector("[data-pin-layer]")).toBeTruthy());
  return rendered;
}

const pickTool = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const surface = () => document.querySelector<HTMLElement>("[data-pin-surface]");
const pinEl = (id: string) => document.querySelector<HTMLElement>(`[data-pin-id="${id}"]`);
const thread = () => screen.queryByRole("dialog", { name: "Comment thread" });
const composer = () => within(thread()!).getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
const postButton = () => within(thread()!).getByRole("button", { name: "Post" });
const posts = () => network.callsTo("POST /pins");
const commentPosts = (pin = "pin_open") => network.callsTo(`POST /pins/${pin}/comments`);
const dropPin = (at = { x: 300, y: 240 }) => fireEvent.click(surface()!, { clientX: at.x, clientY: at.y });
const openThread = async (id: string) => {
  fireEvent.click(pinEl(id)!);
  await screen.findByRole("dialog", { name: "Comment thread" });
};

describe("the pins on the board", () => {
  it("are drawn at their stored positions, one marker each, numbered", async () => {
    await openBoard();

    const open = pinEl("pin_open")!;
    expect(open.textContent).toContain("1");
    expect(pinEl("pin_done")!.textContent).toContain("2");
    // Board (100, 100) under this camera is client (300, 240): the marker's tip sits there.
    expect(open.style.left).toBe("300px");
    expect(open.style.top).toBe("240px");
  });

  it("show a resolved pin visibly muted, and still present, saying so in its name", async () => {
    await openBoard();

    const done = pinEl("pin_done")!;
    expect(done.getAttribute("data-pin-resolved")).toBe("true");
    expect(Number(done.style.opacity)).toBeLessThan(1);
    expect(done.getAttribute("aria-label")).toMatch(/resolved/i);
    expect(pinEl("pin_open")!.getAttribute("data-pin-resolved")).toBe("false");
    expect(Number(pinEl("pin_open")!.style.opacity || 1)).toBe(1);
  });

  it("draw nothing at all when there are no pins", async () => {
    serve([]);
    await openBoard();

    expect(document.querySelectorAll("[data-pin-id]")).toHaveLength(0);
    expect(document.querySelector("[data-pin-empty]")).toBeNull();
  });
});

describe("the Comment tool", () => {
  it("has a surface only while it is in hand", async () => {
    await openBoard();
    expect(surface()).toBeNull();

    pickTool("Comment");
    expect(surface()).toBeTruthy();

    pickTool("Select");
    expect(surface()).toBeNull();
  });

  it("drops a pin where the canvas is clicked, opens its thread, and focuses the composer", async () => {
    await openBoard();
    pickTool("Comment");

    dropPin({ x: 300, y: 240 });

    // Client (300, 240) is board (100, 100): the pin is the third on the board.
    const created = Array.from(document.querySelectorAll<HTMLElement>("[data-pin-id]")).find((el) => el.dataset.pinId !== "pin_open" && el.dataset.pinId !== "pin_done")!;
    expect(created.textContent).toContain("3");
    expect(thread()).toBeTruthy();
    expect(document.activeElement).toBe(composer());
    expect(within(thread()!).getByText("New comment, pinned right here.")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it("opens a thread with Resolve disabled while there is nothing in it to resolve", async () => {
    await openBoard();
    pickTool("Comment");

    dropPin();

    const resolve = within(thread()!).getByRole("button", { name: "Resolve" });
    expect(resolve.getAttribute("aria-disabled")).toBe("true");
    expect(resolve.title).toBe("Nothing to resolve yet.");
  });

  it("keeps the tool in hand, so the next click drops the next pin", async () => {
    await openBoard();
    pickTool("Comment");

    dropPin();

    expect(screen.getByRole("button", { name: "Comment" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("throws away a pin whose thread is closed with nothing said, without a request", async () => {
    await openBoard();
    pickTool("Comment");
    dropPin();
    const before = document.querySelectorAll("[data-pin-id]").length;

    fireEvent.click(within(thread()!).getByRole("button", { name: "Close thread" }));

    expect(thread()).toBeNull();
    expect(document.querySelectorAll("[data-pin-id]")).toHaveLength(before - 1);
    expect(network.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("posting a comment", () => {
  it("makes the pin and the comment, shows the comment attributed to you with its time, clears the composer and keeps focus", async () => {
    await openBoard();
    pickTool("Comment");
    dropPin();

    fireEvent.change(composer(), { target: { value: "Hook lands late." } });
    fireEvent.click(postButton());

    await waitFor(() => expect(commentPosts("pin_new_1")).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ x: 100, y: 100 });
    expect(commentPosts("pin_new_1")[0]!.body).toEqual({ body: "Hook lands late." });
    const mine = await within(thread()!).findByText("Hook lands late.");
    const entry = mine.closest("[data-comment-id]") as HTMLElement;
    expect(within(entry).getByText("Ada")).toBeTruthy();
    expect(within(entry).getByText("now")).toBeTruthy();
    expect(composer().value).toBe("");
    expect(document.activeElement).toBe(composer());
    expect(thread()).toBeTruthy();
  });

  it("posts with Enter, and takes Shift+Enter as a new line", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.change(composer(), { target: { value: "One" } });
    fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
    expect(commentPosts()).toHaveLength(0);
    fireEvent.keyDown(composer(), { key: "Enter" });

    await waitFor(() => expect(commentPosts()).toHaveLength(1));
  });

  it("disables Post while the composer holds nothing, or only whitespace", async () => {
    await openBoard();
    await openThread("pin_open");

    expect(postButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(composer(), { target: { value: "   \n " } });
    expect(postButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(postButton());
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(commentPosts()).toHaveLength(0);

    fireEvent.change(composer(), { target: { value: "Hi" } });
    expect(postButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("shows the comment in the thread at once, with a pending mark, while it is being sent", async () => {
    const reply = deferred<Response>();
    network.on("POST /pins/pin_open/comments", () => reply.promise);
    await openBoard();
    await openThread("pin_open");

    fireEvent.change(composer(), { target: { value: "On its way" } });
    fireEvent.click(postButton());

    const entry = (await within(thread()!).findByText("On its way")).closest("[data-comment-id]") as HTMLElement;
    expect(entry.dataset.commentSync).toBe("sending");
    expect(composer().value).toBe("");
    await act(async () => reply.resolve(json(201, comment("c_new", "On its way", ME, new Date().toISOString()))));
    await waitFor(() => expect(document.querySelector('[data-comment-sync="sending"]')).toBeNull());
  });
});

describe("a thread with two authors", () => {
  it("shows each comment under its own author's name", async () => {
    await openBoard();

    await openThread("pin_open");

    const names = Array.from(thread()!.querySelectorAll<HTMLElement>("[data-comment-id] [data-comment-author]")).map((el) => el.textContent);
    expect(names).toEqual(["Rania", "Omar"]);
  });

  it("nests the replies beneath the first comment, and the first stands alone", async () => {
    await openBoard();

    await openThread("pin_open");

    const entries = Array.from(thread()!.querySelectorAll<HTMLElement>("[data-comment-id]"));
    expect(entries.map((el) => el.dataset.commentNested)).toEqual(["false", "true"]);
  });

  it("gives every comment a relative time, with the exact one in its title", async () => {
    await openBoard();

    await openThread("pin_open");

    const times = Array.from(thread()!.querySelectorAll("time"));
    expect(times).toHaveLength(2);
    for (const time of times) {
      expect(time.textContent).toBe("2h");
      expect(time.getAttribute("title")).toBe(formatTimestamp(TWO_HOURS_AGO));
      expect(time.getAttribute("datetime")).toBe(TWO_HOURS_AGO);
    }
  });

  it("is already there, with no request, because the comments came with the pins", async () => {
    await openBoard();
    const before = network.calls.length;

    await openThread("pin_open");

    expect(network.calls).toHaveLength(before);
  });

  it("offers Reopen for a resolved thread, and Resolve for an open one", async () => {
    await openBoard();

    await openThread("pin_done");
    expect(within(thread()!).getByRole("button", { name: "Reopen" })).toBeTruthy();
    await openThread("pin_open");
    expect(within(thread()!).getByRole("button", { name: "Resolve" })).toBeTruthy();
  });
});

describe("when a comment cannot be posted", () => {
  it("leaves it in the thread marked unsent, with Retry, and gives the text back to the composer", async () => {
    let attempts = 0;
    network.on("POST /pins/pin_open/comments", (call) =>
      ++attempts === 1 ? apiError(503, "forced_failure") : json(201, comment("c_new", (call.body as { body: string }).body, ME, new Date().toISOString())),
    );
    await openBoard();
    await openThread("pin_open");

    fireEvent.change(composer(), { target: { value: "Hook lands late." } });
    fireEvent.click(postButton());

    await within(thread()!).findByText("Couldn't post that comment. Check your connection and try again.");
    const entry = within(thread()!).getByText("Hook lands late.", { selector: "[data-comment-id] *" }).closest("[data-comment-id]") as HTMLElement;
    expect(entry.dataset.commentSync).toBe("failed");
    expect(composer().value).toBe("Hook lands late.");

    fireEvent.click(within(entry).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(commentPosts()).toHaveLength(2));
    await waitFor(() => expect(document.querySelector('[data-comment-sync="failed"]')).toBeNull());
  });

  it("closes the thread and says it was deleted when the API reports pin_not_found", async () => {
    network.on("POST /pins/pin_open/comments", () => apiError(404, "pin_not_found"));
    await openBoard();
    await openThread("pin_open");

    fireEvent.change(composer(), { target: { value: "Anyone there?" } });
    fireEvent.click(postButton());

    await screen.findByText("That thread was deleted.");
    expect(thread()).toBeNull();
    expect(pinEl("pin_open")).toBeNull();
    expect(pinEl("pin_done")).toBeTruthy();
  });
});

describe("resolving", () => {
  it("resolves a thread, which mutes its pin but leaves it on the board", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(within(thread()!).getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(network.callsTo("PATCH /pins/pin_open")).toHaveLength(1));
    expect(network.callsTo("PATCH /pins/pin_open")[0]!.body).toEqual({ resolved: true });
    expect(pinEl("pin_open")!.getAttribute("data-pin-resolved")).toBe("true");
    expect(within(thread()!).getByRole("button", { name: "Reopen" })).toBeTruthy();
  });

  it("reverts to open, and says so in a toast, when the request fails", async () => {
    network.on("PATCH /pins/pin_open", () => apiError(503, "forced_failure"));
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(within(thread()!).getByRole("button", { name: "Resolve" }));

    await screen.findByText("Couldn't update that thread. Check your connection and try again.");
    expect(pinEl("pin_open")!.getAttribute("data-pin-resolved")).toBe("false");
    expect(within(thread()!).getByRole("button", { name: "Resolve" })).toBeTruthy();
  });
});

describe("deleting", () => {
  it("asks before deleting a thread, and a Cancel changes nothing", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(within(thread()!).getByRole("button", { name: "Delete thread" }));
    expect(within(thread()!).getByText("Delete this thread and its comments?")).toBeTruthy();
    fireEvent.click(within(thread()!).getByRole("button", { name: "Cancel" }));

    expect(within(thread()!).queryByText("Delete this thread and its comments?")).toBeNull();
    expect(network.callsTo("DELETE /pins/pin_open")).toHaveLength(0);
    expect(pinEl("pin_open")).toBeTruthy();
  });

  it("deletes the thread once confirmed, closing it and taking the pin off the board", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(within(thread()!).getByRole("button", { name: "Delete thread" }));
    fireEvent.click(within(thread()!).getByRole("button", { name: "Delete" }));

    expect(thread()).toBeNull();
    expect(pinEl("pin_open")).toBeNull();
    await waitFor(() => expect(network.callsTo("DELETE /pins/pin_open")).toHaveLength(1));
  });

  it("brings the pin back, and says so, when the delete fails", async () => {
    network.on("DELETE /pins/pin_open", () => apiError(503, "forced_failure"));
    await openBoard();
    await openThread("pin_open");
    fireEvent.click(within(thread()!).getByRole("button", { name: "Delete thread" }));

    fireEvent.click(within(thread()!).getByRole("button", { name: "Delete" }));

    await screen.findByText("Couldn't delete that thread. Check your connection and try again.");
    await waitFor(() => expect(pinEl("pin_open")).toBeTruthy());
  });

  it("deletes a single comment, whoever wrote it, once confirmed", async () => {
    await openBoard();
    await openThread("pin_open");
    const omars = thread()!.querySelector<HTMLElement>('[data-comment-id="c_2"]')!;

    fireEvent.click(within(omars).getByRole("button", { name: "Delete comment" }));
    fireEvent.click(within(omars).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(network.callsTo("DELETE /comments/c_2")).toHaveLength(1));
    expect(thread()!.querySelector('[data-comment-id="c_2"]')).toBeNull();
    expect(thread()!.querySelector('[data-comment-id="c_1"]')).toBeTruthy();
  });
});

describe("closing a thread", () => {
  it("closes on Escape, and the tool in hand is put away only by the next one", async () => {
    await openBoard();
    pickTool("Comment");
    dropPin();
    fireEvent.change(composer(), { target: { value: "draft" } });

    fireEvent.keyDown(composer(), { key: "Escape" });
    expect(thread()).toBeNull();
    expect(screen.getByRole("button", { name: "Comment" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens another pin's thread in place of the first", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(pinEl("pin_done")!);

    await waitFor(() => expect(within(thread()!).getByText("Held the line on price.")).toBeTruthy());
    expect(screen.getAllByRole("dialog", { name: "Comment thread" })).toHaveLength(1);
  });

  it("is dismissed by the same pin pressed again", async () => {
    await openBoard();
    await openThread("pin_open");

    fireEvent.click(pinEl("pin_open")!);

    expect(thread()).toBeNull();
  });
});

describe("where the thread opens", () => {
  /** The canvas is 1000 by 700 to the thread, which measures its container. */
  function sizeCanvas() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const big = this.hasAttribute("data-pin-layer");
      return { x: 0, y: 0, left: 0, top: 0, right: big ? 1000 : 280, bottom: big ? 700 : 240, width: big ? 1000 : 280, height: big ? 700 : 240, toJSON() {} } as DOMRect;
    });
  }

  it("opens to the right of a pin with room beside it", async () => {
    sizeCanvas();
    await openBoard();

    await openThread("pin_open"); // client (300, 240)

    expect(thread()!.dataset.side).toBe("right");
  });

  it("flips to the other side of a pin near the right edge", async () => {
    sizeCanvas();
    serve([{ ...OPEN, x: 440, y: 100 }]); // client (980, 240)
    await openBoard();

    await openThread("pin_open");

    expect(thread()!.dataset.side).toBe("left");
    expect(Number.parseFloat(thread()!.style.left)).toBeLessThan(980);
  });
});

describe("what the layer takes", () => {
  it("lets the canvas keep every gesture the pins do not use", async () => {
    await openBoard();

    expect(document.querySelector<HTMLElement>("[data-pin-layer]")!.style.pointerEvents).toBe("none");
    expect(pinEl("pin_open")!.style.pointerEvents).toBe("auto");
  });

  it("puts the Comment tool's surface beneath the pins, so an existing pin can still be opened", async () => {
    await openBoard();
    pickTool("Comment");

    const layer = document.querySelector<HTMLElement>("[data-pin-layer]")!;
    expect(Number(layer.style.zIndex)).toBeGreaterThan(6); // the tool surfaces are z-6
    fireEvent.click(pinEl("pin_open")!);
    expect(thread()).toBeTruthy();
  });
});
