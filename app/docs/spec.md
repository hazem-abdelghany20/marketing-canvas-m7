# Marketing Canvas — Spec

> Built against the local mock API in `api/`. Its contract is `api/README.md` — that file is
> authoritative for every request, response shape and error code named here. The API is a
> mock: it runs locally, has no external integrations, and its chat responses are generated
> rather than modelled. It is nonetheless the system of record; the client caches, it does
> not own the data.

---

## Idea

A workspace where every marketing artifact I own sits in one space, visibly connected to the
goal it serves — so I can point at any piece of content and trace it back to why it exists.

Notion and Drive already store marketing documents. Neither shows lineage. This shows lineage.

---

## Actors + jobs

```
Owner (you) → map, connect, trace, produce
```

One owner per board. A board belongs to one account, is never shared, and has no permission
tiers.

Comment threads on the board carry an **author** — a name and an avatar — so a thread reads as
a conversation rather than a pile of anonymous text. That is attribution, not collaboration:
other authors reach a board through seeded content, never by signing in to it. Nothing in this
spec lets a second person open your board.

Sharing, invitations, presence and live sync are v2. They are a different spec, and the mock
API deliberately has no endpoints for them.

---

## Critical path

```
sign in → land on canvas → add node → connect it to another → open it, annotate → it holds
```

Building is the spine. It subsumes tracing (you connect *to* something, which is tracing) and
subsumes producing (chat generates a node onto the canvas).

---

## Screen inventory

Every screen traces to a step on the critical path.

| # | Screen | Route | Traces to |
|---|---|---|---|
| S1 | Sign in | `/signin` | `sign in` |
| S2 | Sign up | `/signup` | `sign in` (branch) |
| S3 | Workspace | `/` | `land on canvas` — this is the app |
| S4 | Node detail | `/node/:id` (panel over `/`) | `open it, annotate` |

Overlays and modes of S3 — not separate screens, specified inline under S3:

| # | Overlay | Traces to |
|---|---|---|
| O1 | Add-node menu | `add node` |
| O2 | File import | `add node` |
| O3 | Connect mode | `connect it` |
| O4 | Node quick-peek | `connect it` |
| O5 | Search / jump-to-node | `connect it` |
| O6 | Chat rail collapse/expand | spans path |
| O7 | Whiteboard dock + tool modes | `add node` (annotating what you built) |
| O8 | Marks — stickies and board text | `open it, annotate` |
| O9 | Comment pins and threads | `open it, annotate` |

**Below 640px** the workspace is the phone layout: four screens and a tab bar, drawn in
`design/mobile-direction.html`. They are the same board and the same actions, arranged for a thumb;
from 640px up none of this applies.

| # | Phone screen | Opened from | Traces to |
|---|---|---|---|
| P1 | Phone shell | `/` below 640px | `land on canvas` — it replaces S3's layout |
| P2 | Trace | the Trace tab; the home screen | `connect it` (read what a node serves) |
| P3 | Board on a phone | the Board tab | `add node`, `connect it` |
| P4 | Chat on a phone | the Chat tab | spans path |
| P5 | Find | the Find tab | `connect it` (find the node, then trace it) |
| P6 | Add and node sheets | the Add tab; a node's card | `add node`, `open it, annotate` |

**Cut, off-path:** settings/profile, onboarding tour, node-type manager, sharing, export,
Notion/Drive sync, **sharing, presence, live sync and permission tiers**. Each is a v2 file,
not a v1 omission by accident.

---

## Data model

```ts
type NodeType = 'goal' | 'strategy' | 'campaign' | 'content' | 'asset' | 'note'
type EdgeKind = 'serves' | 'relates-to'

User        = { id, name, email, avatarUrl }
Board       = { id, name, viewport: { x, y, zoom } }
Node        = { id, type: NodeType, title, body, fileIds: string[],
                x, y, createdAt, updatedAt }
Edge        = { id, fromId, toId, kind: EdgeKind, label: string | null }
Annotation  = { id, nodeId, body, createdAt }

InkTool     = 'pen' | 'highlighter'
MarkVariant = 'sticky' | 'text'
Stroke      = { id, tool: InkTool, color, width, points: number[], createdAt }
Mark        = { id, variant: MarkVariant, x, y, body, color: string | null,
                createdAt, updatedAt }
Pin         = { id, x, y, resolved: boolean, createdAt, comments: Comment[] }
Comment     = { id, body, createdAt, author: { id, name, avatarUrl } }
FileRef     = { id, name, mime, sizeBytes, thumbUrl, createdAt }
ChatMessage = { id, role: 'user' | 'assistant', content, status,
                citedNodeIds: string[], proposal?: Proposal,
                createdAt: string, mode?: 'generator' | 'librarian' | 'operator' | 'reasoner' }
Proposal    = { kind: 'create-node' | 'create-edge', payload: Partial<Node> | Partial<Edge> }
```

`objectUrl` is **client-only** — it never round-trips to the API.

**The whiteboard layer sits above the graph, not inside it.** Strokes, marks and pins have
board coordinates but no edges and no node relationships. They annotate the canvas; they are
not part of the traceability spine. Deleting a node never deletes ink near it.

**One `Mark`, two variants.** A sticky and a board-text block are the same positioned text
box, differing only in whether a card is painted behind the text.

**Type semantics** — what each node means, so the graph is readable without a legend:

