# Add nodes from the toolbar menu

## Context
- `docs/spec.md` § S3 — Behavior/O1
- `docs/state-matrix.md` § O1 — Add-node menu
- `../../api/README.md` § Nodes

## Scope
`src/components/Toolbar.tsx`, `src/components/AddNodeMenu.tsx`,
`src/store/nodes.ts` (create action only).

## Acceptance
- Given an empty board, when the first-run affordance is activated, then the add-node menu opens.
- Given the add-node menu, when "Note" is chosen, then an untitled note node is created at viewport center and its detail panel opens with the title focused.
- Given an existing node at viewport center, when a new node is created, then it is offset so the two do not exactly overlap.
- Given the open menu, when Escape is pressed, then the menu closes and no node is created.
- While a chat response is streaming, the "From chat" option shall be non-interactive with a tooltip explaining why.
- When `POST /nodes` returns a non-2xx, the menu shall close, a message shall ask the user to check their connection and offer Retry, and no partial node shall remain on the canvas.

## Guardrails
`Toolbar.tsx`, `AddNodeMenu.tsx` and the create action only.
Type selection happens in the detail panel, not at creation.

## Verify
`npx vitest run src/components && npx playwright test e2e/add-node.spec.ts`
