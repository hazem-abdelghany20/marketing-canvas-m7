# Build Trace, the phone's home screen

Trace answers the app's one question on a phone: why does this piece of content exist? It is a
column of rows, one per layer, from a goal at the top down to what serves it. Each row is swiped
sideways, and swiping a row redraws everything under it.

## Context
- `app/design/mobile-direction.html` — the Trace tab
- `docs/spec.md` § P2 — Trace, § Data model (Edge semantics)
- `docs/state-matrix.md` § P2 — Trace

## Scope
`src/trace/traceModel.ts` (pure), `src/trace/TraceScreen.tsx`, `src/trace/TraceRow.tsx`, the trace path in
`src/ui/uiStore.ts`, its copy in `src/ui/copy.ts`. Tests under `src/trace/__tests__/` and `e2e/phone-trace.spec.ts`.
The empty row only says that nothing serves the card above; its Add button is ticket 028.

## Acceptance
- Given a board with goals, when Trace opens, then its first row lists the goals, and under the goal on screen there is one row for each layer of what serves it (a `serves` edge points from the node that serves to the node it serves).
- Given a row, when it is swiped, its dot is tapped, or Left or Right is pressed on it, then the card on screen changes, and every row beneath is replaced by what serves the new card, starting at its first card.
- Given the card on screen, when it is tapped, then its node detail opens; given a card peeking in at the edge, when it is tapped, then it comes on screen instead.
- Given a goal, when its card renders, then it says how many nodes sit under it at any depth; given any other card, it says how many serve it; and the nodes it is joined to by `relates-to`, and its notes, show as chips.
- Given a node that serves the card above from another layer (content serving a strategy directly), when its row renders, then it is in that row, and every card in a row of mixed types shows its type.
- Given `serves` edges that loop, when Trace is built, then a node never appears twice in one chain.
- Given a card with nothing serving it, when the row below would render, then it says "Nothing serves this yet." — but only under a goal, strategy or campaign, where a next layer is expected.
- Given a board with no goals, when Trace opens, then it says "No goals yet." and how a trace starts.
- Given a reload, when Trace opens, then it opens on the goal and chain that were on screen in this tab; a node deleted since is replaced by the first card in its row.
- Given the model, when it is imported, then it has no React in it: every case above is a plain function over nodes and edges.

## Guardrails
Rows are built from depth, not from type, so a board that does not follow the content → campaign → strategy → goal chain
still shows everything that reaches a goal; the row's label is the shared type, or "Served by" when the row mixes them.
Order within a row is the order the API returns the nodes in, so a swipe never reshuffles. The chosen path is kept in
`sessionStorage` (`mc-trace-path`); `localStorage` is for the session token and the theme alone. Rows are keyed by the card
they hang from, so a new parent starts its rows at the left.

## Verify
`npm run typecheck && npx vitest run src/trace src/ui && npx playwright test e2e/phone-trace.spec.ts`