| Type | Means | Example |
|---|---|---|
| `goal` | An outcome with a number and a horizon | "Vayn: 500 orders/month by Q4" |
| `strategy` | Positioning, ICP, messaging — the durable thinking | "Vayn ICP: 25–34 urban women" |
| `campaign` | A time-boxed push | "Vayn Ramadan push" |
| `content` | One produced piece | "Reel: 3 ways to style linen" |
| `asset` | A raw uploaded file | `vayn-lookbook.pdf` |
| `note` | Freeform annotation that stands on its own | "Competitor dropped price 20%" |

**Edge semantics:**
- `serves` — directional, the traceability spine. Reads `A serves B`.
  Canonical chain: `content → campaign → strategy → goal`.
- `relates-to` — undirected, everything else.

**Bidirectional display rule:** an edge is stored once (`fromId`, `toId`) but rendered on
both endpoints. Node A's detail panel shows it under *Serves*; node B's shows it under
*Served by*. Creating a connection from either side produces the same single edge.

Persistence is the API. `store/` is a cache over it, not the system of record: mutations issue
a request and reconcile against the response. A reload re-fetches; nothing authoritative lives
in the browser.

Uploaded files are the one exception, and it is deliberate. `POST /files` registers **metadata
only** — the API never receives the bytes. The blob stays in the tab as a
`URL.createObjectURL` and does not survive a reload. The file *record* comes back, the blob
does not, and the asset node renders its `file-missing` state.

---

## Dependency manifest

Tickets may not add dependencies outside this list.

```
react · react-dom · typescript · vite
@vitejs/plugin-react — React Fast Refresh in dev (state-preserving hot reload)
@xyflow/react        — canvas: nodes, edges, pan, zoom, selection
zustand              — app state
react-router-dom     — routing
tailwindcss          — styling (tokens in tailwind.config)
lucide-react         — icons
vitest · @testing-library/react · playwright (@playwright/test)  — tests
jsdom · @testing-library/dom — the DOM that @testing-library/react needs under vitest (dev only)
```

No HTTP client is listed because none is needed — `fetch` is native. `zustand` holds a cache
of API state plus genuinely client-only state (tool mode, selection, viewport before it is
flushed), not the system of record.

---

## Design tokens

Defined once in `src/styles/tokens.css` + `tailwind.config.ts`. No raw hex anywhere else.

```
Surface     --bg-canvas · --bg-panel · --bg-rail · --bg-elevated
Text        --fg-primary · --fg-muted · --fg-inverse
Line        --border-subtle · --border-strong · --edge-serves · --edge-relates
Node type   --node-goal · --node-strategy · --node-campaign
            --node-content · --node-asset · --node-note
Intent      --accent · --danger · --warn · --ok
Focus       --focus-ring (2px, never removed, always visible on keyboard focus)
Radius      --r-sm · --r-md · --r-lg
Space       4px base scale
```

Dark and light themes both required, driven by `prefers-color-scheme` with a manual override
persisted locally.

---

# S1 — Sign in

### Layout
Single centered column, max-width 400px, on a full-bleed canvas-textured background that hints
at the product (faint node/edge pattern). Logo → heading → email field → password field →
primary submit → link to S2. No social auth. Below 480px the column takes full width with
16px gutters; nothing else changes.

### Content
```
User = { email, password }   // password never persisted, never logged
```
Heading: "Sign in". Fields labelled `Email`, `Password`. Submit label `Sign in`.
Footer: "No account? **Create one**" → S2.
Auth is `POST /auth/login`. Failures are the API's own codes: `bad_credentials` (401),
`invalid_email` and `weak_password` (422). See `api/README.md` § Auth.

### Behavior
```
Type in field        → clear that field's error
Submit (valid)       → set pending → 600ms mock delay → write session → navigate to S3
Submit (invalid)     → block submit, focus first invalid field, render inline errors
Submit (mock reject) → keep both field values, render form-level error, re-enable submit
Enter in any field   → submit form
Click "Create one"   → navigate to S2
Already has session  → redirect to S3 before first paint
```

### States
See `state-matrix.md`, row S1.

### Acceptance criteria
- Given a signed-out visitor, when `/signin` loads, then the email field holds keyboard focus.
- Given an email without `@`, when the form is submitted, then submission is blocked and an
  inline error names the email field.
- Given a valid email and a 7-character password, when the form is submitted, then submission
  is blocked and the error reads that the password needs at least 8 characters.
- Given valid input, when submission succeeds, then the app navigates to `/` and the returned
  token is held for subsequent requests.
- While a submission is pending, the submit button shall be disabled and labelled `Signing in…`.
- When a submission fails, the form shall retain both entered values and restore an
  interactive submit button.
- Given an existing session, when `/signin` is visited, then the app redirects to `/`.

---

# S2 — Sign up

### Layout
Identical shell to S1. Fields: name, email, password, confirm password. Footer links back to S1.

### Content
```
{ name, email, password, confirmPassword }
```
Heading: "Create your workspace". Submit: `Create workspace`.
Sign-up is `POST /auth/signup`, which returns a token, a user and an empty board. Failures:
`invalid_email`, `weak_password` (422) and `email_taken` (409). The address
`taken@example.com` always returns `email_taken`, so the duplicate path is testable on demand.

