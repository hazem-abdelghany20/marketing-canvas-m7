// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resizeViewport, stubViewport, unstubViewport } from "../../test/viewport";
import { isNarrow, isPhone, PHONE_QUERY, usePhone } from "../useMediaQuery";

afterEach(() => {
  cleanup();
  unstubViewport();
});

describe("isPhone", () => {
  it("is false where the browser can't say, as in jsdom: a wide screen is the default", () => {
    expect(isPhone()).toBe(false);
  });

  it("is true below 640px and false from 640px up", () => {
    stubViewport(639);
    expect(isPhone()).toBe(true);
    stubViewport(640);
    expect(isPhone()).toBe(false);
  });

  it("asks for the 640px line, which the tablet layout between 640px and 900px stays above", () => {
    expect(PHONE_QUERY).toBe("(max-width: 639px)");
  });

  it("is a narrow window too, since the narrow rules (an overlay rail, icon toolbar) are the floor the phone builds on", () => {
    stubViewport(375);
    expect(isNarrow()).toBe(true);
    stubViewport(700);
    expect(isNarrow()).toBe(true);
    expect(isPhone()).toBe(false);
  });
});

describe("usePhone", () => {
  it("follows the window as it crosses 640px, in either direction", () => {
    stubViewport(1000);
    const { result } = renderHook(() => usePhone());
    expect(result.current).toBe(false);

    act(() => resizeViewport(375));
    expect(result.current).toBe(true);

    act(() => resizeViewport(900));
    expect(result.current).toBe(false);
  });
});
