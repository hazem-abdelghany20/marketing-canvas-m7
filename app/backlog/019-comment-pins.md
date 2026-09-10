# Pin comment threads to the board

## Context
- `docs/spec.md` § Actors + jobs — attribution, not collaboration
- `docs/spec.md` § Data model — `Pin`, `Comment`
- `docs/state-matrix.md` § O9 — Comment pins and threads
- `../../api/README.md` § Pins and comments

## Scope
`src/whiteboard/PinLayer.tsx`, `src/whiteboard/Thread.tsx`,
`src/whiteboard/ThreadComposer.tsx`, `src/store/pins.ts`.
Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given the Comment tool, when the canvas is clicked, then a pin is created at that position, its thread opens, and the composer takes focus.
- Given an open thread, when a comment is posted, then it renders attributed to the signed-in user with a timestamp, and the composer clears and keeps focus.
- Given a seeded thread with two authors, when it is opened, then each comment shows its own author's name, and replies are visually nested beneath the first comment.
- Given a composer holding only whitespace, when it renders, then Post is disabled.
- Given a thread with no comments, when it renders, then Resolve is disabled.
- Given a resolved thread, when the board renders, then its pin is visibly muted and still present — resolving is not deleting.
- Given a posting failure, when the error returns, then the comment remains in the thread marked unsent with Retry, and the composer keeps its text.
- Given a thread opened for a pin the API reports as `pin_not_found`, then the thread closes and a toast reads that it was deleted.
- Given a thread panel that would leave the viewport, when it opens, then it flips to the other side of the pin.

## Guardrails
A thread is never fetched separately — comments arrive inlined on `GET /pins`.
Author identity is display-only: never branch behavior on who authored a comment.
Timestamps render relative ("2h") with the absolute value in a `title` attribute.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/store/pins`
