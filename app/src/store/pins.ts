import type { Pin } from "../types";
import type { ById } from "./records";
import type { SliceCreator } from "./state";

/** Populated by loadBoard. Mutations arrive with ticket 019. */
export interface PinsSlice {
  pins: ById<Pin>;
}

export const createPinsSlice: SliceCreator<PinsSlice> = () => () => ({
  pins: {},
});