### Behavior
```
Type in password        → live-render the 8-char rule as met/unmet
Type in confirm         → live-compare against password
Submit (valid)          → pending → 600ms → create session + empty board → navigate to S3
Submit (mismatch)       → block, error on confirm field
Submit (email in use)   → mock-reject for the literal address taken@example.com only
Click "Sign in"         → navigate to S1
```

### States
See `state-matrix.md`, row S2.

### Acceptance criteria
- Given a password and a non-matching confirmation, when the form is submitted, then
  submission is blocked and an inline error names the confirmation field.
- Given `taken@example.com`, when the form is submitted, then a form-level error states the
  address is already registered and all other field values are retained.
- Given valid input, when submission succeeds, then the app navigates to `/` and the board
  contains zero nodes.
- While a submission is pending, every field and the submit button shall be non-interactive.

---

# S3 — Workspace

The app. Everything else is a panel over this.

### Layout

```
┌──────────────┬────────────────────────────────────────────────┐
│              │  Toolbar (top-right, floating over canvas)     │
│  Chat rail   │   [+ Add] [Connect] [Search] [Auto-arrange]    │
│  (360px)     │                                    [Fit] [+/−] │
│              │                                                │
│  · messages  │                  Canvas                        │
│  · composer  │        nodes · edges · selection               │
│              │                                                │
│  [collapse]  │  Legend (bottom-left, collapsible)             │
└──────────────┴────────────────────────────────────────────────┘
```

- **Chat rail** — left, fixed 360px, collapsible to a 48px icon strip. Collapse state persists.
- **Canvas** — fills remaining space. Primary. Owns pan, zoom, selection.
- **Toolbar** — floats over the canvas, never pushes layout.
- **Legend** — bottom-left, maps the 6 type colors, collapsible, collapse state persists.

**Below 900px:** the rail becomes an overlay sheet over the canvas rather than a column, opened
from a floating chat button. Canvas remains full-bleed underneath. Toolbar collapses its labels
to icons only.

**Below 640px:** the workspace is the phone layout (P1): four screens and a tab bar instead of a
canvas with panels over it. From 640px up the layout above is unchanged.

### Content

```
Board  = { name, viewport }
Nodes  = Node[]     // rendered as typed cards
Edges  = Edge[]     // rendered as directional (serves) or plain (relates-to) lines
Chat   = ChatMessage[]
```

Node card renders: type chip · title · 2-line body excerpt · file-count badge (if any) ·
annotation-count badge (if any) · connection-count badge.

Seed data on a fresh board: **zero nodes.** The empty state carries the first-run affordance;
no demo content is injected.

### Behavior

**Canvas**
```
Drag empty canvas       → pan
Scroll / pinch          → zoom (0.25×–2×, clamped)
Click node              → select, show quick-peek (O4)
Double-click node       → open S4
Drag node               → move; position persists on drop
Drag with multi-select  → move all selected together
Click empty canvas      → clear selection
Delete / Backspace      → delete selected nodes + their edges, with undo toast
Cmd/Ctrl+Z              → undo last mutation (move, create, delete, connect, auto-arrange)
Cmd/Ctrl+F              → open search (O5)
"Fit" button            → zoom to fit all nodes; disabled when board is empty
Viewport change         → persist x/y/zoom (debounced 300ms)
```

**O1 — Add-node menu**
```
Click [+ Add] or press N  → open menu: Note · File · From chat
Choose Note               → create an untitled `note` node at viewport center, open S4
                            with the title field focused
Choose File               → open O2
Choose "From chat"        → focus the chat composer, prefill nothing
Escape                    → close menu, create nothing
```
Node type is set in S4 after creation, not before — creation is one click, typing is a
follow-up. New nodes land at viewport center, nudged to avoid exact overlap with an existing
node.

**O2 — File import**
```
Click "File" / drop file onto canvas → create an `asset` node at the drop point (or viewport
                                        center) per file
Drop multiple files                  → one asset node per file, laid out in a row
Unsupported type                     → reject that file, keep the rest, toast names the file
File > 25MB                          → reject that file, toast names the size limit
Drag over canvas                     → canvas shows a drop-target outline
```
Accepted: images, PDF, plain text, markdown, common office formats. `POST /files` registers
**metadata only** — the API never receives the bytes. The blob is held in the tab as an object
URL and does not survive a reload; the record does. See `api/README.md` § Files.

**O3 — Connect mode**
```
Click [Connect] or press L   → enter connect mode; cursor changes; canvas dims non-node areas
Click source node            → source marked; a live line follows the cursor
Click target node            → open a small kind picker: `serves` / `relates-to`
Pick kind                    → create edge, exit connect mode, both endpoints flash once
Click source again           → deselect source, stay in mode
Escape                       → exit connect mode, create nothing
Drag from a node's handle    → same flow without entering the mode explicitly
Target == source             → rejected, toast explains a node cannot connect to itself
Edge already exists          → rejected, toast says the connection already exists
```
Every created edge is immediately visible from both endpoints (see bidirectional display rule).

**O4 — Node quick-peek**
```
Select a node → floating card near the node: title, type, body excerpt, connection count,
                [Open] [Connect from here] [Delete]
Deselect      → dismiss
```

**O5 — Search / jump-to-node**
```
Cmd/Ctrl+F or [Search]  → overlay input with results list
Type                    → filter nodes by title + body, case-insensitive, live
↑ / ↓                   → move through results
Enter                   → pan+zoom to that node, select it, close overlay
Escape                  → close, no navigation
No matches              → results area shows the empty state, Enter does nothing
```

