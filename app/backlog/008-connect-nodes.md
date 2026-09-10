# Connect nodes with typed, bidirectional edges

## Context
- `docs/spec.md` § S3 — Behavior/O3
- `docs/spec.md` § Data model, bidirectional display rule
- `docs/spec.md` § Component specs — `EdgeLine`
- `docs/state-matrix.md` § O3 — Connect mode

## Scope
`src/canvas/ConnectMode.tsx`, `src/components/EdgeLine.tsx`,
`src/components/EdgeKindPicker.tsx`, `src/store/edges.ts`.

## Acceptance
- Given two nodes, when a `serves` edge is created from A to B, then A's detail panel lists B under Serves and B's lists A under Served by, from one stored edge.
- Given a `serves` edge, when rendered, then it draws an arrowhead pointing at the target; a `relates-to` edge renders dashed with no arrowhead.
- Given a connect-mode source, when the same node is clicked as target, then no edge is created and a message explains a node cannot connect to itself.
- Given an existing connection between two nodes, when the same pair is connected again, then no edge is created and a message states they are already connected.
- Given connect mode with a source picked, when Escape is pressed, then the mode exits and no edge is created.
- Given a board with one node, when connect mode is entered, then the mode does not activate and a message states connections need two nodes.

## Guardrails
One stored edge per connection — never write a mirrored duplicate.
`--edge-serves` and `--edge-relates` tokens only.

## Verify
`npx vitest run src/store/edges src/components && npx playwright test e2e/connect.spec.ts`
