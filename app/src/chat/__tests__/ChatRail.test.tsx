// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { controlledSse, sseFrame, sseResponse } from "../../api/__tests__/helpers";
import { apiError, network, renderAt, resetApp, serveEmptyBoard, user } from "../../routes/__tests__/harness";
import { appStore } from "../../store";
import { NARROW_QUERY } from "../../lib/useMediaQuery";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";

beforeEach(() => {
  resetApp();
  sessionStorage.clear();
  uiStore.getState().reset();
  uiStore.setState({ railCollapsed: false, chatSheetOpen: false, chatDraft: "" });
  appStore.getState().signIn({ token: "tok", user });
  serveEmptyBoard();
});
afterEach(() => {
  cleanup();
  // @ts-expect-error jsdom ships no matchMedia; the stub is removed to match.
  delete window.matchMedia;
});

/** Makes the window report itself narrower than 900px, or not. */
function stubViewport(narrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query === NARROW_QUERY,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const composer = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Send" });
const conversation = () => screen.getByRole("list", { name: "Conversation" });
const posts = () => network.callsTo("POST /chat");

async function openRail() {
  const rendered = renderAt("/");
  await screen.findByRole("textbox", { name: "Message" });
  await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
  return rendered;
}

const type = (text: string) => fireEvent.change(composer(), { target: { value: text } });
/** True when the key was left for the browser to handle; false when the app consumed it. */
const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(composer(), { key, ...init });

/** The message at `index` in the conversation. Its own markdown lists have list items too, so count only the rows. */
const message = (index: number) => Array.from(conversation().children)[index] as HTMLElement;
const messageCount = () => conversation().children.length;
const body = (li: HTMLElement) => li.querySelector("[data-chat-body]") as HTMLElement;

describe("empty rail", () => {
  it("offers three example prompts that fill the composer without sending", async () => {
    await openRail();

    expect(screen.getByText("Ask about your canvas, or ask me to draft something.")).toBeTruthy();
    const examples = within(screen.getByRole("list", { name: "Example prompts" })).getAllByRole("button");
    expect(examples).toHaveLength(3);

    fireEvent.click(examples[0]!);

    expect(composer().value.length).toBeGreaterThan(10);
    expect(examples[0]!.textContent).toContain(composer().value);
    expect(document.activeElement).toBe(composer());
    expect(posts()).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Conversation" })).toBeNull();
  });

  it("marks its composer so the Add menu's From chat item can find it", async () => {
    await openRail();

    expect(composer().hasAttribute("data-chat-composer")).toBe(true);
  });
});

describe("sending", () => {
  it("shows your message and a reply that begins streaming when Enter is pressed, and posts only the message", async () => {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openRail();
    type("what serves linen?");

    const consumed = !press("Enter");

    expect(consumed).toBe(true);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ message: "what serves linen?" });
    expect(composer().value).toBe("");
    expect(within(message(0)).getByText("what serves linen?")).toBeTruthy();
    expect(message(1).getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Ask about your canvas, or ask me to draft something.")).toBeNull();

    // Before the first token the reply says it is on its way; once words arrive that goes.
    expect(within(message(1)).getByText("Assistant is replying")).toBeTruthy();
    stream.push("start", { mode: "librarian" });
    stream.push("token", { token: "3 nodes " });
    await waitFor(() => expect(body(message(1)).textContent).toContain("3 nodes"));
    expect(within(message(1)).queryByText("Assistant is replying")).toBeNull();
    stream.push("token", { token: "speak to that." });
    await waitFor(() => expect(body(message(1)).textContent).toBe("3 nodes speak to that."));

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() => expect(message(1).getAttribute("aria-busy")).toBe("false"));
  });

  it("inserts a newline on Shift+Enter and sends nothing", async () => {
    network.on("POST /chat", () => sseResponse([sseFrame("done", { citedNodeIds: [], proposal: null })]));
    await openRail();
    type("a line");

    const leftToBrowser = press("Enter", { shiftKey: true });

    expect(leftToBrowser).toBe(true); // not prevented, so the textarea inserts its own newline
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
    expect(composer().value).toBe("a line");
  });

  it("stops at the 5000 characters the API accepts", async () => {
    await openRail();

    expect(composer().maxLength).toBe(5000);
  });

  it("does not send on the Enter that confirms an input method's composition (Safari reports it as keyCode 229)", async () => {
    await openRail();
    type("日本語");

    press("Enter", { keyCode: 229 });

    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it("does not send on Enter while an input method is composing", async () => {
    await openRail();
    type("日本語");

    press("Enter", { isComposing: true });

    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
  });

  it("sends from the Send button, which says why it can't while there is nothing to send", async () => {
    network.on("POST /chat", () => sseResponse([sseFrame("done", { citedNodeIds: [], proposal: null })]));
    await openRail();

    expect(sendButton().getAttribute("aria-disabled")).toBe("true");
    expect(sendButton().title).toBe(COPY.chatWriteFirst);
    fireEvent.click(sendButton());
    expect(posts()).toHaveLength(0);

    type("hello");
    expect(sendButton().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(sendButton());
    await waitFor(() => expect(posts()).toHaveLength(1));
  });
});

describe("while a reply is streaming", () => {
  async function streaming() {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openRail();
    type("slow question");
    press("Enter");
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));
    return stream;
  }

  it("makes the composer and Send non-interactive, and Enter sends nothing more", async () => {
    const stream = await streaming();

    expect(composer().getAttribute("aria-disabled")).toBe("true");
    expect(composer().readOnly).toBe(true);
    expect(sendButton().getAttribute("aria-disabled")).toBe("true");
    expect(sendButton().title).toBe(COPY.waitForReply);

    // A draft is waiting in the box; neither Enter nor Send may spend it mid-reply.
    act(() => uiStore.getState().setChatDraft("a second question"));
    press("Enter");
    fireEvent.click(sendButton());
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(1);
    expect(composer().value).toBe("a second question");
    expect(messageCount()).toBe(2);

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() => expect(composer().getAttribute("aria-disabled")).toBeNull());
    expect(composer().readOnly).toBe(false);
  });

  it("keeps focus in the composer so you can carry on typing the moment the reply ends", async () => {
    const stream = await streaming();
    composer().focus();

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();

    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(false));
    expect(document.activeElement).toBe(composer());
  });

  it("turns off From chat in the Add menu, with the reason, until the reply is done", async () => {
    const stream = await streaming();

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    const item = await screen.findByRole("menuitem", { name: /^From chat/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.title).toBe(COPY.waitForReply);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect((await screen.findByRole("menuitem", { name: /^From chat/ })).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("a failed reply", () => {
  async function failed() {
    network.on("POST /chat", () =>
      sseResponse([
        sseFrame("start", { mode: "librarian" }),
        sseFrame("token", { token: "Half a " }),
        sseFrame("error", { code: "stream_failed", message: "The response was interrupted." }),
      ]),
    );
    await openRail();
    type("what is going on __fail");
    press("Enter");
    await screen.findByText(COPY.chatReplyFailed);
  }

  it("says the reply didn't finish, keeps your message, and gives the composer back", async () => {
    await failed();

    expect(within(message(0)).getByText("what is going on __fail")).toBeTruthy();
    expect(within(message(1)).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(composer().getAttribute("aria-disabled")).toBeNull();
    type("another go");
    expect(sendButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("asks again into the same reply on Retry, without a second copy of your message", async () => {
    await failed();
    network.on("POST /chat", () =>
      sseResponse([
        sseFrame("token", { token: "Whole answer." }),
        sseFrame("done", { citedNodeIds: [], proposal: null }),
      ]),
    );

    fireEvent.click(within(message(1)).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(body(message(1)).textContent).toBe("Whole answer."));
    expect(screen.queryByText(COPY.chatReplyFailed)).toBeNull();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.body).toEqual({ message: "what is going on __fail" });
    expect(messageCount()).toBe(2);
  });

  it("holds an old reply's Retry back while a newer reply is streaming", async () => {
    await failed();
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    type("a newer question");
    press("Enter");
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    const retry = within(message(1)).getByRole("button", { name: "Retry" });
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(retry.title).toBe(COPY.waitForReply);
    fireEvent.click(retry);
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(2);

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() =>
      expect(within(message(1)).getByRole("button", { name: "Retry" }).getAttribute("aria-disabled")).toBeNull(),
    );
  });

  it("hands focus to the composer when Retry is pressed, instead of dropping it to the page", async () => {
    await failed();
    network.on("POST /chat", () => controlledSse().response);
    const retry = within(message(1)).getByRole("button", { name: "Retry" });
    retry.focus();

    fireEvent.click(retry);

    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));
    expect(document.activeElement).toBe(composer());
  });

  it("treats a refused request the same way", async () => {
    network.on("POST /chat", () => apiError(503, "forced_failure", "Down."));
    await openRail();
    type("hello");
    press("Enter");

    await screen.findByText(COPY.chatReplyFailed);
    expect(within(message(0)).getByText("hello")).toBeTruthy();
  });
});

describe("announcing a reply", () => {
  it("tells assistive technology once, when the reply is complete, and never token by token", async () => {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openRail();
    type("what serves linen?");
    press("Enter");
    await waitFor(() => expect(posts()).toHaveLength(1));
    const announcer = () => within(message(1)).getByRole("status");

    stream.push("token", { token: "**3** nodes " });
    await waitFor(() => expect(body(message(1)).textContent).toContain("nodes"));
    expect(announcer().textContent).toBe("");
    stream.push("token", { token: "speak to that." });
    await waitFor(() => expect(body(message(1)).textContent).toBe("3 nodes speak to that."));
    expect(announcer().textContent).toBe("");
    // The words themselves are not in a live region; only the announcer is.
    expect(body(message(1)).closest("[aria-live], [role=status], [role=alert], [role=log]")).toBeNull();

    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() => expect(announcer().textContent).toBe("3 nodes speak to that."));
    // A screen reader meets the finished reply once: the visible copy steps aside for the announcer.
    expect(body(message(1)).getAttribute("aria-hidden")).toBe("true");
  });
});

describe("collapsing", () => {
  it("collapses to a strip, and renders collapsed after a reload", async () => {
    await openRail();

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeTruthy();
    // It is kept for this tab only, and never in localStorage, which holds the session token and nothing else.
    expect(sessionStorage.length).toBeGreaterThan(0);
    expect(Object.keys(localStorage).filter((key) => key !== "mc-session-token")).toEqual([]);

    cleanup(); // a reload: the page starts over, the tab's storage does not
    renderAt("/");
    await screen.findByRole("button", { name: "Open assistant" });
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("keeps what you had typed across a collapse", async () => {
    await openRail();
    type("half a thought");

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(composer().value).toBe("half a thought");
  });

  it("lets a reply finish while collapsed, and it is all there when the rail is opened again", async () => {
    const stream = controlledSse();
    network.on("POST /chat", () => stream.response);
    await openRail();
    type("what serves linen?");
    press("Enter");
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    stream.push("token", { token: "Three nodes." });
    stream.push("done", { citedNodeIds: [], proposal: null });
    stream.close();
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(body(message(1)).textContent).toBe("Three nodes.");
    expect(composer().getAttribute("aria-disabled")).toBeNull();
  });

  it("is never disabled, even while a reply is streaming", async () => {
    network.on("POST /chat", () => controlledSse().response);
    await openRail();
    type("hello");
    press("Enter");
    await waitFor(() => expect(appStore.getState().chatStreaming).toBe(true));

    const collapse = screen.getByRole("button", { name: "Collapse assistant" });

    expect(collapse.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeTruthy();
  });

  it("is expanded and focused by From chat in the Add menu", async () => {
    await openRail();
    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^From chat/ }));

    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it("focuses the composer from From chat when the rail is already open", async () => {
    await openRail();

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^From chat/ }));

    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(composer().value).toBe(""); // prefills nothing
  });
});

describe("below 900px", () => {
  it("is an overlay sheet opened from a floating button, not a column", async () => {
    stubViewport(true);
    renderAt("/");
    const open = await screen.findByRole("button", { name: "Open assistant" });
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    fireEvent.click(open);

    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Assistant" }).getAttribute("data-mode")).toBe("sheet");

    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });

  it("closes the sheet on Escape", async () => {
    stubViewport(true);
    renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Open assistant" }));
    await screen.findByRole("textbox", { name: "Message" });

    press("Escape");

    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  });

  it("opens from a collapsed column setting too: the collapse is for the wide layout", async () => {
    stubViewport(true);
    uiStore.getState().setRailCollapsed(true);
    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "Open assistant" }));

    expect(await screen.findByRole("textbox", { name: "Message" })).toBeTruthy();
  });

  it("is opened and focused by From chat in the Add menu", async () => {
    stubViewport(true);
    renderAt("/");
    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));

    fireEvent.click(await screen.findByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^From chat/ }));

    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(screen.getByRole("complementary", { name: "Assistant" }).getAttribute("data-mode")).toBe("sheet");
    expect(composer().value).toBe("");
  });

  it("keeps the canvas shortcuts quiet while the sheet covers it", async () => {
    stubViewport(true);
    renderAt("/");
    await waitFor(() => expect(appStore.getState().boardStatus).toBe("ready"));
    fireEvent.click(await screen.findByRole("button", { name: "Open assistant" }));
    await screen.findByRole("textbox", { name: "Message" });

    fireEvent.keyDown(window, { key: "n" });
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByRole("menu", { name: "Add node" })).toBeNull();
  });

  it("is a column on a wide screen", async () => {
    stubViewport(false);
    await openRail();

    expect(screen.getByRole("complementary", { name: "Assistant" }).getAttribute("data-mode")).toBe("column");
  });
});
