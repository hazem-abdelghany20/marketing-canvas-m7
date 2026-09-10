# Build the store and local persistence layer

## Context
- `docs/spec.md` § Data model
- `docs/state-matrix.md` § S3 — Workspace (shell), Error row

## Scope
`src/store/` (slices for board, nodes, edges, annotations, files, chat, session),
`src/store/persistence.ts`, `src/types.ts`. Tests under `src/store/__tests__/`.

## Acceptance
- Given a mutation to any slice, when it settles, then the serialized board in local storage reflects it.
- Given a stored board, when the store initializes, then nodes, edges, annotations and viewport are restored.
- Given unparseable stored data, when the store initializes, then it reports a corrupt-data error rather than throwing.
- When a write exceeds the storage quota, the store shall surface a quota error and shall leave in-memory state unchanged.
- Given any mutation, when undo is invoked, then the prior state is restored, and the history holds at least 50 entries.

## Guardrails
The persistence interface is async so a real API can replace it — see `[SEAM]` in the spec.
No React imports in this layer. No UI.

## Verify
`npm run typecheck && npx vitest run src/store`
