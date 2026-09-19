import type { StoreApi } from "zustand/vanilla";
import { CARD_WIDTH } from "../components/NodeCard";
import { formatBytes } from "../lib/format";
import type { AppStore } from "../store";
import type { CanvasNode, FileRef } from "../types";
import type { UiState } from "../ui/uiStore";

/** The API's limit, mirrored so an oversized file is refused before any request. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Space between asset cards laid out in a row. */
export const ROW_GAP = 24;

/** Same list as api/server.js ACCEPTED_MIME: images, PDF, plain text, markdown, Office. */
const ACCEPTED_MIME = [
  /^image\//,
  /^application\/pdf$/,
  /^text\/plain$/,
  /^text\/markdown$/,
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^application\/msword$/,
  /^application\/vnd\.ms-excel$/,
  /^application\/vnd\.ms-powerpoint$/,
];

/** Browsers often report "" for markdown and some Office files; the extension decides then. */
const MIME_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** For the file picker's `accept`. */
export const FILE_ACCEPT = ["image/*", ...new Set(Object.values(MIME_BY_EXTENSION))]
  .concat(Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`))
  .join(",");

/** From docs/state-matrix.md § O2. */
export const IMPORT_COPY = {
  noneSupported: "No supported files in that drop. Images, PDFs, text and Office files are supported.",
  unsupported: (name: string) => `${name} isn't a supported file type. Supported: images, PDF, text, Office.`,
  tooLarge: (name: string, bytes: number) => `${name} is ${formatBytes(bytes)} — the limit is 25MB.`,
  readFailed: (name: string) => `Couldn't read ${name}. Try adding it again.`,
  saveFailed: (name: string) => `Couldn't add ${name}. Check your connection and try again.`,
};

/** The mime type to register, or null when the file is not one we accept. */
export function resolveMime(file: Pick<File, "name" | "type">): string | null {
  if (file.type && ACCEPTED_MIME.some((re) => re.test(file.type))) return file.type;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return MIME_BY_EXTENSION[ext] ?? null;
}

export interface Rejection {
  name: string;
  reason: "type" | "size";
  sizeBytes: number;
}

export interface Accepted {
  file: File;
  mime: string;
}

export function partitionFiles(files: File[]): { accepted: Accepted[]; rejected: Rejection[] } {
  const accepted: Accepted[] = [];
  const rejected: Rejection[] = [];
  for (const file of files) {
    const mime = resolveMime(file);
    if (!mime) rejected.push({ name: file.name, reason: "type", sizeBytes: file.size });
    else if (file.size > MAX_FILE_BYTES) rejected.push({ name: file.name, reason: "size", sizeBytes: file.size });
    else accepted.push({ file, mime });
  }
  return { accepted, rejected };
}

/** One message naming every rejected file, or the zero-supported message when nothing had a usable type. */
export function rejectionMessages(rejected: Rejection[], acceptedCount: number): string[] {
  if (rejected.length === 0) return [];
  if (acceptedCount === 0 && rejected.every((r) => r.reason === "type")) return [IMPORT_COPY.noneSupported];
  return rejected.map((r) =>
    r.reason === "size" ? IMPORT_COPY.tooLarge(r.name, r.sizeBytes) : IMPORT_COPY.unsupported(r.name),
  );
}

export interface ImportDeps {
  store: AppStore;
  ui: StoreApi<UiState>;
  /** Proves the bytes are readable. Defaults to reading the first byte. */
  read?: (file: File) => Promise<void>;
  createObjectURL?: (file: File) => string;
  revokeObjectURL?: (url: string) => void;
}

export interface ImportResult {
  nodes: CanvasNode[];
  /** What went wrong, per file, in words ready for a toast. */
  messages: string[];
}

const readFirstByte = async (file: File) => void (await file.slice(0, 1).arrayBuffer());

/** A failure already worded for the person who dropped the file. */
class ImportError extends Error {}

/**
 * Reads a file, keeps its bytes in the tab as an object URL and registers its
 * metadata. The API never receives the bytes, so they do not survive a reload.
 */
export async function registerFile({ file, mime }: Accepted, deps: ImportDeps): Promise<FileRef> {
  const read = deps.read ?? readFirstByte;
  try {
    await read(file);
  } catch {
    throw new ImportError(IMPORT_COPY.readFailed(file.name));
  }
  const url = deps.createObjectURL ? deps.createObjectURL(file) : URL.createObjectURL(file);
  try {
    const ref = await deps.store.getState().createFile({ name: file.name, mime, sizeBytes: file.size });
    deps.store.getState().setObjectUrl(ref.id, url);
    return ref;
  } catch {
    if (deps.revokeObjectURL) deps.revokeObjectURL(url);
    else URL.revokeObjectURL(url);
    throw new ImportError(IMPORT_COPY.saveFailed(file.name));
  }
}

let pendingSeq = 0;

/**
 * O2 — one asset node per supported file, in a row from `origin`. Each shows a
 * progress placeholder while it is read; rejected files are named, never dropped silently.
 */
export async function importFiles(
  files: File[],
  origin: { x: number; y: number },
  deps: ImportDeps,
): Promise<ImportResult> {
  const { accepted, rejected } = partitionFiles(files);
  const messages = rejectionMessages(rejected, accepted.length);

  const settled = await Promise.all(
    accepted.map(async (item, i) => {
      const x = Math.round(origin.x + i * (CARD_WIDTH + ROW_GAP));
      const y = Math.round(origin.y);
      const pendingId = `pending_${++pendingSeq}`;
      deps.ui
        .getState()
        .addPending({ id: pendingId, name: item.file.name, mime: item.mime, sizeBytes: item.file.size, x, y });
      try {
        const ref = await registerFile(item, deps);
        try {
          return await deps.store
            .getState()
            .createNode({ type: "asset", title: item.file.name, fileIds: [ref.id], x, y });
        } catch {
          throw new ImportError(IMPORT_COPY.saveFailed(item.file.name));
        }
      } catch (error) {
        messages.push(error instanceof ImportError ? error.message : IMPORT_COPY.saveFailed(item.file.name));
        return null;
      } finally {
        deps.ui.getState().removePending(pendingId);
      }
    }),
  );

  return { nodes: settled.filter((n): n is CanvasNode => n !== null), messages };
}
