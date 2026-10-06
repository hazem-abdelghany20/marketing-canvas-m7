# Fit the assistant to a phone: a strip of the board above the conversation

On the Chat tab the conversation fills the screen, with a live strip of the board above it. When a
reply cites nodes, the strip shows them and what they connect to; one tap takes you to the board.

## Context
- `app/design/mobile-direction.html` — the Chat tab
- `docs/spec.md` § P4 — Chat on a phone, § S3 — O6 Chat rail
- `docs/state-matrix.md` § P4 — Chat on a phone

## Scope
`src/chat/ChatRail.tsx` (the panel on the Chat screen), `src/chat/Composer.tsx` (a compact form), `src/chat/MessageList.tsx` (what a
citation chip does on a phone), `src/phone/BoardStrip.tsx`, `src/phone/stripLayout.ts` (pure). Tests under `src/phone/__tests__/` and
`src/chat/__tests__/`, and `e2e/phone-chat.spec.ts`.

## Acceptance
- Given the Chat tab, when it renders, then it shows the heading "Assistant", the strip, the reply modes, the conversation, and a composer with a button that sends the board, a field and Send.
- Given a finished reply that cites nodes, when the strip renders, then it shows those nodes and the nodes they are connected to, the cited ones marked, and says how many were cited.
- Given a reply that cites nothing, when the strip renders, then it shows the whole board as an outline, without titles; given an empty board, it says so.
- Given a cited node in the strip, when it is tapped, then its node detail opens; given Open board, then the Board tab is shown with the cited nodes in view.
- Given a citation chip in a reply, when it is tapped on a phone, then the Board tab is shown with that node selected and in view.
- Given the composer on a phone, when text is typed, then the field is 16px so the browser does not zoom, grows to four lines, and Enter adds a new line: Send is how a message goes.
- Given the board button, when it is used, then it sends the board under the dock's rules, and the Chat tab shows the reply streaming.
- Given the on-screen keyboard is open, when the Chat tab is shown, then the composer is still on screen.

## Guardrails
The strip draws from the stores, as the PNG export does, and is not a second React Flow. Positions are scaled and sizes are not, so
a title in the strip stays legible; where nodes land on top of each other in the strip, that is accepted. Everything the
rail did stays: Retry, proposals, example prompts, modes, the announcement of a finished reply. The mode picker is the same component.
Enter sends on every screen that has a keyboard, and adds a line on a phone, where Shift+Enter is out of reach.

## Verify
`npm run typecheck && npx vitest run src/phone src/chat && npx playwright test e2e/phone-chat.spec.ts e2e/chat.spec.ts`
