import type { Stroke } from "../types";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

/** Populated by loadBoard. Mutations arrive with ticket 017. */
export interface StrokesSlice {
  strokes: ById<Stroke>;
}

export const createStrokesSlice: SliceCreator<StrokesSlice> = () => () => ({
  strokes: {},
});