**Auto-arrange**
```
Click [Auto-arrange]  → layered layout: goals top row, then strategy, campaign,
                        content/asset, note — ordered by `serves` edges
                        Animate 300ms. Positions persist. One undo restores all prior
                        positions.
Board empty           → button disabled
```
Manual drag always wins afterward; auto-arrange is an action, never a mode. Nothing
re-arranges on its own.

**O7 — Whiteboard dock**
```
Select (V)      → default. Drag pans, click selects, nodes are interactive.
Pen (P)         → drag draws a stroke. Nodes are inert while drawing.
Highlighter (H) → as Pen, wider and translucent. Draws beneath node cards.
Eraser (E)      → click or drag over a stroke removes that whole stroke, not part of it.
Sticky (S)      → click drops a sticky at that point and focuses it for typing.
Text (T)        → click drops a text mark at that point and focuses it.
Comment (C)     → click drops a pin at that point and opens its thread, composer focused.
Esc             → returns to Select from any tool.
Tool hint       → a pill naming the active tool and its Esc affordance, while not Select.
```
The dock also holds three actions that are not tools:

```
Send to assistant → draws the board (nodes, edges, ink, marks) and sends it to chat as your message;
                    the reply reads the marks and names the nodes they are on. Disabled while the
                    board loads, with no ink and no written note ("Draw or add a note first."), and
                    while a reply streams ("Wait for the current reply to finish.").
Save as PNG       → the same picture at 2x (long edge capped at 8192), over the theme's canvas colour,
                    downloaded as <board>-markup.png. The dock, rail, toolbar and overlays are not in
                    it: it is drawn from the board's data, not photographed from the page. Disabled
                    while loading and on a board with nothing on it ("Nothing to save yet.").
Clear ink         → confirmed first ("Clear all ink?"), then one request. Absent when there is no ink.
```

Layering, bottom to top: highlighter ink, marks, edges and cards, pen ink, comment pins. Pins are
not in the PNG: they are a conversation about the board, not part of it.

Connect is on **L**, not C: C belongs to the Comment tool, and `design/marketing-canvas.dc.html` puts
Connect on L. A drawing tool is put away when connect mode begins, and the tools that draw, write or
pin are disabled while it is on.

Ink, marks and pins persist through `/strokes`, `/marks` and `/pins`. They annotate the
canvas and never join the graph — see § Data model.

**Chat rail**
```
Type + Enter            → append user message, append assistant message in `streaming` status
Streaming               → text appends token-by-token (mock, ~20ms/token)
Shift+Enter             → newline, do not send
Send while streaming    → blocked; composer disabled until the current response settles
Response with citations → cited node ids are highlighted on the canvas and the message shows
                          clickable chips; clicking a chip pans to that node
Response with proposal  → message renders an [Add to canvas] button
Click [Add to canvas]   → apply the proposal (create node / create edge), pan to it,
                          button becomes a non-interactive "Added" state
Mock failure            → assistant message enters error state with a [Retry] action; the
                          user's message is retained
Collapse rail           → canvas expands; collapse state persists
```

Three mocked response shapes, one component:

| Mode | Trigger in mock | Response |
|---|---|---|
| Generator | prompt starts with "write" / "draft" / "create" | text + `create-node` proposal |
| Librarian | prompt is a question about existing nodes | text + `citedNodeIds` |
| Operator | prompt mentions a node by title + an action | text + `create-edge` proposal |
| Reasoner | selected explicitly — never auto-detected | a structural audit + `citedNodeIds`, never a proposal |

The composer carries a mode picker offering **Auto / Generator / Librarian / Reasoner**, with
Auto selected by default. Operator is not in the picker: it triggers on naming two nodes,
which Auto detects, and selecting it beforehand would strand you in a mode that cannot act.

All four modes come from `POST /chat` as a server-sent event stream. The responses are
generated by the mock, not by a model; swapping in a real model is a server change, not a
client one. See `api/README.md` § Chat.

### States
See `state-matrix.md`, row S3.

### Acceptance criteria
- Given an empty board, when the workspace loads, then the canvas renders its first-run state
  with an affordance that opens the add-node menu.
- Given a node on the canvas, when it is dragged and released, then its position is written to
  the store and survives a page reload.
- Given two nodes, when a `serves` edge is created from A to B, then A's detail panel lists B
  under *Serves* and B's detail panel lists A under *Served by*.
- Given a selected node, when Delete is pressed, then the node and every edge touching it are
  removed and a toast offers a single undo that restores both.
- Given 12 nodes connected in a `content → campaign → strategy → goal` chain, when
  Auto-arrange runs, then goals render above strategies, strategies above campaigns, and
  campaigns above content.
- Given any arrangement, when Auto-arrange has run and Cmd/Ctrl+Z is pressed once, then every
  node returns to its pre-arrange position.
- Given a query matching no node title or body, when it is typed in search, then the results
  area shows its empty state and Enter performs no navigation.
- While an assistant response is streaming, the chat composer shall be disabled.
- When an assistant response includes cited node ids, the canvas shall visually distinguish
  those nodes until the next selection change.
- When a proposal is applied, the button shall become non-interactive and the created node
  shall be within the visible viewport.
