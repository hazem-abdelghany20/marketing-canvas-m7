# Send the marked-up board to the assistant

The last ticket in the milestone. Everything else ships first.

## Context
- `docs/spec.md` § S3 — Behavior/O7 — Whiteboard dock
- `docs/state-matrix.md` § O6 — Chat rail, § O7 — Whiteboard dock
- `../../api/README.md` § Chat

## Scope
`src/whiteboard/sendBoardToChat.ts`, `src/whiteboard/Dock.tsx` (the send control
only), `src/store/chat.ts` (the board payload only), plus the mocked read in
`api/server.js`. Tests under `src/whiteboard/__tests__/` and `api/test/`.

## Acceptance
- Given a board with ink and marks, when send is used, then a chat message is created carrying the rasterised board, and the assistant's reply references specific sticky text and at least one node the ink is drawn near.
- Given a reply about the board, when it completes, then the nodes it names are cited and highlighted on the canvas.
- Given a response is already streaming, when the dock renders, then send is disabled with the tooltip "Wait for the current reply to finish."
- Given a board with no ink and no marks, when the dock renders, then send is disabled with the tooltip "Draw or add a note first."
- Given the send fails, when the error returns, then the user's message is retained, the assistant bubble shows the error state with Retry, and the composer is re-enabled.

## Guardrails
The mock must be specific to be worth shipping: a reply that gestures vaguely at
"your annotations" is a failure of this ticket. It reads the real strokes, marks
and pins on the board and names actual content from them.
Reuse ticket 020's rasteriser — do not write a second one.
Reuse the existing SSE stream shape; no new event types.

## Verify
`npm run typecheck && npx vitest run src/whiteboard && cd api && npm test`
