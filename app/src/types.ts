/**
 * Entity shapes, as the API returns them. See api/README.md § Types and
 * docs/spec.md § Data model. Nothing here is client-only unless it says so.
 */

export type NodeType = "goal" | "strategy" | "campaign" | "content" | "asset" | "note";
export type EdgeKind = "serves" | "relates-to";
export type InkTool = "pen" | "highlighter";
export type MarkVariant = "sticky" | "text";
export type ChatMode = "auto" | "generator" | "librarian" | "reasoner";
/** `operator` can be reported by the server but never requested. */
export type ResolvedChatMode = Exclude<ChatMode, "auto"> | "operator";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  id: string;
  name: string;
  viewport: Viewport;
}

export interface CanvasNode {
  id: string;
  type: NodeType;
  title: string;
  body: string;
  fileIds: string[];
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
  kind: EdgeKind;
  label: string | null;
}

export interface Annotation {
  id: string;
  nodeId: string;
  body: string;
  createdAt: string;
}

export interface FileRef {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  thumbUrl: string | null;
  createdAt: string;
}

export interface Stroke {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  /** Flat: [x0, y0, x1, y1, …]. */
  points: number[];
  createdAt: string;
}

export interface Mark {
  id: string;
  variant: MarkVariant;
  x: number;
  y: number;
  body: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

export interface Pin {
  id: string;
  x: number;
  y: number;
  resolved: boolean;
  createdAt: string;
  comments: Comment[];
}

export type Proposal =
  | { kind: "create-node"; payload: Partial<CanvasNode> }
  | { kind: "create-edge"; payload: Partial<Edge> };

export type ChatMessageStatus = "streaming" | "done" | "error";

/** Client-side record of one chat turn. Chat is not persisted by the API. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: ChatMessageStatus;
  citedNodeIds: string[];
  proposal?: Proposal;
}

// ------------------------------------------------------------ request bodies

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface BoardPatch {
  name?: string;
  viewport?: Viewport;
}

export type NodeInput = Pick<CanvasNode, "type" | "x" | "y"> &
  Partial<Pick<CanvasNode, "title" | "body" | "fileIds">>;
export type NodePatch = Partial<Pick<CanvasNode, "type" | "title" | "body" | "fileIds" | "x" | "y">>;

export type EdgeInput = Pick<Edge, "fromId" | "toId" | "kind"> & Partial<Pick<Edge, "label">>;

export type FileInput = Pick<FileRef, "name" | "mime" | "sizeBytes">;

export type StrokeInput = Pick<Stroke, "tool" | "color" | "width" | "points">;

export type MarkInput = Pick<Mark, "variant" | "x" | "y"> & Partial<Pick<Mark, "body" | "color">>;
export type MarkPatch = Partial<Pick<Mark, "variant" | "x" | "y" | "body" | "color">>;

export type PinInput = Pick<Pin, "x" | "y">;
export type PinPatch = Partial<Pick<Pin, "x" | "y" | "resolved">>;

export interface ChatInput {
  message: string;
  /** Omit for `auto`; the server picks. */
  mode?: ChatMode;
}

// ------------------------------------------------------------ responses

export interface AuthResult {
  token: string;
  user: User;
}

export interface SignupResult extends AuthResult {
  board: Board;
}

export interface ChatStart {
  mode: ResolvedChatMode;
}

export interface ChatDone {
  citedNodeIds: string[];
  proposal: Proposal | null;
}

/** The error envelope every non-2xx response carries. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
