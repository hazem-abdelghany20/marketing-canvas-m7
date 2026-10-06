# Add from the bar, add what serves, and open a node as a sheet

Three ways to put something on the board from a phone: the Add tab (a node of the type you pick), an
empty Trace row (a node that serves the card above), and the node's own sheet, now a bottom sheet
that goes back to the board or the assistant.

## Context
- `app/design/mobile-direction.html` — the Add sheet and the node sheet
- `docs/spec.md` § P6 — Add and node sheets, § S4 — Node detail
- `docs/state-matrix.md` § P6 — Add and node sheets

## Scope
`src/phone/AddSheet.tsx`, `src/canvas/actions.ts` (`createNodeAt`, `addServing`), `src/trace/TraceRow.tsx` (the empty row's button),
`src/routes/NodeDetail.tsx` (the sheet on a phone), `src/routes/useWorkspace.ts`. Tests under `src/phone/__tests__/`,
`src/canvas/__tests__/` and `src/routes/__tests__/`, and `e2e/phone-add.spec.ts`.

## Acceptance
- Given the Add tab, when it is used, then a sheet offers Goal, Strategy, Campaign, Content and Note, Import a file, and Draft in chat; a type creates a node of that type in the middle of the board and opens it with its title focused.
- Given the sheet, when Escape, the scrim or Close is used, then it closes and creates nothing, and focus goes back to the Add tab.
- Given an empty row in Trace, when "Add a strategy" (or campaign, or content) is used, then a node of that type is created, connected so that it serves the card above, brought on screen in its row, and opened to be named.
- Given that, when Undo is used once, then both the node and its connection go.
- Given the node was made but its connection failed, when the failure returns, then the node stays and the toast offers to try the connection again.
- Given a node's detail on a phone, when it opens, then it is a sheet from the bottom: rounded at the top, with a grab handle and a scrim, never taller than 92% of the screen; dragging the handle down, Escape, the scrim, Close and the browser's Back all close it.
- Given the sheet, when "Show on board" is used, then the Board tab is shown with that node selected and in view.
- Given the sheet, when "Ask about it" is used, then the Chat tab is shown with a question about that node in the composer, not yet sent.
- Given connect mode begins from the sheet's Connect button, when it starts, then the sheet closes and the Board tab is shown.

## Guardrails
A node made by the Add tab is not connected: it shows in Find under "Not connected to a goal" until it is, which is the point of
that group. Making a node and connecting it are two requests, undone as one step (the two history entries are replaced by one
that deletes the node, which the API cascades to its edge). The sheet reuses `NodeDetail`'s panels; nothing about editing changes.
Fields in the sheet are 16px on a phone.

## Verify
`npm run typecheck && npx vitest run src/phone src/canvas src/routes && npx playwright test e2e/phone-add.spec.ts e2e/node-detail.spec.ts`
