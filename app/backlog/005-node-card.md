# Render typed node cards with selection

## Context
- `docs/spec.md` § Component specs — `NodeCard`, `TypeChip`
- `docs/spec.md` § Data model, type semantics table
- `docs/state-matrix.md` § O4 — Node quick-peek

## Scope
`src/components/NodeCard.tsx`, `src/components/TypeChip.tsx`,
`src/canvas/nodeTypes.ts`, `src/components/QuickPeek.tsx`.

## Acceptance
- Given a node of each of the six types, when rendered, then each shows its type's token color and its type label as text.
- Given a node with a body longer than two lines, when rendered, then the excerpt is clamped to two lines.
- Given a node with files, annotations or edges, when rendered, then a badge shows each non-zero count and no badge renders at zero.
- Given a focused node card, when Enter is pressed, then its detail panel opens.
- Given a focused node card, when an arrow key is pressed, then the node moves 8px in that direction and the new position is stored.
- Given a selected node, when the selection is made, then a quick-peek card renders adjacent to it and flips side rather than leaving the viewport.
- Given the only node on the board, when its quick-peek renders, then "Connect from here" is non-interactive and its tooltip explains why.

## Guardrails
`--node-{type}` tokens only. Type must never be signalled by color alone.
No edge rendering here.

## Verify
`npx vitest run src/components && npx playwright test e2e/node-card.spec.ts`
