import { describe, expect, it, vi } from "vitest";
import { ApiError, createClient, path } from "../client";
import { apiError, json, stubFetch } from "./helpers";

const BASE = "http://api.test";

function client(fetchImpl: typeof fetch, token: string | null = "tok_1", onUnauthorized = vi.fn()) {
  return {
    onUnauthorized,
    api: createClient({ baseUrl: BASE, getToken: () => token, onUnauthorized, fetch: fetchImpl }),
  };
}

describe("createClient", () => {
  it("sends JSON to the base URL with the bearer token and parses the reply", async () => {
    const { fetch, calls } = stubFetch(json(201, { id: "nd_1" }));
    const { api } = client(fetch);

    const result = await api.request<{ id: string }>("POST", "/nodes", { type: "note", x: 1, y: 2 });

    expect(result).toEqual({ id: "nd_1" });
    expect(calls[0]).toMatchObject({
      url: `${BASE}/nodes`,
      method: "POST",
      body: { type: "note", x: 1, y: 2 },
    });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer tok_1");
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
  });

  it("omits Authorization when there is no token", async () => {
    const { fetch, calls } = stubFetch(json(200, { ok: true }));
    const { api } = client(fetch, null);

    await api.request("GET", "/health");

    expect(calls[0]?.headers["authorization"]).toBeUndefined();
  });

  it("resolves a 204 to undefined", async () => {
    const { fetch } = stubFetch(json(204));
    const { api } = client(fetch);

    await expect(api.request("DELETE", "/nodes/nd_1")).resolves.toBeUndefined();
  });

  it("throws an ApiError carrying code, message, field and status on a non-2xx", async () => {
    const { fetch } = stubFetch(apiError(409, "edge_exists", "Already connected.", "toId"));
    const { api } = client(fetch);

    const error = await api.request("POST", "/edges", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "edge_exists", message: "Already connected.", field: "toId" });
  });

  it("still throws an ApiError when the error body is not the envelope", async () => {
    const { fetch } = stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    const { api } = client(fetch);

    const error = await api.request("GET", "/nodes").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "unexpected_response" });
  });

  it("wraps a network failure in an ApiError", async () => {
    const { fetch } = stubFetch(new TypeError("Failed to fetch"));
    const { api } = client(fetch);

    const error = await api.request("GET", "/nodes").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it.each(["invalid_token", "no_token"])("reports a 401 %s as unauthorized", async (code) => {
    const { fetch } = stubFetch(apiError(401, code));
    const { api, onUnauthorized } = client(fetch);

    await expect(api.request("GET", "/nodes")).rejects.toMatchObject({ code });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not treat bad credentials as an expired session", async () => {
    const { fetch } = stubFetch(apiError(401, "bad_credentials"));
    const { api, onUnauthorized } = client(fetch);

    await expect(api.request("POST", "/auth/login", {})).rejects.toMatchObject({ code: "bad_credentials" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("path", () => {
  it("encodes every interpolated segment", () => {
    expect(path`/nodes/${"nd 1"}/annotations`).toBe("/nodes/nd%201/annotations");
  });

  it("keeps hostile ids inside their segment", async () => {
    const { fetch, calls } = stubFetch(json(200, {}));
    const { api } = client(fetch);

    await api.request("GET", path`/nodes/${"../me?admin=1#x"}`);

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/nodes/..%2Fme%3Fadmin%3D1%23x");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });
});