- When a dropped file exceeds 25MB, the app shall create no node for that file and shall show
  a message naming the file and the limit.
- Given a connect-mode source node, when the same node is clicked as target, then no edge is
  created and a message explains why.

---

# S4 — Node detail

Opens as a right-side panel over the canvas (480px), not a full route change; the canvas stays
visible and the node stays highlighted. Deep-linkable at `/node/:id`.

### Layout
```
┌────────────────────────────────┐
│ [type chip ▾]          [✕]     │
│ Title (inline editable, h1)    │
├────────────────────────────────┤
│ Body (inline editable, rich-   │
│ text-lite: headings, bold,     │
│ lists, links)                  │
├────────────────────────────────┤
│ Files            [+ Attach]    │
│  · thumbnail rows              │
├────────────────────────────────┤
│ Connections      [+ Connect]   │
│  Serves →                      │
│  Served by ←                   │
│  Related                       │
├────────────────────────────────┤
│ Annotations      [+ Note]      │
│  · timestamped entries         │
└────────────────────────────────┘
```
Below 900px the panel becomes a full-screen sheet.

### Content
```
Node + FileRef[] + Edge[] (both directions, grouped) + Annotation[]
```
Connections group by relationship, each row showing the other node's type chip + title, and
clicking a row pans the canvas to that node without closing the panel.

### Behavior
```
Edit title           → autosave on blur and after 500ms idle
Edit body            → autosave on 500ms idle
Change type          → node card + all its edges recolor immediately
Click [+ Attach]     → file picker; same accept/size rules as O2
Click a file row     → preview inline (image) or open in a new tab (pdf/other)
Remove a file        → confirm, then detach; undo toast
Click [+ Connect]    → enter connect mode with this node preselected as source
Click connection row → pan canvas to that node; panel stays open on the current node
Remove a connection  → confirm, then delete the edge; both endpoints update at once
Add annotation       → append with timestamp; empty submission is rejected
Delete annotation    → confirm, then remove
Escape / ✕           → close panel, return to `/`
Node deleted elsewhere → panel closes and a message states the node no longer exists
Blob missing (reload)  → file row renders its file-missing state with a re-attach action
```

### States
See `state-matrix.md`, row S4.

### Acceptance criteria
- Given an open node, when the title is edited and focus leaves the field, then the canvas card
  shows the new title without a reload.
- Given an open node, when its type is changed, then the node card and every edge attached to
  it render the new type's color.
- Given a node with both incoming and outgoing `serves` edges, when its panel opens, then
  outgoing edges appear under *Serves* and incoming edges under *Served by*.
- Given an open panel, when a connection row is clicked, then the canvas pans to that node and
  the panel still shows the originally opened node.
- Given an empty annotation input, when it is submitted, then no annotation is created.
- Given a node open at `/node/:id`, when that node is deleted, then the panel closes and a
  message states the node no longer exists.
- Given a reloaded session, when a node with an attached file is opened, then the file row
  renders its file-missing state and offers re-attachment.
- While an autosave is in flight, the panel shall show a saving indicator and shall not block
  further typing.

# P1 — Phone shell

The workspace below 640px. A phone is for reading a chain and asking a question more than for dragging a
graph, so the canvas with panels over it gives way to four screens and a bar. The 900px layout (the rail as
a sheet, a toolbar of icons) is the tablet's, between 640px and 900px, and is not changed.

### Layout

```
┌──────────────────────────────┐
│                              │
│   Trace · Board · Chat · Find│   one screen at a time, full height
│                              │
├──────────────────────────────┤
│ Trace  Board  ( Chat )  Find  Add │   tab bar, Chat raised in the middle
└──────────────────────────────┘
```

- **Tab bar** — Trace, Board, Chat, Find, Add, along the bottom edge. Every tab is at least 44px high. It clears
  the home indicator itself (the page asks for the whole screen with `viewport-fit=cover`). Chat is raised, where
  the thumb rests. **Add** is not a screen: it opens a sheet over the one shown (P6).
- **Screens** — one at a time. The others are hidden from sight, from Tab and from assistive technology.
- **The canvas is never unmounted.** The Board is kept laid out, but `inert` and see-through, so React Flow keeps
  its size and the camera, the selection and a file still being read survive a trip to another tab.
- **A node's detail** opens over the bar (P6), and leaves the screen underneath as it was.

### Content

```
phoneTab  = 'trace' | 'board' | 'chat' | 'find'     // client-only; opens on Trace; not kept across a reload
```

### Behavior

```
Tap a tab                  → show that screen
Ask for the assistant      → show Chat (From chat, sending the board, Ask about it); focus the composer if asked
Start connect mode         → show Board (connecting is picking cards on the canvas)
Leave Board in connect mode→ connect mode ends: it cannot sit unseen with the drawing tools disabled
Open /node/:id             → the detail sheet over the bar; the tab underneath is left as it was
```

### States
See `state-matrix.md`, row P1.

### Acceptance criteria
- Given a window narrower than 640px, when the workspace loads, then a bar offers Trace, Board, Chat, Find and
  Add, in that order, with Chat in the middle and raised.
- Given a window 640px or wider, when the workspace loads, then there is no bar and the layout is the desktop's.
- Given the bar, when a tab is chosen, then its screen shows, the others are hidden from sight and from assistive
  technology, and the chosen tab is marked as the current page.
