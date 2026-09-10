# Drop, edit and persist stickies and board text

## Context
- `docs/spec.md` § Data model — `Mark`, one entity two variants
- `docs/state-matrix.md` § O8 — Marks
- `../../api/README.md` § Marks

## Scope
`src/whiteboard/MarkLayer.tsx`, `src/whiteboard/MarkCard.tsx`,
`src/store/marks.ts`. Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given the Sticky tool, when the canvas is clicked, then a sticky is created at that board position and its textarea takes focus without a second click.
- Given the Text tool, when the canvas is clicked, then a text mark is created at that position, rendering with no card behind it.
- Given a mark with an empty body, when it loses focus, then it is discarded locally and no request is sent.
- Given a mark with text, when it loses focus, then the change is saved and the pending indicator clears with no toast.
- Given a mark being dragged, when the drag ends, then one `PATCH /marks/:id` carries the final position — not one request per pointer move.
- Given a save that fails, when the error returns, then the text stays on screen intact and a retry affordance appears on the mark itself.
- Given a reload, when the board loads, then every mark renders at its stored position with its stored variant and colour.

## Guardrails
Sticky and Text are one component with a variant prop — do not fork them into two.
Marks live above ink and below node cards.
Drag writes are debounced; typing writes only on blur.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/store/marks`
