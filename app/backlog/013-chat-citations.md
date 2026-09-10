# Highlight cited nodes from chat answers

## Context
- `docs/spec.md` § S3 — Behavior/Chat rail, librarian row
- `docs/spec.md` § Component specs — `NodeCard` (cited-by-chat state), `ChatMessage`

## Scope
`src/components/ChatMessage.tsx` (citation chips), `src/canvas/useCitationHighlight.ts`,
`src/components/NodeCard.tsx` (cited state only).

## Acceptance
- Given an assistant response carrying cited node ids, when it completes, then those nodes render visually distinct from unselected nodes on the canvas.
- Given highlighted nodes, when a different node is selected, then the citation highlight clears.
- Given a citation chip, when it is clicked, then the canvas pans to that node and selects it.
- Given a citation chip, when it is reached by keyboard, then its accessible name is the cited node's title.
- Given a response citing a node that no longer exists, when it renders, then that chip is omitted and the remaining chips still render.

## Guardrails
Do not change the mock responses or store shape from ticket 012.
The cited state must be distinguishable without relying on color alone.

## Verify
`npx vitest run src/canvas/useCitationHighlight && npx playwright test e2e/chat-citations.spec.ts`
