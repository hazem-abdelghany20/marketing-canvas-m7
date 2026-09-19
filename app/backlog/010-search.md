# Search and jump to a node

## Context
- `docs/spec.md` § S3 — Behavior/O5
- `docs/state-matrix.md` § O5 — Search / jump-to-node

## Scope
`src/components/SearchOverlay.tsx`, `src/canvas/panToNode.ts`.

## Acceptance
- Given the workspace, when Cmd/Ctrl+F is pressed, then the search overlay opens with its input focused.
- Given a query matching a node title or body in any case, when typed, then that node appears in the results without a submit action.
- Given results, when the down arrow then Enter are pressed, then the canvas pans and zooms to the highlighted node and selects it.
- Given a query matching nothing, when typed, then the results area states no nodes match and offers to create a note with that title, and Enter performs no navigation.
- Given an empty query, when the overlay opens, then the five most recently updated nodes are listed under a Recent heading.
- Given a board with zero nodes, when the search control is rendered, then it is non-interactive with a tooltip explaining why.
- When `prefers-reduced-motion` is set, panning to a node shall be instant.

## Guardrails
Local in-memory filter only — no index library, no fuzzy-search dependency.

## Verify
`npx vitest run src/components/__tests__/SearchOverlay && npx playwright test e2e/search.spec.ts`
