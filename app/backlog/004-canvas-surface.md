# Build the canvas surface: pan, zoom, viewport persistence

## Context
- `docs/spec.md` § S3 — Workspace, Layout and Behavior/Canvas
- `docs/state-matrix.md` § S3, Loading and Disabled rows

## Scope
`src/canvas/Canvas.tsx`, `src/canvas/useViewport.ts`, `src/routes/Workspace.tsx`.

## Acceptance
- Given the canvas, when empty space is dragged, then the viewport pans and no node is created.
- Given a scroll or pinch gesture, when zoom would exceed 2x or fall below 0.25x, then it clamps at the bound.
- Given a viewport change, when 300ms pass without further change, then x, y and zoom are written to the store.
- Given a stored viewport, when the workspace loads, then the canvas restores that x, y and zoom.
- While the board is hydrating, the canvas shall render a dimmed grid with a loading indicator and shall not shift layout when data arrives.

## Guardrails
`@xyflow/react` for the canvas primitive; no other canvas library.
No node or edge rendering in this ticket.

## Verify
`npx vitest run src/canvas && npx playwright test e2e/canvas-viewport.spec.ts`
