# Save the marked-up board as a PNG

## Context
- `docs/spec.md` § S3 — Behavior/O7 — Whiteboard dock
- `docs/state-matrix.md` § O7 — Whiteboard dock, Disabled row

## Scope
`src/whiteboard/exportPng.ts`, `src/whiteboard/Dock.tsx` (the save control only).
Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given a board with nodes, edges, ink and marks, when save is used, then a PNG downloads containing all four layers.
- Given the export, when the PNG is produced, then the dock, chat rail, toolbar and any open overlay are absent from it.
- Given a completely empty board, when the dock renders, then save is disabled with the tooltip "Nothing to save yet."
- Given an export in progress, when it runs, then the control shows a pending state and cannot be triggered a second time.
- Given an export failure, when it returns, then a toast reads "Couldn't save the image. Try again." and the control returns to its actionable state.
- Given the current theme, when the PNG is produced, then its background matches the canvas background token of that theme rather than being transparent.

## Guardrails
No new dependencies — the manifest is closed. Rasterise with the platform `canvas` API.
If `foreignObject` proves unreliable for DOM content, draw nodes and marks directly to
the canvas instead of screenshotting the DOM; decide inside this ticket and record the
choice in a comment.
Export at 2x for legibility, and cap the output at 8192px on the long edge.

## Verify
`npm run typecheck && npx vitest run src/whiteboard/__tests__/exportPng`
