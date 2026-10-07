# The phone layout, pixel for pixel

A measured comparison (`design-qa/mobile-vs-mockup.pdf`) found the phone layout follows `design/mobile-direction.html` in
direction but not in detail: 10% of its content pixels and 48% of 294 measured properties match. This ticket closes the gap.

## Context
- `design/mobile-direction.html` — the mockup, at its 340x720 screen
- `backlog/023`–`029` — the phone milestone this corrects

## Decisions (the user's, 2026-10-07)
- **Match the mockup's look; tuck away what it does not show.** Features the mockup lacks (the Text tool, the board's More
  menu, the extra Find filters and groups, Draft in chat) stay, one tap away; nothing is removed.
- **Controls are the size the mockup draws them.** This replaces 029's 40/44px touch-target rule, and its spec.
- **A node opens as the mockup's half-height summary.** Dragging it up, or Edit, opens the full editor.

## Scope
`src/phone/`, `src/trace/`, `src/find/`, the phone variants in `src/whiteboard/`, `src/chat/` and `src/routes/NodeDetail.tsx`.
Tests in `e2e/phone-mockup.spec.ts`. One red/green commit pair per screen: tab bar + Trace, Node, Board, Drawing, Chat,
Find, Add.

## Acceptance
- Given the phone at 340x720 with a phone's safe areas (top 40, bottom 24), when each of the mockup's seven states is shown,
  then every element the spec names is within 1px of where the mockup puts it, at the mockup's size, weight and colour.
- Given the desktop and the 640–899px layout, when used, then nothing about them changes.

## Verify
`npm run typecheck && npx vitest run && npx playwright test`, and the comparison PDF rebuilt.
