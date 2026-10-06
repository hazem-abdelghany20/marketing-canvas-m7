# Give the phone its own shell: a tab bar with the assistant in the middle

Below 640px the workspace stops being a canvas with panels over it and becomes four screens and
a bar. This ticket builds the bar and the shell around the screens that already exist (the board
and the assistant); Trace and Find arrive in 024 and 027.

## Context
- `app/design/mobile-direction.html` — the layout this milestone builds
- `docs/spec.md` § S3 — Layout, § P1 — Phone shell
- `docs/state-matrix.md` § P1 — Phone shell

## Scope
`src/lib/useMediaQuery.ts` (`PHONE_QUERY`, `usePhone`, `isPhone`), `src/ui/uiStore.ts` (`phoneTab`, and
`openChat` / `revealChat` on a phone), `src/routes/useWorkspace.ts` (the workspace's handlers, moved out of
`Workspace.tsx` unchanged), `src/routes/Workspace.tsx`, `src/phone/PhoneWorkspace.tsx`, `src/phone/TabBar.tsx`,
`src/chat/ChatRail.tsx` (its panel, reused as the Chat screen), `index.html` (viewport).
Tests under `src/phone/__tests__/`, `src/lib/__tests__/`, `src/ui/__tests__/` and `e2e/phone-shell.spec.ts`.

## Acceptance
- Given a window narrower than 640px, when the workspace loads, then a bar offers Trace, Board, Chat, Find and Add, in that order, with Chat in the middle and raised above the rest.
- Given a window 640px or wider, when the workspace loads, then there is no bar, and the layout is the one it was before this ticket.
- Given the bar, when a tab is chosen, then its screen shows, the others are hidden from sight and from assistive technology, and the chosen tab is marked as the current page.
- Given the Board tab is hidden, when another tab is shown, then the canvas stays mounted: the camera, the selection and a file still being read survive the switch.
- Given a phone, when the assistant is asked for from anywhere (From chat, sending the board, an example prompt), then the Chat tab is shown, and the composer takes focus where it was asked to.
- Given a phone, when a node's detail opens (or `/node/:id` is the address), then it shows over the bar, and the tab underneath is left as it was.
- Given the phone shell at 320, 375, 390 and 430px, when it renders, then the page does not scroll sideways and the bar clears the home indicator.

## Guardrails
Nothing at 640px and above changes: the 900px layout (rail as a sheet, labels as icons) is the tablet layout and stays as
it is. The handlers move into `useWorkspace` without being rewritten, in a commit of their own, with the suite green
before and after. The tab is client-only state and is not remembered across a reload. The canvas is hidden with
`visibility` and `inert`, never `display: none`, so React Flow keeps its size and `viewportCenter` stays right.
Hiding any other screen uses the `hidden` attribute on a wrapper that carries no `display` utility (Tailwind's `.flex`
beats `[hidden]`). No new dependency.

## Verify
`npm run typecheck && npx vitest run src/phone src/lib src/ui src/routes src/chat && npx playwright test e2e/phone-shell.spec.ts`
