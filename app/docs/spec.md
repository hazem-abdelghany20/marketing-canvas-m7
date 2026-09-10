# Marketing Canvas — Spec

> Frontend-only build. No server, no external integrations. All persistence is local; all
> chat responses are mocked. The seams where a backend attaches are marked **[SEAM]**.

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

Single actor. No admin, no collaborator, no viewer, no sharing. A multi-user version is a
different spec.

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

**Cut, off-path:** settings/profile, onboarding tour, node-type manager, sharing, export,
Notion/Drive sync. Each is a v2 file, not a v1 omission by accident.

---

## Data model

```ts
type NodeType = 'goal' | 'strategy' | 'campaign' | 'content' | 'asset' | 'note'
type EdgeKind = 'serves' | 'relates-to'

User        = { id, name, email, avatarUrl }
Board       = { id, name, viewport: { x, y, zoom } }
Node        = { id, type: NodeType, title, body, fileIds: string[],
                x, y, createdAt, updatedAt }
Edge        = { id, fromId, toId, kind: EdgeKind, label?: string }
Annotation  = { id, nodeId, body, createdAt }
FileRef     = { id, name, mime, sizeBytes, objectUrl, thumbUrl? }
ChatMessage = { id, role: 'user' | 'assistant', content, status,
                citedNodeIds: string[], proposal?: Proposal }
Proposal    = { kind: 'create-node' | 'create-edge', payload: Partial<Node> | Partial<Edge> }
```

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

**[SEAM]** Persistence is `localStorage` behind a `store/` module with an async interface, so
swapping in a real API is one file. Uploaded files become `URL.createObjectURL` blobs and do
not survive a hard reload — the file *record* persists, the blob does not, and the asset node
renders its `file-missing` state.

---

## Dependency manifest

Tickets may not add dependencies outside this list.

```
react · react-dom · typescript · vite
@xyflow/react        — canvas: nodes, edges, pan, zoom, selection
zustand              — app state
react-router-dom     — routing
tailwindcss          — styling (tokens in tailwind.config)
lucide-react         — icons
vitest · @testing-library/react · playwright  — tests
```

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
Dummy auth: any well-formed email + password ≥ 8 chars succeeds. **[SEAM]**

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
- Given valid input, when submission succeeds, then the app navigates to `/` and a session
  exists in local storage.
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
Dummy: any input passing validation succeeds and creates a session + an empty board. **[SEAM]**

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
Accepted: images, PDF, plain text, markdown, common office formats. Files are held as object
URLs. **[SEAM]**

**O3 — Connect mode**
```
Click [Connect] or press C   → enter connect mode; cursor changes; canvas dims non-node areas
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

**[SEAM]** All three come from `src/mocks/chat.ts`. One module replacement wires a real model.

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
- Motion respects `prefers-reduced-motion`: auto-arrange and pans become instant.
