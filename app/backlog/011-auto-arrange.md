# Auto-arrange the graph into traceability layers

## Context
- `docs/spec.md` § S3 — Behavior/Auto-arrange
- `docs/spec.md` § Data model, edge semantics

## Scope
`src/canvas/autoArrange.ts`, `src/components/Toolbar.tsx` (the arrange control only).

## Acceptance
- Given 12 nodes chained `content → campaign → strategy → goal`, when Auto-arrange runs, then goals render above strategies, strategies above campaigns, and campaigns above content.
- Given nodes with no `serves` edges, when Auto-arrange runs, then they are placed in a row below the connected layers rather than omitted.
- Given any arrangement, when Auto-arrange has run and undo is invoked once, then every node returns to its pre-arrange position.
- Given an arranged board, when a node is dragged, then it stays where it is dropped and nothing re-arranges.
- Given an empty board, when the toolbar renders, then the arrange control is non-interactive with a tooltip explaining why.
- When `prefers-reduced-motion` is set, the arrange transition shall be instant rather than animated.

## Guardrails
Pure function from nodes+edges to positions — no layout dependency, no store access inside it.
Auto-arrange is an action, never a mode: nothing may re-arrange without an explicit invocation.

## Verify
`npx vitest run src/canvas/autoArrange && npx playwright test e2e/auto-arrange.spec.ts`
