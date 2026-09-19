import type { Mark } from "../types";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

/** Populated by loadBoard. Mutations arrive with ticket 018. */
export interface MarksSlice {
  marks: ById<Mark>;
}

export const createMarksSlice: SliceCreator<MarksSlice> = () => () => ({
  marks: {},
});
