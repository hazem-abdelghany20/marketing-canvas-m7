# Build the whiteboard dock and its tool state machine

## Context
- `docs/spec.md` § S3 — Behavior/O7 — Whiteboard dock
- `docs/state-matrix.md` § O7 — Whiteboard dock

## Scope
`src/whiteboard/toolMode.ts` (the reducer), `src/whiteboard/Dock.tsx`,
`src/whiteboard/ToolHint.tsx`, `src/whiteboard/useToolShortcuts.ts`.
Tests under `src/whiteboard/__tests__/`. No tool does anything yet — this is the
mode machine and its keyboard surface only.

## Acceptance
- Given the dock, when `V`, `P`, `H`, `E`, `S`, `T` or `C` is pressed outside a text field, then the matching tool becomes active and is visibly selected.
- Given a shortcut key pressed while focus is inside an input or textarea, then the tool does not change and the character is typed.
- Given any tool other than Select, when Escape is pressed, then the mode returns to Select.
- Given any tool other than Select, when it activates, then the tool-hint pill names it and offers Esc.
- Given Select is active, when the hint would render, then no pill is shown — Select is the resting state, not a mode to escape.
- Given the board request is still in flight, when the dock renders, then every tool is disabled with the tooltip "Waiting for the board."
- Given connect mode is active, when the dock renders, then Pen, Highlighter and Eraser are disabled with the tooltip "Finish connecting first."
- Given no ink on the board, when the dock renders, then Eraser is disabled and clear-ink is absent rather than disabled.

## Guardrails
The reducer is pure and has no React imports — every transition is unit-testable
without a DOM. Tool state is client-only and is never sent to the API.
Icons come from `lucide-react`; no inline SVG paths.

## Verify
`npm run typecheck && npx vitest run src/whiteboard`
