# Design — API reconciliation and the whiteboard layer

Date: 2026-09-10
Status: approved, not yet implemented

---

## Why this document exists

`marketing-canvas-m7` shipped its first commit with four planning artifacts that do not
agree with each other:

1. `app/docs/spec.md` declares a **frontend-only build** with `localStorage` persistence
   and mocked chat. `api/` is a working 20-route backend with real auth and a streaming
   chat endpoint. The 15 backlog tickets follow the spec, not the API.
2. `app/design/marketing-canvas.dc.html` draws a **whiteboard layer** — a 7-tool dock, ink,
   sticky notes, board text, and pinned comment threads — that appears in no spec section,
   no state-matrix row, no ticket, and no API endpoint.
3. The design's comment threads render `author` and `replies`. `spec.md` § Actors says
   "Single actor. No admin, no collaborator, no viewer, no sharing."
4. The design's chat picker offers **Auto / Generator / Librarian / Reasoner**. The API
   implements **operator / generator / librarian**, auto-detected, with no override
   parameter. The design adds a mode the API lacks, omits one it has, and assumes a
   control the API cannot serve.

This document records the decisions that resolve all four, and the work they imply.

---

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Source of truth for persistence | **The API.** `api/` is the backend. `spec.md` is amended. |
| D2 | Whiteboard layer | **In scope.** Gets spec sections, state-matrix rows, tickets 016–022. |
| D3 | Who authors a comment | **Multi-actor, attribution only.** No sharing, no presence, no permissions. |
| D4 | Where whiteboard objects persist | **New API endpoints**, matching existing conventions. |
| D5 | Tool scope | **All 7 tools**, plus clear-ink and save-PNG. Send-to-chat ships **last**, mocked. |
| D6 | Chat modes | **Add a `mode` override to `POST /chat`** and implement `reasoner`. |
| D7 | Order of work | **Reconcile the docs first**, in one commit, before ticket 001. |

### D3 in detail — what "multi-actor" means here

The API has no multi-user capability: 20 routes, every one scoped to `ctx.user`, no
sharing, members, invites, or presence, and `Annotation` carries no author. Building real
collaboration would mean inventing a backend the mock does not have.

So multi-actor is scoped to **attribution**: comments and replies carry an author
(`id`, `name`, `avatarUrl`), threads render exactly as designed, and other authors reach
the board through seeded data. The board remains yours alone. `spec.md` § Actors is amended
to say precisely this — a single owner, with attributed comment authors — rather than being
left to imply collaboration the product does not support.

Sharing, presence, live sync and permissions are explicitly **v2**, listed in § Screen
inventory's cut list alongside settings, onboarding and export.

---

## API extensions

All additions follow the conventions already established in `api/README.md`: JSON in and
out, `Authorization: Bearer <token>`, ISO 8601 timestamps, the
`{ error: { code, message, field } }` envelope with stable branchable codes, per-user
scoping via `ctx.user`, and support for the `X-Mock-Latency` / `X-Mock-Fail` injectors.

### New types

```ts
Stroke  = { id, tool: 'pen' | 'highlighter', color: string, width: number,
            points: number[], createdAt }
Mark    = { id, variant: 'sticky' | 'text', x, y, body: string, color: string,
            createdAt, updatedAt }
Pin     = { id, x, y, resolved: boolean, createdAt, comments: Comment[] }
Comment = { id, body: string, createdAt,
            author: { id, name, avatarUrl } }
```

**`Mark` unifies the Sticky and Text tools.** Both are a positioned text box; they differ
only in whether a card is painted behind the text. Two tools, one entity, one set of
endpoints, one persistence path.

`points` is a flat `[x0, y0, x1, y1, …]` array rather than an array of objects — smaller
on the wire and directly consumable by the SVG path builder the design already uses.

`author` is **embedded** in each comment rather than referenced by id. There is no
`/authors` endpoint and no client-side author cache. A comment is self-contained.

### New endpoints

| | |
|---|---|
| `GET /strokes` | `200` → `Stroke[]` |
| `POST /strokes` | `201` → `Stroke` |
| `DELETE /strokes/:id` | `204` · `404 stroke_not_found` |
| `DELETE /strokes` | `204`. Clears every stroke on the board — backs the dock's clear-ink action. |
| `GET /marks` | `200` → `Mark[]` |
| `POST /marks` | `201` → `Mark` |
| `PATCH /marks/:id` | `200` → `Mark` · `404 mark_not_found` |
| `DELETE /marks/:id` | `204` · `404 mark_not_found` |
| `GET /pins` | `200` → `Pin[]`, each with its `comments` inlined |
| `POST /pins` | `201` → `Pin` with an empty `comments` array |
| `PATCH /pins/:id` | `200` → `Pin` · `404 pin_not_found`. Takes `x`, `y`, `resolved`. |
| `DELETE /pins/:id` | `204` · `404 pin_not_found`. Cascades to its comments. |
| `POST /pins/:id/comments` | `201` → `Comment` · `404 pin_not_found` |
| `DELETE /comments/:id` | `204` · `404 comment_not_found` |

