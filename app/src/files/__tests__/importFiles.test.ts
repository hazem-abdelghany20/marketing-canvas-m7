import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json } from "../../api/__tests__/helpers";
import { CARD_WIDTH } from "../../components/NodeCard";
import { deferred, loadedStore, seededRoutes } from "../../store/__tests__/fakeBackend";
import type { RecordedCall } from "../../api/__tests__/helpers";
import type { CanvasNode, FileRef } from "../../types";
import { uiStore } from "../../ui/uiStore";
import {
  IMPORT_COPY,
  importFiles,
  MAX_FILE_BYTES,
  partitionFiles,
  rejectionMessages,
  resolveMime,
  ROW_GAP,
} from "../importFiles";

const T = "2026-09-02T00:00:00.000Z";

function file(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** A backend that registers files and creates nodes, numbering both. */
function importRoutes() {
  let seq = 0;
  return {
    ...seededRoutes(),
    "POST /files": (call: RecordedCall) => {
      const body = call.body as Pick<FileRef, "name" | "mime" | "sizeBytes">;
      return json(201, { id: `fl_new${++seq}`, thumbUrl: null, createdAt: T, ...body } satisfies FileRef);
    },
    "POST /nodes": (call: RecordedCall) =>
      json(201, {
        id: `nd_new${++seq}`,
        title: "Untitled",
        body: "",
        fileIds: [],
        createdAt: T,
        updatedAt: T,
        ...(call.body as Partial<CanvasNode>),
      } as CanvasNode),
  };
}

async function setup(routes = importRoutes()) {
  const made = await loadedStore(routes);
  const deps = {
    store: made.store,
    ui: uiStore,
    createObjectURL: vi.fn((f: File) => `blob:test/${f.name}`),
    revokeObjectURL: vi.fn(),
  };
  return { ...made, deps };
}

beforeEach(() => uiStore.getState().reset());

describe("resolveMime", () => {
  it("accepts images, PDF, text, markdown and Office by type", () => {
    expect(resolveMime(file("a.png", "image/png"))).toBe("image/png");
    expect(resolveMime(file("a.pdf", "application/pdf"))).toBe("application/pdf");
    expect(resolveMime(file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(resolveMime(file("notes.md", ""))).toBe("text/markdown");
  });

  it("refuses anything else", () => {
    expect(resolveMime(file("setup.exe", "application/x-msdownload"))).toBeNull();
    expect(resolveMime(file("archive.zip", "application/zip"))).toBeNull();
  });
});

describe("partitionFiles and rejectionMessages", () => {
  it("rejects a file over 25MB and names it with the limit", () => {
    const { accepted, rejected } = partitionFiles([file("huge.pdf", "application/pdf", MAX_FILE_BYTES + 1)]);
    expect(accepted).toHaveLength(0);
    expect(rejectionMessages(rejected, 0)).toEqual(["huge.pdf is 25.0MB — the limit is 25MB."]);
  });

  it("names an unsupported file and the supported types, alongside a valid one", () => {
    const { accepted, rejected } = partitionFiles([file("a.png", "image/png"), file("setup.exe", "application/x-msdownload")]);
    expect(accepted.map((a) => a.file.name)).toEqual(["a.png"]);
    expect(rejectionMessages(rejected, accepted.length)).toEqual([
      "setup.exe isn't a supported file type. Supported: images, PDF, text, Office.",
    ]);
  });

  it("says so when a drop holds no supported file at all", () => {
    const { accepted, rejected } = partitionFiles([file("a.exe", ""), file("b.zip", "application/zip")]);
    expect(rejectionMessages(rejected, accepted.length)).toEqual([IMPORT_COPY.noneSupported]);
  });
});

describe("importFiles", () => {
  it("creates one asset node at the drop point, holding the file and its bytes", async () => {
    const { store, backend, deps } = await setup();

    const { nodes, messages } = await importFiles([file("lookbook.pdf", "application/pdf", 4096)], { x: 300, y: 200 }, deps);

    expect(messages).toEqual([]);
    expect(backend.callsTo("POST /files")[0]!.body).toEqual({ name: "lookbook.pdf", mime: "application/pdf", sizeBytes: 4096 });
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node).toMatchObject({ type: "asset", title: "lookbook.pdf", x: 300, y: 200 });
    const fileId = node.fileIds[0]!;
    expect(store.getState().files[fileId]?.name).toBe("lookbook.pdf");
    expect(store.getState().objectUrls[fileId]).toBe("blob:test/lookbook.pdf");
  });

  it("lays three files out in a row", async () => {
    const { deps } = await setup();
    const files = ["a.png", "b.png", "c.png"].map((n) => file(n, "image/png"));

    const { nodes } = await importFiles(files, { x: 100, y: 50 }, deps);

    const byTitle = Object.fromEntries(nodes.map((n) => [n.title, n]));
    expect(nodes).toHaveLength(3);
    expect(["a.png", "b.png", "c.png"].map((t) => [byTitle[t]!.x, byTitle[t]!.y])).toEqual([
      [100, 50],
      [100 + CARD_WIDTH + ROW_GAP, 50],
      [100 + 2 * (CARD_WIDTH + ROW_GAP), 50],
    ]);
  });

  it("imports the valid file of a mixed drop and names the rejected one", async () => {
    const { backend, deps } = await setup();

    const { nodes, messages } = await importFiles(
      [file("hero.jpg", "image/jpeg"), file("setup.exe", "application/x-msdownload")],
      { x: 0, y: 0 },
      deps,
    );

    expect(nodes.map((n) => n.title)).toEqual(["hero.jpg"]);
    expect(backend.callsTo("POST /files")).toHaveLength(1);
    expect(messages).toEqual([IMPORT_COPY.unsupported("setup.exe")]);
  });

  it("sends nothing for a file over 25MB or a drop with nothing supported", async () => {
    const { backend, deps } = await setup();

    const big = await importFiles([file("huge.mov", "image/png", MAX_FILE_BYTES + 1)], { x: 0, y: 0 }, deps);
    const none = await importFiles([file("a.exe", "")], { x: 0, y: 0 }, deps);

    expect(big.nodes).toEqual([]);
    expect(big.messages[0]).toContain("huge.mov");
    expect(big.messages[0]).toContain("the limit is 25MB");
    expect(none.messages).toEqual([IMPORT_COPY.noneSupported]);
    expect(backend.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("shows a placeholder with progress while the file is read", async () => {
    const { deps } = await setup();
    const reading = deferred<void>();

    const done = importFiles([file("slow.pdf", "application/pdf", 2048)], { x: 10, y: 20 }, { ...deps, read: () => reading.promise });

    expect(uiStore.getState().pendingImports).toEqual([
      expect.objectContaining({ name: "slow.pdf", sizeBytes: 2048, x: 10, y: 20 }),
    ]);
    reading.resolve();
    await done;
    expect(uiStore.getState().pendingImports).toEqual([]);
  });

  it("names a file it couldn't read, and registers nothing for it", async () => {
    const { backend, deps } = await setup();

    const { nodes, messages } = await importFiles([file("broken.pdf", "application/pdf")], { x: 0, y: 0 }, {
      ...deps,
      read: () => Promise.reject(new Error("NotReadableError")),
    });

    expect(nodes).toEqual([]);
    expect(messages).toEqual([IMPORT_COPY.readFailed("broken.pdf")]);
    expect(backend.callsTo("POST /files")).toHaveLength(0);
    expect(uiStore.getState().pendingImports).toEqual([]);
  });

  it("lets go of the bytes when the API refuses the file", async () => {
    const { deps } = await setup({ ...importRoutes(), "POST /files": () => apiError(503, "forced_failure") });

    const { nodes, messages } = await importFiles([file("a.pdf", "application/pdf")], { x: 0, y: 0 }, deps);

    expect(nodes).toEqual([]);
    expect(messages).toEqual([IMPORT_COPY.saveFailed("a.pdf")]);
    expect(deps.revokeObjectURL).toHaveBeenCalledWith("blob:test/a.pdf");
  });
});
