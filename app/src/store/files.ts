import type { FileInput, FileRef } from "../types";
import { mutate } from "./mutation";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

export interface FilesSlice {
  files: ById<FileRef>;
  /**
   * Blob URLs for files read in this tab, by file id. Client-only: the API holds
   * metadata, never bytes, so after a reload a file has a record and no URL.
   */
  objectUrls: ById<string>;
  /** Registers metadata only. Not optimistic: the record exists once the API has it. */
  createFile: (input: FileInput) => Promise<FileRef>;
  setObjectUrl: (fileId: string, url: string) => void;
}

export const createFilesSlice: SliceCreator<FilesSlice> = (ctx) => (set, _get, store) => ({
  files: {},
  objectUrls: {},

  createFile: (input) =>
    mutate(store, {
      request: () => ctx.api.files.create(input),
      commit: (s, file) => ({ files: { ...s.files, [file.id]: file } }),
      rollback: () => ({}),
    }),

  setObjectUrl: (fileId, url) => set((s) => ({ objectUrls: { ...s.objectUrls, [fileId]: url } })),
});