### New error codes

| Code | Status | Raised when |
|---|---|---|
| `stroke_not_found` | 404 | No stroke with that id on this board |
| `mark_not_found` | 404 | No mark with that id |
| `pin_not_found` | 404 | No pin with that id |
| `comment_not_found` | 404 | No comment with that id |
| `invalid_tool` | 422 | `tool` is not `pen` or `highlighter` |
| `invalid_variant` | 422 | `variant` is not `sticky` or `text` |
| `invalid_field` | 422 | `x`/`y`/`width` missing or not a number; empty or whitespace-only `body` |

`invalid_field` reuses the existing code deliberately — clients already branch on it for
nodes and annotations, and the `field` property names which one failed.

### Chat changes

`POST /chat` gains an **optional `mode`**:

```json
{ "message": "…", "mode": "auto" | "generator" | "librarian" | "reasoner" }
```

Absent or `auto` preserves today's behaviour exactly — `detectMode()` picks from the
message text, and `operator` remains reachable that way. Any other value forces that mode.
An unrecognised value is `422 invalid_mode`.

`operator` is deliberately **not** in the picker. It triggers on naming two nodes, which
`auto` detects reliably, and selecting it before naming those nodes would leave the user in
a mode that cannot act.

**`reasoner`** is a new mock response mode: a board audit. It walks the graph and reports
what is structurally wrong — nodes with no edges at all, `goal` nodes with no chain of
`serves` edges reaching them, `campaign` nodes serving no strategy, `content` nodes serving
no campaign. It returns real `citedNodeIds` for everything it names, so on the seeded
16-node board it says something true and the existing citation-highlight path (ticket 013)
lights up the offenders. It emits no proposal.

### Seed changes

`api/seed.js` gains two collaborator authors with names and `avatarUrl`s, and seeds the
demo board with a handful of strokes, two or three marks, and two pins — one open with a
reply, one resolved — so every whiteboard state has something to render on first run,
matching how the board already seeds 16 nodes and 13 edges.

---

## Documentation reconciliation

This is the first commit, and it precedes ticket 001.

### `app/docs/spec.md`

- **Opening banner.** Delete "Frontend-only build. No server, no external integrations. All
  persistence is local; all chat responses are mocked." Replace with a pointer to
  `api/README.md` as the contract, and a note that the API is a local mock.
- **`[SEAM]` markers.** Each currently marks where a backend would attach. Each becomes a
  concrete reference to the endpoint that now serves it. The `localStorage` seam in
  § Data model and the dummy-auth seam in S1 are the two substantive ones.
- **§ Actors + jobs.** Rewritten per D3 — a single owner, with attributed comment authors,
  and an explicit statement that sharing and presence are v2.
- **§ Data model.** Gains `Stroke`, `Mark`, `Pin`, `Comment`. `FileRef` is corrected to
  match the API: `thumbUrl`, no `objectUrl`. `Edge.label` is corrected to
  `label: string | null` rather than optional.
- **§ Dependency manifest.** No additions — `fetch` is native and `zustand` still holds
  client state. The manifest gains a line stating that the store is now a cache over the
  API rather than the system of record.
- **§ Screen inventory.** Gains three overlays, specced inline under S3:
  **O7 whiteboard dock**, **O8 marks**, **O9 comment pins**. The cut list gains sharing,
  presence and permissions.
- **§ S3 Behavior.** Gains the tool state machine and the chat mode picker; the response-shape
  table goes to four modes.

### `app/docs/state-matrix.md`

Three new sections — **O7**, **O8**, **O9** — each with all six states and no blank cells,
matching the existing discipline.

The larger change: **every error cell currently assumes `localStorage`.** Roughly eight
cells across S3, O1, O2, S4 and O6 say variations of "this device is out of storage". Every
one becomes network- and API-failure copy. This is a genuine rewrite of each cell, not a
find-and-replace, because the recovery advice changes with the failure — a 503 is
retryable, a 422 is not, and an offline client is a third case. The gain is that
`X-Mock-Fail` makes all of them reachable on demand, so ticket 015 can verify them instead
of describing them.