- Given the Board is hidden, when another tab is shown, then the canvas stays mounted: the camera and selection survive.
- Given a phone, when the assistant is asked for from anywhere, then the Chat tab is shown.
- Given the phone layout at 320, 360, 375, 390 and 430px, when any tab is shown, then the page does not scroll
  sideways and nothing on it runs past an edge.

---

# P2 — Trace

The home screen. It answers the app's one question on a phone: why does this piece of content exist? A column of
rows from a goal down, one for each layer of what serves the card on screen above it. Each row is swiped sideways,
and swiping a row redraws every row under it.

### Layout

```
 Trace                              ↶
 GOAL  1 of 2                  ━ ·
 ┌───────────────────────┐ ┌──────
 │ Vayn: 500 orders/…    │ │ Menta…
 │ [7 under it] [1 note] │ │
 └───────────────────────┘ └──────
   │ served by
 STRATEGY  1 of 2              ━ ·
 ┌───────────────────────┐ ┌──────
 │ Vayn ICP: 25-34 …     │ │ Vayn …
 └───────────────────────┘ └──────
   │ served by
 CAMPAIGN  1 of 1
 ┌─────────────────────────────┐
 │ Vayn linen drop - September │
 └─────────────────────────────┘
```

- **Rows** are built from `serves` depth, not from node type: a row holds the nodes that serve the card on screen in
  the row above. A row's label is the type it holds, or "Served by" when it mixes types (and then every card shows
  its type). A node never appears twice in one chain; rows stop at eight.
- **A row** scrolls sideways and snaps to a card, with the next peeking in at the edge. The dots, the "1 of 2" and the
  arrow keys are the other ways to move along it.
- **A card** shows its title and the start of its body, how many serve it (a goal: how many sit under it, at any
  depth), the nodes it is joined to by `relates-to`, and how many notes it carries.
- **Under a goal, strategy or campaign that nothing serves** the next row is empty: "Nothing serves this yet." and
  a button to add what is expected there (P6). Nothing is expected to serve content, an asset or a note.

### Content

```
tracePath = string[]   // the card on screen in each row, from the goals down; kept in sessionStorage (mc-trace-path)
```
A choice made under a card is only kept while that card is the one on screen: when a row changes, every row under it
starts again at its first card. A node that has gone falls back to the first card in its row.

### Behavior

```
Swipe a row / tap a dot / ← →  → bring that card on screen; redraw every row under it
Tap the card on screen          → open its node detail (P6)
Tap a card peeking in           → bring it on screen
Choose a node in Find (P5)      → set tracePath to the chain from its goal, and show Trace
```

### States
See `state-matrix.md`, row P2.

### Acceptance criteria
- Given a board with goals, when Trace opens, then its first row lists the goals and under the goal on screen there is
  one row for each layer of what serves it.
- Given a row, when it is swiped, then the card on screen changes and every row beneath is replaced by what serves
  the new card, starting at its first card.
- Given the card on screen, when it is tapped, then its node detail opens; given a card peeking in, then it comes on screen.
- Given serves edges that loop, when Trace is built, then a node never appears twice in one chain.
- Given a board with no goals, when Trace opens, then it says "No goals yet." and how a trace starts.
- Given a reload in the same tab, when Trace opens, then it opens on the chain that was on screen.

---

# P3 — Board on a phone

The canvas, with the whiteboard's tools along the bottom of it and everything the desktop toolbar held behind one menu.

### Layout

```
┌──────────────────────────────┐
│ ┌─────────────────┐ ┌────────┐│
│ │ Board name  ↶ ⋯ │ │ Ask…   ││   top bar: name, Undo, More; Ask about this
│ └─────────────────┘ └────────┘│
│                              │
│           canvas             │
│                              │
│      ┌ colours · widths ┐    │   ink options, above the dock, while a pen is in hand
│   ┌── ↖ ✎ ▮ ⌫ ▢ T ◌ ──┐     │   the dock: seven tools in a row
├──────────────────────────────┤
│           tab bar            │
└──────────────────────────────┘
```

- **Dock** — the seven tools of O7 in one row above the tab bar, each at least 40px. The tools' states, keys and
  reasons are O7's; Send, Save and Clear ink are not in it.
- **Ink options** — the colours and widths in a bar above the dock while the Pen or the Highlighter is in hand.
- **Top bar** — the board's name, Undo, a **More** menu and **Ask about this**, which sends the board to the assistant
  (O7's rules: "Draw or add a note first.", "Wait for the current reply to finish."). More offers Connect, Auto-arrange,
  Fit to screen, Save as PNG, and Clear ink while there is ink.
- **Two fingers are the camera.** With a tool that draws or places in hand, one finger is the tool's; a second throws the
  first finger's stroke away and the pair pan and zoom the board until every finger lifts. A finger left down after the other
  leaves does nothing. A third is ignored.
- **A control that can't be used says why when it is tapped** (a toast, or the item's own second line), because a
  touch screen has no tooltip to read.
- **The camera is the board's, not the phone's.** The first time the Board is shown, if fewer than half the cards are
  centred on screen (a wider screen left it), it is brought back to all of them.

