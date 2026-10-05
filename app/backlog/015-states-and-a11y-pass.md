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

## Decisions made while building it
- **No axe scan.** `docs/spec.md`'s dependency manifest does not list one and this ticket forbids new dependencies, so the
  scan is replaced by checks that need none: WCAG contrast ratios computed from `tokens.css`
  (`src/styles/__tests__/tokens.test.ts`), a structural check for names, `lang`, title, ids and aria references on every
  screen (`e2e/a11y.spec.ts`, which also proves it can fail), a Tab walk asserting a visible focus ring on every stop, and
  layout checks at 320–1280px. Adding axe itself needs the manifest changed first.
- **"Corrupt stored board"** predates the API: nothing is stored in the browser. The equivalent is a board response that
  can't be read (`unexpected_response`), which now has its own copy, distinct from the offline wording, and a Reload.
  There is no "start new" action: the API has no endpoint that empties a board, and deleting every node would be a feature.
- **Not built, and not this ticket's to build:** the Legend (spec § S3 and the Empty row mention it; no ticket owns it), the
  150ms entrance of a new node and the 200ms draw of a new edge (animations, not states), and the connect kind picker's
  disabled `serves` option (ticket 008 refuses an already-connected pair before the picker opens, so it can never be shown).

- **Small calls that change a 001–014 detail, each for a reason:** editing a field on the auth screens now also clears a
  form-level error (it lingered above fresh edits); the sign-up Retry keeps the passwords unless the address is taken
  (clearing them left Retry with nothing to send); a keyboard can now select a card with Space and pick one in connect
  mode with Enter (the critical path could not be finished without a pointer); the toolbar wraps, and connect mode's
  banner sits under it, instead of both running off a narrow canvas.
- **Known limit:** with the detail panel open and the window between about 900 and 1000px wide, the rail and the panel
  leave the toolbar under 200px, so it wraps tightly rather than fits. Below 900px the panel is a full-screen sheet, and
  from about 1160px it fits on one row.

## Guardrails
No new dependencies. No feature work — states and accessibility only.
Do not alter behavior specified in tickets 001–014 beyond adding the missing state branches.

## Verify
`npm run typecheck && npx vitest run && npx playwright test`