### `app/backlog/`

Two existing tickets are rewritten:

- **002** — `localStorage` store becomes an API client plus a client-side cache. Its
  acceptance criterion ("the serialized board in local storage reflects it") is replaced
  with one about the request the mutation issues and the cache it updates.
- **003** — dummy auth becomes real `POST /auth/signup` / `POST /auth/login`, with the
  API's actual error codes (`invalid_email`, `weak_password`, `email_taken`,
  `bad_credentials`) replacing invented ones. The `taken@example.com` fixture makes the
  duplicate-email path testable.

Tickets 012–014 are left **as written**. All mode-picker and `reasoner` work lands in 021,
so the chat rail is built once against the current three modes and extended after.

---

## New tickets

```
016  Whiteboard dock + tool state machine
017  Ink — pen, highlighter, eraser, clear
018  Marks — stickies and board text
019  Comment pins + threads
020  Save the marked-up board as PNG
021  Chat mode picker + Reasoner mode
022  Send the board to the assistant
```

Each follows the existing ticket shape: **Context** (spec and state-matrix sections),
**Scope** (named files, nothing else), **Acceptance** (given/when/then).

- **016** — the dock, the seven tools (`V P H E S T C`), Esc to exit to Select, the tool
  hint pill, and the disabled rules. No tool does anything yet; this ticket is the mode
  machine and its keyboard surface.
- **017** — pen and highlighter strokes, live stroke rendering, eraser, clear-all, and
  persistence through `/strokes`. Highlighter differs from pen by width and stroke-opacity
  only, per the design's own token usage.
- **018** — sticky and text marks: create, drag, edit inline, delete, persist via `/marks`.
- **019** — pins, the thread panel, posting comments and replies, resolve and unresolve,
  delete. Author attribution renders from the embedded `author`. This is where D3 becomes
  visible in the product.
- **020** — rasterise the board region to PNG and download it. Canvas nodes, edges, ink and
  marks; excludes the dock, rail and toolbar chrome.
- **021** — the mode picker in the composer, the `mode` parameter, and `reasoner` end to
  end, reusing ticket 013's citation highlighting.
- **022** — **last.** The dock's send-to-assistant action. `POST /chat` accepts a
  rasterised board, and the mock responds *as if it read the marks* — referencing ink near
  named nodes and sticky text — so the interaction is complete and convincing without a
  real vision model. The mock is the point here, not a limitation to apologise for.

---

## Sequence

```
docs reconciliation commit
  → 001–015   the core product, as already planned
  → 016–022   the whiteboard layer on top
```

The whiteboard cannot move earlier: it needs the canvas surface (004) to draw on and the
store (002) to persist through. 016–020 are strictly additive to a finished core product.

---

## Testing

Per-ticket, following the manifest's `vitest` + `@testing-library/react` + `playwright`:

- **API extensions** — exercised through the client's own tests rather than a separate
  server suite, since `api/` is a mock, not a deliverable. `GET /__reset` gives every test
  a known board.
- **Error states** — `X-Mock-Fail` and `X-Mock-Latency` drive the loading and error cells
  of the state matrix directly. This is the concrete payoff of D1 and the reason the matrix
  rewrite is worth its cost.
- **Tool state machine (016)** — unit tests over the reducer: every tool transition, Esc
  from each tool, and the disabled rules. No DOM needed.
- **Ink (017)** — pointer-event sequences produce the expected `points` array; the eraser
  removes the intended stroke and no other.
- **Threads (019)** — a comment posts, a reply nests, resolve toggles, delete cascades.
- **Reasoner (021)** — against the seeded board, the audit names the actually-orphaned nodes
  and cites their real ids.

---

## Risks

- **The state-matrix rewrite is the largest hidden cost of D1** and it lands in the very
  first commit, before any code exists to validate it against. If a cell turns out wrong
  once ticket 015 runs, it gets corrected then; the matrix is a living document, not a
  contract.
- **Ticket 020 (PNG)** depends on rasterising DOM and SVG together. If `foreignObject`
  proves unreliable across targets, the fallback is to render nodes and marks directly to a
  canvas rather than screenshotting the DOM. Decided in the ticket, not here.
- **Ticket 022's mock must be convincing.** A response that references marks only vaguely
  would undercut the feature more than not shipping it. Its acceptance criteria must require
  the response to name specific sticky text or a node adjacent to actual ink.
