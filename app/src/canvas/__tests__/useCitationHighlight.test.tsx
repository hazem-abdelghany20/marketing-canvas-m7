// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appStore } from "../../store";
import type { ChatMessage } from "../../types";
import { uiStore } from "../../ui/uiStore";
import { useCitationHighlight } from "../useCitationHighlight";

const T = "2026-09-02T00:00:00.000Z";
let seq = 0;
const reply = (status: ChatMessage["status"], cited: string[] = []): ChatMessage => ({
  id: `m${++seq}`,
  role: "assistant",
  content: "x",
  status,
  citedNodeIds: cited,
  createdAt: T,
});
const asked = (): ChatMessage => ({
  id: `m${++seq}`,
  role: "user",
  content: "q",
  status: "done",
  citedNodeIds: [],
  createdAt: T,
});

const set = (chatMessages: ChatMessage[]) => act(() => appStore.setState({ chatMessages }));
const select = (ids: string[]) => act(() => uiStore.getState().select(ids));
const cited = () => uiStore.getState().citedIds;

beforeEach(() => {
  cleanup();
  uiStore.getState().reset();
  appStore.setState({ chatMessages: [], chatStreaming: false });
});
afterEach(cleanup);

describe("useCitationHighlight", () => {
  it("highlights the nodes a reply cites, once it completes", () => {
    renderHook(() => useCitationHighlight());
    const streaming = reply("streaming");
    set([asked(), streaming]);
    expect(cited()).toEqual([]);

    set([asked(), { ...streaming, status: "done", citedNodeIds: ["a", "b"] }]);

    expect(cited()).toEqual(["a", "b"]);
  });

  it("does not light up a reply that was already finished before the canvas appeared", () => {
    set([asked(), reply("done", ["a"])]);

    renderHook(() => useCitationHighlight());

    expect(cited()).toEqual([]);
  });

  it("clears when a different node is selected", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a", "b"])]);
    expect(cited()).toEqual(["a", "b"]);

    select(["z"]);

    expect(cited()).toEqual([]);
  });

  it("stays when a cited node is the one selected, as when a chip is used", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a", "b"])]);

    select(["a"]);
    expect(cited()).toEqual(["a", "b"]);
    select(["a", "b"]);
    expect(cited()).toEqual(["a", "b"]);
  });

  it("clears when a cited node is selected along with one that was not cited", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a", "b"])]);

    select(["a", "z"]);

    expect(cited()).toEqual([]);
  });

  it("clears when the selection is emptied, which is the next selection change", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a"])]);
    select(["a"]);

    select([]);

    expect(cited()).toEqual([]);
  });

  it("is not cleared by a reply arriving while some other node is selected", () => {
    renderHook(() => useCitationHighlight());
    select(["z"]);

    set([asked(), reply("done", ["a"])]);

    expect(cited()).toEqual(["a"]);
  });

  it("clears the old highlight as soon as a new question is asked", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a"])]);
    expect(cited()).toEqual(["a"]);

    set([asked(), reply("done", ["a"]), asked(), reply("streaming")]);

    expect(cited()).toEqual([]);
  });

  it("clears while a failed reply is being retried", () => {
    renderHook(() => useCitationHighlight());
    const first = reply("done", ["a"]);
    set([asked(), first]);
    expect(cited()).toEqual(["a"]);

    set([asked(), { ...first, status: "streaming", citedNodeIds: [] }]);

    expect(cited()).toEqual([]);
  });

  it("is not cleared by selecting nothing when nothing was selected", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", ["a"])]);

    select([]);

    expect(cited()).toEqual(["a"]);
  });

  it("clears when an older failed reply is retried, and marks that reply's citations when it completes", () => {
    renderHook(() => useCitationHighlight());
    const old = { ...reply("error"), id: "old" };
    const newer = reply("done", ["a"]);
    set([asked(), old, asked(), newer]);
    expect(cited()).toEqual(["a"]);

    set([asked(), { ...old, status: "streaming" }, asked(), newer]);
    expect(cited()).toEqual([]);

    set([asked(), { ...old, status: "done", citedNodeIds: ["b"] }, asked(), newer]);
    expect(cited()).toEqual(["b"]);
  });

  it("swaps in the next reply's citations", () => {
    renderHook(() => useCitationHighlight());
    const q = asked();
    set([q, reply("done", ["a"])]);
    set([q, reply("done", ["a"]), asked(), reply("done", ["b", "c"])]);

    expect(cited()).toEqual(["b", "c"]);
  });

  it("highlights nothing for a reply that cites nothing", () => {
    renderHook(() => useCitationHighlight());
    set([asked(), reply("done", [])]);

    expect(cited()).toEqual([]);
  });

  it("stops listening when the canvas goes away", () => {
    const { unmount } = renderHook(() => useCitationHighlight());
    unmount();

    set([asked(), reply("done", ["a"])]);

    expect(cited()).toEqual([]);
  });
});
