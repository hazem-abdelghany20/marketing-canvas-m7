# Add the chat mode picker and the Reasoner

## Context
- `docs/spec.md` § S3 — Behavior/Chat rail, four-mode response table
- `docs/state-matrix.md` § O6 — Chat rail
- `../../api/README.md` § Chat, the `mode` parameter

## Scope
`src/chat/ModePicker.tsx`, `src/chat/Composer.tsx` (the picker only),
`src/store/chat.ts` (the `mode` parameter only).
Tests under `src/chat/__tests__/`.

## Acceptance
- Given the composer, when the picker renders, then it offers exactly Auto, Generator, Librarian and Reasoner, with Auto selected by default.
- Given Auto, when a message is sent, then no `mode` is sent and the server's chosen mode is shown on the completed response.
- Given a selected mode, when a message is sent, then that mode is sent and the response's `start` event reports it.
- Given a message that would auto-detect as Generator, when Librarian is selected, then the response comes back as Librarian and carries no proposal.
- Given the Reasoner on a board with disconnected nodes, when the response completes, then it names those nodes and highlights them on the canvas through the existing citation path.
- Given the Reasoner on an empty board, when the response completes, then it says the board is empty and cites nothing.
- Given a response is streaming, when the picker renders, then it is disabled until the stream completes.
- Given a selected mode, when the rail is collapsed and reopened, then the selection persists for the session.

## Guardrails
`operator` is not in the picker and must never be sent as `mode` — it is reachable
only through Auto. Sending it returns `422 invalid_mode`.
Reuse ticket 013's citation highlighting; do not add a second highlight path.

## Verify
`npm run typecheck && npx vitest run src/chat`
