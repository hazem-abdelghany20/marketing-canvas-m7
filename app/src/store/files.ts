import type { FileRef } from "../types";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

/** Populated by loadBoard. Mutations arrive with ticket 007. */
export interface FilesSlice {
  files: ById<FileRef>;
}

export const createFilesSlice: SliceCreator<FilesSlice> = () => () => ({
  files: {},
});
