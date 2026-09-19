# Build the node detail panel

## Context
- `docs/spec.md` § S4 — Node detail
- `docs/state-matrix.md` § S4 — Node detail

## Scope
`src/routes/NodeDetail.tsx`, `src/components/detail/` (TitleField, BodyEditor,
FileList, ConnectionList, AnnotationList), `src/store/annotations.ts`.

## Acceptance
- Given an open node, when the title is edited and focus leaves the field, then the canvas card shows the new title without a reload.
- Given an open node, when its type is changed, then the node card and every edge attached to it render the new type's color.
- Given a node with incoming and outgoing `serves` edges, when its panel opens, then outgoing edges appear under Serves and incoming under Served by.
- Given an open panel, when a connection row is clicked, then the canvas pans to that node and the panel still shows the originally opened node.
- Given a whitespace-only annotation, when it is submitted, then no annotation is created.
- Given `/node/:id` for a deleted id, when it loads, then the panel states the node does not exist and offers a return to the canvas, with copy distinct from any save-failure message.
- Given a node with no connections, when its panel opens, then the connections section shows its empty state and a connect action.
- While an autosave is in flight, the type picker shall be non-interactive and typing shall remain possible.

## Guardrails
Panel over the canvas — do not unmount the canvas on open.
Do not modify edge creation from ticket 008.

## Verify
`npx vitest run src/routes/__tests__/NodeDetail src/auth && npx playwright test e2e/node-detail.spec.ts`
