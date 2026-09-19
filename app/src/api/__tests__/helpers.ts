import { vi } from "vitest";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function json(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(status: number, code: string, message = `${code} happened`, field?: string) {
  return json(status, { error: { code, message, ...(field ? { field } : {}) } });
}

/**
 * A fetch stub that answers each call with the next responder and records what
 * was sent. Responders may be a Response, an Error to reject with, or a function.
 */
export function stubFetch(...responders: Array<Response | Error | ((call: RecordedCall) => Response | Promise<Response>)>) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const next = responders.length > 1 ? responders.shift() : responders[0];
    if (next === undefined) throw new Error("stubFetch: no responder left");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next.clone();
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
}
