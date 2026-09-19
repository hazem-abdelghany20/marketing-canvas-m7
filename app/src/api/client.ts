import type { ApiErrorBody } from "../types";

/**
 * The only error this layer throws. `code` is stable and safe to branch on;
 * `message` is written for people; `field` names the form field when there is one.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** 401 codes that mean the session is gone, as opposed to a wrong password. */
const SESSION_ENDED = new Set(["invalid_token", "no_token"]);

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Called on every 401 that means the session ended. De-duplication is the caller's job. */
  onUnauthorized: () => void;
  fetch?: typeof fetch;
}

export interface ApiClient {
  /** JSON in, JSON out. A 204 resolves to `undefined`. */
  request<T>(method: HttpMethod, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
  /** For streamed responses: resolves with the raw 2xx `Response`, throws `ApiError` otherwise. */
  open(method: HttpMethod, path: string, body?: unknown, signal?: AbortSignal): Promise<Response>;
}

/**
 * Builds a path from a template, percent-encoding every interpolated value so an
 * id can never step outside its own segment: path`/nodes/${id}`.
 */
export function path(strings: TemplateStringsArray, ...params: string[]): string {
  return strings.reduce((out, literal, i) => {
    const param = params[i];
    return out + literal + (param === undefined ? "" : encodeURIComponent(param));
  }, "");
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const error = body.error;
    if (error && typeof error.code === "string" && typeof error.message === "string") {
      return new ApiError(response.status, error.code, error.message, error.field);
    }
  } catch {
    /* not JSON: fall through */
  }
  return new ApiError(
    response.status,
    "unexpected_response",
    `The server answered ${response.status} without an explanation. Try again in a moment.`,
  );
}

export function createClient(options: ClientOptions): ApiClient {
  // Looked up per request, not captured once: a fetch installed later still applies.
  const fetchImpl: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);

  async function open(method: HttpMethod, requestPath: string, body?: unknown, signal?: AbortSignal) {
    // The path is resolved against the base, never glued onto it.
    const url = new URL(requestPath, options.baseUrl);
    const headers = new Headers({ Accept: "application/json" });
    const token = options.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        throw new ApiError(0, "aborted", "The request was cancelled.");
      }
      throw new ApiError(0, "network_error", "Couldn't reach the server. Check your connection and try again.");
    }

    if (!response.ok) {
      const error = await toApiError(response);
      if (response.status === 401 && SESSION_ENDED.has(error.code)) options.onUnauthorized();
      throw error;
    }
    return response;
  }

  async function request<T>(method: HttpMethod, requestPath: string, body?: unknown, signal?: AbortSignal) {
    const response = await open(method, requestPath, body, signal);
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(response.status, "unexpected_response", "The server sent a reply that couldn't be read.");
    }
  }

  return { request, open };
}
