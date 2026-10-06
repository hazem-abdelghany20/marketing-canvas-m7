# Build Find: search, and the way into Trace for any node

Find is the phone's search and its index. Choosing a node that reaches a goal lines Trace up on its
chain; choosing one that doesn't opens it. It is also where the gaps show: what no goal reaches.

## Context
- `app/design/mobile-direction.html` — the Find tab
- `docs/spec.md` § P5 — Find, § S3 — O5 Search
- `docs/state-matrix.md` § P5 — Find

## Scope
`src/find/findModel.ts` (pure), `src/find/FindScreen.tsx`, its copy in `src/ui/copy.ts`. Matching is the existing `searchNodes`
and `recentNodes` in `src/components/SearchOverlay.tsx`. Tests under `src/find/__tests__/` and `e2e/phone-find.spec.ts`.

## Acceptance
- Given the Find tab with nothing typed, when it renders, then nodes are grouped by type — goals, strategies, campaigns, content — each with how it connects, and a last group, "Not connected to a goal", with what no chain of `serves` edges reaches a goal from.
- Given a goal in the index, when it is tapped, then Trace opens on that goal; given a node that reaches a goal, then Trace opens with its whole chain lined up; given a node that doesn't, then its detail opens.
- Given text in the field, when it matches, then the groups give way to one list of matches, titles before bodies as in search on a desktop, each with its type and the start of its body.
- Given a type filter, when it is chosen, then only that type is listed, connected or not, and each row says if no goal reaches it.
- Given text that matches nothing, when the list is empty, then it says what matched nothing and offers to make a note with that title.
- Given a board with no nodes, when Find renders, then it says there is nothing to find yet.
- Given Enter in the field, when there is a first result, then it is chosen.
- Given the model, when it is imported, then it has no React in it.

## Guardrails
"Reaches a goal" follows `serves` edges only, and is the same walk Trace uses (`traceModel`), so the two never disagree. A node
appears once in the index: the group "Not connected to a goal" takes it from its type's group. The field is 16px. It
is a screen, not a dialog: no scrim, no focus trap, and the search overlay stays for a keyboard's Cmd/Ctrl+F.

## Verify
`npm run typecheck && npx vitest run src/find src/trace && npx playwright test e2e/phone-find.spec.ts`
