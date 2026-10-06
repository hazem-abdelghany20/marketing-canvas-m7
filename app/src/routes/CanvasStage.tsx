import { Canvas } from "../canvas/Canvas";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FileDropZone } from "../components/FileDropZone";
import { appStore } from "../store";
import { COPY } from "../ui/copy";
import type { WorkspaceController } from "./useWorkspace";

/** The spinner shown while the board loads. */
export function BoardLoading() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <span
        role="status"
        aria-label="Loading your board"
        className="grid size-6 animate-spin place-items-center rounded-full border-2 border-subtle border-t-accent [animation-duration:0.7s]"
      >
        <span className="sr-only">Loading your board</span>
      </span>
    </div>
  );
}

/** The board did not load, or came back unreadable: say so, and offer to try again. */
export function BoardFailed({ unreadable }: { unreadable: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <ErrorState
        message={unreadable ? COPY.boardUnreadable : COPY.boardLoadFailed}
        actionLabel="Reload"
        onAction={() => void appStore.getState().loadBoard()}
      />
    </div>
  );
}

/**
 * The canvas, and what stands in for it while there is no board to draw: the dimmed grid with a spinner,
 * the failure, or the empty board's first step. One container for every state, so nothing shifts when the
 * data lands. Inside the drop zone, so a file dropped on any of it still lands.
 */
export function CanvasStage({ w }: { w: WorkspaceController }) {
  const { ready, state, boardError, nodeCount, pendingCount, connecting, initialViewport, onViewportChange } = w;

  return (
    <FileDropZone enabled={ready && !connecting} onFiles={w.onDropFiles}>
      {ready ? (
        <Canvas initialViewport={initialViewport!} onViewportChange={onViewportChange} />
      ) : (
        // The same dots as the canvas (GRID_GAP apart), dimmed while the board loads.
        <div
          data-grid
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(var(--grid-dot)_1.2px,transparent_1.2px)] bg-[length:26px_26px] opacity-50"
        />
      )}

      {state === "loading" ? <BoardLoading /> : null}
      {state === "error" ? <BoardFailed unreadable={boardError?.code === "unexpected_response"} /> : null}

      {ready && nodeCount === 0 && pendingCount === 0 ? (
        // The backdrop lets canvas gestures through; only the card itself takes clicks.
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <EmptyState
            title="Nothing on the canvas yet."
            body="Six kinds of node live here: goal, strategy, campaign, content, asset and note."
            action={
              <Button variant="primary" className="mt-2 px-4 py-2 text-[13.5px]" onClick={w.openAddMenu}>
                Add your first node
              </Button>
            }
          />
        </div>
      ) : null}
    </FileDropZone>
  );
}
