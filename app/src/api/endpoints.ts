import { ApiError, path, type ApiClient } from "./client";
import type {
  Annotation,
  AuthResult,
  Board,
  BoardPatch,
  CanvasNode,
  ChatDone,
  ChatInput,
  ChatStart,
  Comment,
  Edge,
  EdgeInput,
  FileInput,
  FileRef,
  LoginInput,
  Mark,
  MarkInput,
  MarkPatch,
  NodeInput,
  NodePatch,
  Pin,
  PinInput,
  PinPatch,
  SignupInput,
  SignupResult,
  Stroke,
  StrokeInput,
  User,
} from "../types";

export interface ChatHandlers {
  onStart?: (start: ChatStart) => void;
  onToken?: (token: string) => void;
}

/**
 * One typed function per endpoint in api/README.md. Every id goes through the
 * path`` tag, so no request URL is ever glued together from raw input.
 */
export function createEndpoints(client: ApiClient) {
  const { request } = client;

  return {
    health: () => request<{ ok: boolean; nodes: number }>("GET", "/health"),

    auth: {
      signup: (input: SignupInput) => request<SignupResult>("POST", "/auth/signup", input),
      login: (input: LoginInput) => request<AuthResult>("POST", "/auth/login", input),
      logout: () => request<void>("POST", "/auth/logout"),
      me: async () => (await request<{ user: User }>("GET", "/me")).user,
    },

    board: {
      get: (signal?: AbortSignal) => request<Board>("GET", "/board", undefined, signal),
      update: (patch: BoardPatch) => request<Board>("PATCH", "/board", patch),
    },

    nodes: {
      list: (signal?: AbortSignal) => request<CanvasNode[]>("GET", "/nodes", undefined, signal),
      create: (input: NodeInput) => request<CanvasNode>("POST", "/nodes", input),
      get: (id: string) => request<CanvasNode>("GET", path`/nodes/${id}`),
      update: (id: string, patch: NodePatch) => request<CanvasNode>("PATCH", path`/nodes/${id}`, patch),
      remove: (id: string) => request<void>("DELETE", path`/nodes/${id}`),
    },

    edges: {
      list: (signal?: AbortSignal) => request<Edge[]>("GET", "/edges", undefined, signal),
      create: (input: EdgeInput) => request<Edge>("POST", "/edges", input),
      remove: (id: string) => request<void>("DELETE", path`/edges/${id}`),
    },

    annotations: {
      list: (nodeId: string, signal?: AbortSignal) =>
        request<Annotation[]>("GET", path`/nodes/${nodeId}/annotations`, undefined, signal),
      create: (nodeId: string, body: string) =>
        request<Annotation>("POST", path`/nodes/${nodeId}/annotations`, { body }),
      remove: (id: string) => request<void>("DELETE", path`/annotations/${id}`),
    },

    files: {
      list: (signal?: AbortSignal) => request<FileRef[]>("GET", "/files", undefined, signal),
      create: (input: FileInput) => request<FileRef>("POST", "/files", input),
      remove: (id: string) => request<void>("DELETE", path`/files/${id}`),
    },

    strokes: {
      list: (signal?: AbortSignal) => request<Stroke[]>("GET", "/strokes", undefined, signal),
      create: (input: StrokeInput) => request<Stroke>("POST", "/strokes", input),
      /** Removes every stroke on the board. */
      clear: () => request<void>("DELETE", "/strokes"),
      remove: (id: string) => request<void>("DELETE", path`/strokes/${id}`),
    },

    marks: {
      list: (signal?: AbortSignal) => request<Mark[]>("GET", "/marks", undefined, signal),
      create: (input: MarkInput) => request<Mark>("POST", "/marks", input),
      update: (id: string, patch: MarkPatch) => request<Mark>("PATCH", path`/marks/${id}`, patch),
      remove: (id: string) => request<void>("DELETE", path`/marks/${id}`),
    },

    pins: {
      list: (signal?: AbortSignal) => request<Pin[]>("GET", "/pins", undefined, signal),
      create: (input: PinInput) => request<Pin>("POST", "/pins", input),
      update: (id: string, patch: PinPatch) => request<Pin>("PATCH", path`/pins/${id}`, patch),
      remove: (id: string) => request<void>("DELETE", path`/pins/${id}`),
      addComment: (pinId: string, body: string) =>
        request<Comment>("POST", path`/pins/${pinId}/comments`, { body }),
      removeComment: (id: string) => request<void>("DELETE", path`/comments/${id}`),
    },

    chat: {
      /**
       * POST /chat answers with server-sent events. Resolves with the `done`
       * payload; an `error` event or a stream that ends early rejects with ApiError.
       */
      stream: async (input: ChatInput, handlers: ChatHandlers, signal?: AbortSignal): Promise<ChatDone> => {
        const response = await client.open("POST", "/chat", input, signal);
        if (!response.body) {
          throw new ApiError(response.status, "stream_incomplete", "The reply arrived empty. Try asking again.");
        }
        for await (const { event, data } of readEvents(response.body)) {
          if (event === "start") handlers.onStart?.(data as ChatStart);
          else if (event === "token") handlers.onToken?.((data as { token: string }).token);
          else if (event === "done") return data as ChatDone;
          else if (event === "error") {
            const { code, message } = data as { code: string; message: string };
            throw new ApiError(response.status, code, message);
          }
        }
        throw new ApiError(
          response.status,
          "stream_incomplete",
          "The reply stopped before it finished. Try asking again.",
        );
      },
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;

interface ServerEvent {
  event: string;
  data: unknown;
}

/** Parses a text/event-stream body into events, buffering across chunk boundaries. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const parsed = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (parsed) yield parsed;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): ServerEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}
