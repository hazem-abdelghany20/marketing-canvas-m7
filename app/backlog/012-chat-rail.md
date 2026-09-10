# Build the chat rail with streamed mock responses

## Context
- `docs/spec.md` § S3 — Behavior/Chat rail, response-shape table
- `docs/spec.md` § Component specs — `ChatMessage`
- `docs/state-matrix.md` § O6 — Chat rail

## Scope
`src/chat/ChatRail.tsx`, `src/chat/Composer.tsx`, `src/chat/MessageList.tsx`,
`src/components/ChatMessage.tsx`, `src/mocks/chat.ts`, `src/store/chat.ts`.

## Acceptance
- Given the composer, when a message is sent with Enter, then the user message appears and an assistant message begins streaming.
- Given the composer, when Shift+Enter is pressed, then a newline is inserted and nothing is sent.
- While a response is streaming, the composer and send control shall be non-interactive.
- Given a mocked failure, when the response aborts, then the assistant message shows an error state with a retry action and the user's message is retained.
- Given zero messages, when the rail renders, then it shows three example prompts, and clicking one fills the composer without sending.
- Given the rail, when it is collapsed and the page is reloaded, then it renders collapsed.
- Given a completed assistant message, when it settles, then it is announced once to assistive technology rather than per token.
- Given a viewport narrower than 900px, when the rail is opened, then it renders as an overlay sheet over the canvas rather than a column.

## Guardrails
All responses come from `src/mocks/chat.ts` — no network calls, no model SDK.
No canvas mutation in this ticket.

## Verify
`npx vitest run src/chat && npx playwright test e2e/chat.spec.ts`