### Content
O7, O8, O9: the same strokes, marks and pins. The hint for a tool is written for a finger ("One finger draws · two
fingers pan and zoom") with a Done button where a desktop has Esc.

### Behavior

```
Tap a tool                   → pick it (disabled: say why)
One finger over a tool       → the tool's gesture
Second finger lands          → cancel the first finger's stroke; pan and zoom with the pair
More › Connect               → connect mode: tap a card, tap another, choose the kind; the banner is under the top bar
Ask about this               → draw the board, show Chat, stream the reply
```

### States
See `state-matrix.md`, row P3.

### Acceptance criteria
- Given the Board tab, when it renders, then the seven tools sit in one bar above the tab bar, each at least 40px across.
- Given a tool that draws is in hand, when a second finger touches down, then the stroke is thrown away and nothing is saved,
  and the two fingers pan and zoom the board until every finger lifts.
- Given a disabled control, when it is tapped, then it says why.
- Given connect mode starts anywhere on a phone, then the Board is shown; given it is left, connect mode ends.
- Given a toast on the Board tab, then it is above the dock; on any other tab it is above the tab bar.

---

# P4 — Chat on a phone

The assistant as a screen of its own, with a strip of the board above the conversation.

### Layout

```
 ● ● ASSISTANT
 2 CITED                    Open board
 ┌──────────────────────────────────┐
 │  [Vayn Ramadan push]──[Vayn pos…]│   the strip
 │      [Email: Ramadan…]           │
 └──────────────────────────────────┘
 [Auto][Generator][Librarian][Reasoner]
   …the conversation…
 (◉) [ Ask, or say “draft a…”   ] (➤)
```

- **The strip** is an outline of the whole board while nothing is cited. When a reply cites nodes it is those nodes and
  every node joined to one of them, the cited ones marked, each a way into that node. Positions are the board's, scaled
  to fit; sizes are not, so a title stays legible, and chips that would overlap are nudged apart. **Open board** shows the
  Board with the cited nodes in view. With little height left (the keyboard is up) the strip steps aside.
- **The composer** is a row: a button that sends the board (O7's rules), a field, and Send. The field is 16px so the browser
  does not zoom the page when it takes focus, and grows to about four lines. **Enter adds a line**; Send sends, because
  Shift+Enter is out of reach of a phone's keyboard.
- **A citation chip** in a reply shows the Board with that node selected and in view.
- Everything O6 does stays: Retry, proposals, example prompts, the four modes, the single announcement of a finished reply.

### Behavior

```
Send                        → ask; the reply streams in below
Enter                       → a new line (Send sends)
Tap a chip in the strip     → open that node (P6)
Open board                  → show the Board, with what was cited in view
Tap a citation chip         → show the Board, that node selected and in view
```

### States
See `state-matrix.md`, row P4.

### Acceptance criteria
- Given a finished reply that cites nodes, when the strip renders, then it shows those nodes and what they connect to, the cited
  ones marked, and says how many were cited.
- Given a reply that cites nothing, then the strip is the whole board as an outline.
- Given the composer, when text is typed, then the field is 16px, grows to four lines, and Enter adds a line.
- Given the board button, when it is used, then it sends the board under O7's rules and the reply streams in on this screen.

---

# P5 — Find

Search, and an index of the board by type. It is the way into Trace for any node, and where the gaps show.

### Layout

```
 Find
 ┌──────────────────────────────────┐
 │ ⌕  Find a node to trace          │
 └──────────────────────────────────┘
 (All 16) Goals Strategies Campaigns …      one row, scrolls sideways
 GOALS
   Vayn: 500 orders/month by Q4        7 under it
 STRATEGIES · CAMPAIGNS · CONTENT
   Reel: 3 ways to style linen            trace →
 NOT CONNECTED TO A GOAL
   IG reach down 30% since the algo…      no links
```

- **Nothing typed:** the nodes that reach a goal, grouped by type in the order of the chain, then, in a group of its own, what
  no chain of `serves` edges reaches a goal from — each node once, saying why (`no links`, `relates only`, `no goal above it`).
- **A type chosen:** every node of it, connected or not. **Something typed:** the matches, titles before bodies, as search does
  on a desktop, narrowed by the type chosen. Enter takes the first match.
- **Choosing a node** that reaches a goal shows Trace with its whole chain lined up (a goal: Trace on that goal); one that does
  not opens its detail.
- "Reaches a goal" is the walk up `serves` edges that Trace uses, so the two never disagree.

### Behavior

```
Type                        → the matches replace the index
Tap a type                  → only that type
Enter                       → choose the first match
Tap a row                   → trace it, or open it
```

### States
See `state-matrix.md`, row P5.

### Acceptance criteria
- Given nothing typed, when Find renders, then nodes are grouped by type and what no goal is above is last.
- Given a node that reaches a goal, when it is chosen, then Trace opens with its chain lined up; given one that does not, then its detail opens.
- Given text that matches nothing, then Find says so and offers to make a note with that title.
- Given the field, then it is 16px.

---

# P6 — Add and node sheets

The two bottom sheets: what the Add tab opens, and a node's detail.

### Layout

```
 ┌─ handle ─────────────────────┐
 │ Add to the board          ✕  │
 │ ┌ Goal ──────┐ ┌ Strategy ──┐│
 │ ┌ Campaign ──┐ ┌ Content ───┐│
 │ ┌ Note ──────┐               │
 │ ┌ Import a file ─────────────┐│
 │ ┌ Draft in chat ─────────────┐│
 └──────────────────────────────┘
```

- **The Add sheet** offers a node of each type (the type is chosen now; the desktop's menu makes a note and asks later), each
  saying what it is for; a file to bring in; and a draft to ask the assistant for (off while a reply is coming). A type makes the
  node in the middle of the board and opens it with its title ready to be typed. Escape, a tap on the scrim, Close and a pull down
  on the handle all close it and make nothing; focus goes back to the Add tab.
- **Adding what serves a card.** An empty row in Trace offers to add what it expects ("Add a strategy" …). It makes a node of that
  type and connects it so that it **serves** the card above, as one step to undo, and opens it to be named. If only the connection
  fails the node stays and the toast offers the connection again.
- **A node's detail** (S4) is a bottom sheet: rounded at the top, a handle, a scrim, never taller than 92% of the screen. The handle
  pulls it down; Escape, the scrim, Close and the browser's Back close it. **Show on board** shows the Board with the node selected
  and in view; **Ask about it** shows Chat with a question about the node waiting in the composer, not sent. Every button in it is
  at least 40px, and its fields 16px.

### Behavior

```
Add tab                     → open the sheet
Tap a type                  → make a node of it in the middle of the board; open it, title focused
Tap an empty row's button   → make a node that serves the card above; one Undo takes both away
Pull the handle down        → close the sheet
Show on board / Ask about it→ go to the Board, or to Chat with a question waiting
```

### States
See `state-matrix.md`, row P6.

### Acceptance criteria
- Given the Add tab, when it is used, then a sheet offers Goal, Strategy, Campaign, Content and Note, Import a file, and Draft in chat.
- Given an empty row in Trace, when its button is used, then a node of that type is made, connected so that it serves the card above,
  and one Undo takes both away.
- Given a node's detail on a phone, then it is a sheet from the bottom, and dragging its handle down, Escape, the scrim, Close and Back all close it.
- Given Show on board, then the Board is shown with that node selected; given Ask about it, then Chat has the question waiting.

---

## Component specs

### `NodeCard`
```
Anatomy   — type chip · title · body excerpt (2 lines, clamped) · file badge ·
            annotation badge · connection badge · connect handle (4 sides)
Data      — Node + derived { fileCount, annotationCount, edgeCount }
Variants  — goal · strategy · campaign · content · asset · note
States    — default · hover · selected · multi-selected · connect-source ·
            connect-target-candidate · cited-by-chat · dragging · deleting
A11y      — role="button", accessible name = title + type, Enter opens detail,
            arrow keys nudge position by 8px when focused, focus ring always visible
Tokens    — --node-{type} for the chip and left border; surface from --bg-elevated;
            no raw hex
```

### `EdgeLine`
```
Anatomy   — path · arrowhead (serves only) · optional label · hit area (12px wider than stroke)
Data      — Edge + resolved endpoint positions
Variants  — serves (directional, arrowhead, --edge-serves) ·
            relates-to (plain, dashed, --edge-relates)
States    — default · hover · selected · endpoint-selected (emphasized) · pending (connect mode)
A11y      — not focusable on canvas; edges are reachable and removable from S4's connection
            list, which is the keyboard path
Tokens    — --edge-serves · --edge-relates · --border-strong
```

### `ChatMessage`
```
Anatomy   — role avatar · body · citation chips · proposal action · retry action · timestamp
Data      — ChatMessage
Variants  — user · assistant
States    — streaming · complete · error · proposal-pending · proposal-applied
A11y      — assistant messages announce via aria-live="polite" on completion, not per token;
            citation chips are buttons with the cited node's title as their name
Tokens    — --bg-rail · --bg-elevated · --fg-primary · --fg-muted · --accent
```

### `TypeChip`
```
Anatomy   — color dot · label
Data      — NodeType
Variants  — 6, one per type
States    — static · interactive (in S4's type picker) · selected
A11y      — never color-alone; the label is always present
Tokens    — --node-{type}
```

### `Toolbar`
```
Anatomy   — add · connect · search · auto-arrange · fit · zoom in/out
Data      — { nodeCount, connectMode, canUndo }
Variants  — full (labels + icons) · compact (icons only, < 900px)
States    — default · active (connect mode) · disabled (fit + auto-arrange when board empty)
A11y      — every control has a visible or aria label plus its keyboard shortcut in the
            tooltip; full keyboard reachability in DOM order
Tokens    — --bg-panel · --border-subtle · --accent · --focus-ring
```

### `Toast`
```
Anatomy   — message · optional undo action · dismiss
Data      — { message, actionLabel?, onAction?, durationMs }
Variants  — info · success · warn · danger
States    — entering · visible · action-taken · dismissed
A11y      — role="status" for info/success, role="alert" for warn/danger; never the sole
            channel for an error that has a form field
Tokens    — --bg-elevated · --ok · --warn · --danger
```

---

## Global rules

- Every error message says **what failed and what to do**. `not-found` and `server error` are
  never the same message.
- Every destructive action is either confirmed or undoable. Never both absent.
- Focus is never removed, only restyled. Keyboard reaches every action.
- No raw hex outside `tokens.css`. No inline colors.
- Motion respects `prefers-reduced-motion`: auto-arrange and pans become instant, and on a phone a sheet
  does not rise and a row goes to its card at once.
- On a phone every control is a target at least 40px across (the tab bar's 44px), every text field is at least
  16px, and a control that can't be used says why when it is tapped.
