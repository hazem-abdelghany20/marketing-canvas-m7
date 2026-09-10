# Complete the state matrix and the keyboard/a11y pass

## Context
- `docs/state-matrix.md` — every row, every cell
- `docs/spec.md` § Global rules
- `docs/spec.md` § Component specs — `Toast`

## Scope
`src/components/Toast.tsx`, `src/components/EmptyState.tsx`,
`src/components/ErrorState.tsx`, plus the loading/empty/error branches of existing
screens. No new features, no store changes.

## Acceptance
- Given each screen and overlay in the state matrix, when its loading, empty and error branches are triggered, then each renders the behavior the matrix specifies.
- Given a delete of a node, an edge, an annotation or a file, when it completes, then it is either confirmed beforehand or reversible from a toast.
- Given a corrupt stored board, when the workspace loads, then it shows the corrupt-data state with reload and start-new actions, and its copy differs from the quota-exceeded copy.
- Given a keyboard alone, when every screen is traversed, then every action listed in the spec is reachable and every focused element shows a visible focus ring.
- Given an axe scan of each screen, when it runs, then zero serious or critical violations are reported.
- When `prefers-reduced-motion` is set, all pan, zoom and arrange transitions shall be instant.

## Guardrails
No new dependencies. No feature work — states and accessibility only.
Do not alter behavior specified in tickets 001–014 beyond adding the missing state branches.

## Verify
`npm run typecheck && npx vitest run && npx playwright test`
