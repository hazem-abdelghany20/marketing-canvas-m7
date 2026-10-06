# The phone pass: sizes, touch targets, motion, and the docs

The last ticket in the milestone. No features: it holds the phone layout to the same bar the desktop
one was held to in 015.

## Context
- `docs/spec.md` § P1–P6, § Design tokens
- `docs/state-matrix.md` § P1–P6
- `backlog/015-states-and-a11y-pass.md`

## Scope
Whatever 023–028 left uneven: spacing, truncation, tap sizes, motion, focus and the safe areas, across `src/phone/`, `src/trace/`,
`src/find/` and the phone variants in `src/whiteboard/`, `src/chat/` and `src/routes/NodeDetail.tsx`. `docs/spec.md`,
`docs/state-matrix.md` and `backlog/ROADMAP.md`. Tests in `e2e/phone-a11y.spec.ts`.

## Acceptance
- Given the phone shell at 320, 360, 375, 390 and 430px, when each tab is shown, then the page does not scroll sideways and nothing is clipped off an edge.
- Given any control on the tab bar, the dock, the top bar, a Trace card, a Find row or a sheet's buttons, when measured, then it is at least 40px in each direction, and the tab bar's at least 44px.
- Given any text field on a phone, when focused, then its font is at least 16px.
- Given `prefers-reduced-motion`, when a row, a tab or a sheet changes, then nothing animates and a programmatic scroll is instant.
- Given a keyboard, when Tab is pressed through each tab's screen, then every control is reached in reading order with a visible focus ring, and nothing hidden is reachable.
- Given the light and the dark theme, when each screen renders, then every text colour meets 4.5:1 on its surface (the token test already holds the pairs).
- Given the docs, when read, then each phone screen has a section in `docs/spec.md` and a state table in `docs/state-matrix.md`, and the roadmap lists 023–029.

## Guardrails
No new dependency; axe is still an open question (ask before adding it). Fixes go where the problem is, not in a stylesheet
of overrides at the end. Anything found that is not a phone problem is reported, not fixed.

## Verify
`npm run typecheck && npx vitest run && npx playwright test`
