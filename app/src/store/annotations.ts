import type { Annotation } from "../types";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

/** Populated by loadBoard. Mutations arrive with ticket 009. */
export interface AnnotationsSlice {
  annotations: ById<Annotation>;
}

export const createAnnotationsSlice: SliceCreator<AnnotationsSlice> = () => () => ({
  annotations: {},
});
