# Roadmap — what is built, what is next

Tickets 001–015 are done (005–010 live on `005-010-node-card-to-search`, 011–015 on
`011-015-arrange-chat-states`), and 016–022 on `016-022-whiteboard-layer`.
Each ticket below has its own file in this folder; this page is the map.

## Layout — 011
- **011 Auto-arrange:** a toolbar button that lays the graph out in layers: goals on
  top, then strategies, campaigns, content and assets. Nodes with no `serves` edge go in a
  row underneath. One undo restores every position. Nothing re-arranges on its own.

## Chat assistant — 012–014
- **012 Chat rail:** left panel with a composer, streamed mock replies, Shift+Enter for a
  newline, Retry on a failed reply, collapse that persists, an overlay sheet below 900px.
  The "From chat" item in the Add menu (ticket 006) starts working here.
- **013 Citations:** cited nodes highlight on the canvas; chips pan to them.
- **014 Proposals:** "Add to canvas" on replies that propose a node or connection. Applied
  once, undoable, and clear about a missing node.

## Polish — 015
- **015 States and accessibility:** every loading/empty/error state from the state matrix, a
  keyboard-only pass, an axe scan. No features. Do it after the others in this batch.

## Whiteboard layer — 016–022 (built, on `016-022-whiteboard-layer`)
- **016** dock + tool shortcuts · **017** ink · **018** stickies and text · **019** comment
  pins · **020** save PNG · **021** chat modes + Reasoner · **022** send board to assistant.

Order: 012 before 013, 014 and 021. 011 is independent. 015 comes last of 011–015.

---

## Prompt for tickets 011–015

Copy everything in the block below into a new session on the repo.

```text
Build tickets 011 to 015 in /Users/hazzouma/Documents/kaufmann/Hazem's code/marketing-canvas-m7/app.
Read app/backlog/ROADMAP.md first, then each ticket file (011-auto-arrange.md,
012-chat-rail.md, 013-chat-citations.md, 014-chat-proposals.md,
015-states-and-a11y-pass.md), docs/spec.md, docs/state-matrix.md and api/README.md.

Branch: create ONE branch, 011-015-arrange-chat-states, off 005-010-node-card-to-search.
Push it, and do not fast-forward master until I have tested.

Order: 011, 012, 013, 014, then 015 last. For each ticket make two commits, red then green:
  test(<area>): specify ... (red)   — failing tests only
  feat(<area>): ...         (green) — the implementation
Commit messages end with the Co-Authored-By trailer from your attribution instructions.

Conventions already in the code — follow them, do not reinvent:
- Server data lives in src/store (a cache over the API; mutate() reconciles; undo via
  record()). Client-only state (selection, toasts, overlays) lives in src/ui/uiStore.ts.
  Never use localStorage except for the session token and the theme.
- Chat is not persisted by the API. The store already has chatMessages and chatStreaming
  (src/store/chat.ts) and the API client has api.chat.stream() with an SSE reader.
- Buttons use src/components/Button.tsx; a disabled control passes disabledReason so the
  tooltip stays readable. Copy goes in src/ui/copy.ts. Colours come only from the tokens.
- Pans use src/canvas/panToNode.ts (instant under prefers-reduced-motion). The panel width
  constant is PANEL_WIDTH in components/detail/ConnectionList.tsx.
- Cards are 236x140 (CARD_WIDTH/CARD_HEIGHT). Edge colours blend each endpoint's type token.
- Unit tests live in __tests__ folders. Each ticket's "Verify" line must actually run
  tests (vitest filters by path substring) — correct it if it does not.
- Playwright specs use e2e/support.ts (demoSession = seeded 16-node board, freshSession =
  empty board). Prove any reduced-motion test can fail without the emulation.

Ticket notes:
- 011: pure function nodes+edges -> positions in src/canvas/autoArrange.ts, no store access
  inside it. Persist positions through updateNode, as ONE undo entry for the whole arrange.
  The arrange button goes in the Toolbar children slot in routes/Workspace.tsx.
- 012: the composer needs data-chat-composer so the "From chat" menu item focuses it.
  Rail collapse state persists across reload. Announce a finished reply once (aria-live),
  not per token. chatStreaming must gate the composer AND the Add menu's "From chat".
- 013: reuse the "cited" highlight path; a stale cited id omits its chip only.
- 014: apply via createNode/createEdge in the store; pan so the new node is inside the
  visible viewport; undo returns the button to actionable.
- 015: no new dependencies except what the ticket allows. Delete flows are confirmed or
  undoable (nodes already toast-undo; check edges, annotations, files). Add an axe scan only
  if the ticket's Verify needs it and the dependency manifest in docs/spec.md permits it —
  otherwise stop and ask me.

Verify after each ticket, and the whole thing at the end:
  cd app && npm run typecheck && npx vitest run && npx playwright test
The machine can be heavily loaded: a test that passes alone but times out in the full run is
a timing problem to fix, not to ignore.

At the end: start the api and app servers from .claude/launch.json (configs "api" and "app")
in the Browser pane and leave them running. Tell me the demo login
(demo@marketingcanvas.dev / password123), what to try by hand per ticket, and any place you
had to choose between the spec and the ticket.
```
