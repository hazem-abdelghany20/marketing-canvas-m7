import { createContext, useContext } from "react";

/**
 * What a card can ask the canvas to do. React Flow renders cards itself, so
 * they reach the router and the store through this instead of through props.
 */
export interface CanvasActions {
  /** Opens the node's detail panel. */
  open: (id: string) => void;
  /** Moves a node by (dx, dy) in board units and stores the new position. */
  nudge: (id: string, dx: number, dy: number) => void;
}

export const CanvasActionsContext = createContext<CanvasActions>({
  open: () => {},
  nudge: () => {},
});

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}
