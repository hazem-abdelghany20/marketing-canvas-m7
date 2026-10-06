# Fit the whiteboard to a phone: a dock above the bar, and two fingers for the camera

On the Board tab the canvas fills the screen. The dock becomes a bar of tools above the tab bar,
the ink options a bar above that, and everything that lived in the desktop toolbar finds a place
that a thumb can reach.

## Context
- `app/design/mobile-direction.html` — the Board tab and its drawing state
- `docs/spec.md` § P3 — Board on a phone, § S3 — O7 Whiteboard dock
- `docs/state-matrix.md` § P3 — Board on a phone

## Scope
`src/whiteboard/Dock.tsx` and `src/whiteboard/InkOptions.tsx` (a `bar` layout), `src/whiteboard/ToolHint.tsx` (touch
wording), `src/whiteboard/useBoardActions.ts` (what the dock's Send and Save already decide, as hooks), `src/whiteboard/useCameraGesture.ts`
(two fingers over a tool surface), `src/phone/BoardBar.tsx` (the top bar and its menu), `src/components/Toast.tsx` (where toasts sit),
`src/components/AddNodeMenu.tsx` (the menu's keys, shared). Tests under `src/whiteboard/__tests__/` and `src/phone/__tests__/`,
and `e2e/phone-board.spec.ts`.

## Acceptance
- Given the Board tab, when it renders, then the seven tools sit in one bar above the tab bar, each at least 40px across, with the same states and reasons as on a desktop.
- Given the Pen or the Highlighter in hand, when the bar shows, then the colours and widths sit in a bar above it, and the hint reads "One finger draws · two fingers pan and zoom".
- Given a tool that draws or places is in hand, when a second finger touches down, then the stroke in progress is thrown away and nothing is saved, and the two fingers pan and zoom the board until every finger lifts; a finger left down afterwards draws nothing.
- Given the top bar, when it renders, then it shows the board's name, Undo, a More menu, and "Ask about this", which sends the board to the assistant under the dock's rules ("Draw or add a note first.", "Wait for the current reply to finish.").
- Given the More menu, when it opens, then it offers Connect, Auto-arrange, Fit to screen and Save as PNG, and Clear ink only while there is ink, each with the reason it can't be used when it can't.
- Given connect mode, when it starts anywhere on a phone, then the Board tab is shown and the banner sits under the top bar.
- Given a toast, when it shows on the Board tab, then it is above the dock, and on any other tab it is above the tab bar.
- Given the camera the board was last left in (by a wider screen: it is the board's, not the device's), when the Board is shown for the first time and fewer than half the cards are centred on screen, then the camera is brought back to all of them; otherwise it is left where it is.

## Guardrails
The tool reducer in `toolMode.ts` is untouched: this ticket changes where the tools are and how fingers reach the camera, not
what a tool is. The dock keeps `role="group"` and every `aria-label` (many specs find tools by them). Send and Save keep one
implementation, in `useBoardActions`, used by the dock, the menu and the top bar. The camera gesture computes the pan and zoom
in a pure function (the board point under the fingers' midpoint stays under it) and is clamped to the canvas's own zoom range.
Bringing the camera back moves it, and a moved camera is saved to the board like any other: the next screen to open it finds it there.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/phone src/components && npx playwright test e2e/phone-board.spec.ts e2e/whiteboard-dock.spec.ts`
