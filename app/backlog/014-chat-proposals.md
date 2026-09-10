# Apply chat proposals to the canvas

## Context
- `docs/spec.md` § S3 — Behavior/Chat rail, generator and operator rows
- `docs/spec.md` § Data model — `Proposal`
- `docs/state-matrix.md` § O6, Error and Disabled rows

## Scope
`src/components/ChatMessage.tsx` (proposal action), `src/chat/applyProposal.ts`.

## Acceptance
- Given a response carrying a `create-node` proposal, when the add action is used, then a node with the proposed type and title is created and is inside the visible viewport.
- Given a response carrying a `create-edge` proposal, when the add action is used, then the edge is created and appears on both endpoints' detail panels.
- Given an applied proposal, when it settles, then its action becomes a non-interactive applied state and cannot create a second node.
- Given an applied proposal, when undo is invoked, then the created node or edge is removed and the action returns to its actionable state.
- Given a `create-edge` proposal referencing a node that no longer exists, when the add action is used, then no edge is created and a message states which node is missing.
- When applying a proposal fails on write, a message shall state the board is out of storage and the action shall remain usable.

## Guardrails
Reuse the store actions from tickets 006 and 008 — no parallel creation path.

## Verify
`npx vitest run src/chat/applyProposal && npx playwright test e2e/chat-proposals.spec.ts`
