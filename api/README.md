# Marketing Canvas — API

The backend for the Marketing Canvas app. Run it locally, build your frontend against it.

You do not need to read the server code. Everything you need is on this page.

---

## Run it

```bash
npm start
```

Serves on **`http://localhost:4000`**. No `npm install` — there are no dependencies. Node 18+.

### Tests

```bash
npm test
```

Spawns the server on a free port with a throwaway data directory, so your own board is never
touched. Zero dependencies — Node's built-in test runner.

---

Data persists to disk between restarts. To wipe it back to the seed:

```bash
curl http://localhost:4000/__reset
```

### Demo account

```
demo@marketingcanvas.dev
password123
```

This account has a seeded board — 16 nodes, 13 connections, 3 annotations. Develop against it.
Any account you create yourself starts with an **empty** board.

---

## Conventions

- All requests and responses are JSON. Send `Content-Type: application/json` on writes.
- Every endpoint except `/health`, `/__reset`, `/auth/signup` and `/auth/login` needs a token:
  ```
  Authorization: Bearer <token>
  ```
- Timestamps are ISO 8601 UTC strings.
- Errors always have this shape:
  ```json
  { "error": { "code": "edge_exists", "message": "Those two nodes are already connected…", "field": "toId" } }
  ```
  `code` is stable and safe to branch on. `message` is written for humans — you can show it
  directly. `field` is present only when the error belongs to one form field.

---

## Types

```ts
type NodeType = 'goal' | 'strategy' | 'campaign' | 'content' | 'asset' | 'note'
type EdgeKind = 'serves' | 'relates-to'

User       = { id, name, email, avatarUrl }
Board      = { id, name, viewport: { x, y, zoom } }
Node       = { id, type: NodeType, title, body, fileIds: string[],
               x, y, createdAt, updatedAt }
Edge       = { id, fromId, toId, kind: EdgeKind, label: string | null }
Annotation = { id, nodeId, body, createdAt }
FileRef    = { id, name, mime, sizeBytes, thumbUrl, createdAt }

InkTool     = 'pen' | 'highlighter'
MarkVariant = 'sticky' | 'text'

Stroke  = { id, tool: InkTool, color: string, width: number,
            points: number[], createdAt }
Mark    = { id, variant: MarkVariant, x, y, body: string,
            color: string | null, createdAt, updatedAt }
Pin     = { id, x, y, resolved: boolean, createdAt, comments: Comment[] }
Comment = { id, body: string, createdAt,
            author: { id, name, avatarUrl } }
```

**`points` is flat.** `[x0, y0, x1, y1, …]`, not an array of objects. At least two points.
Feed it straight to an SVG path builder.

**Sticky notes and board text are the same thing.** One `Mark` entity, two `variant`s. They
differ only in whether a card is painted behind the text.

**An edge is stored once and rendered on both endpoints.** `GET /edges` returns each edge a
single time. A node's *Serves* list is the edges where it is `fromId`; its *Served by* list is
the edges where it is `toId`. Do not create two edges to get both directions.

---

## Auth

### `POST /auth/signup`
```json
{ "name": "Ada", "email": "ada@example.com", "password": "at-least-8" }
```
`201` → `{ token, user, board }`. The new board has zero nodes.

| Failure | Status | code |
|---|---|---|
| Malformed email | 422 | `invalid_email` |
| Password under 8 chars | 422 | `weak_password` |
| Address already registered | 409 | `email_taken` |

`taken@example.com` always returns `email_taken`, so you can build that path on demand.

### `POST /auth/login`
```json
{ "email": "demo@marketingcanvas.dev", "password": "password123" }
```
`200` → `{ token, user }` · `401 bad_credentials` · `422 weak_password`

### `POST /auth/logout`
`204`. Invalidates the token.

### `GET /me`
`200` → `{ user }` · `401 invalid_token`

---

## Board

### `GET /board`
`200` → `Board`

### `PATCH /board`
```json
{ "name": "Q4 planning", "viewport": { "x": -120, "y": 40, "zoom": 0.8 } }
```
`200` → the updated `Board`. Both fields optional. Debounce viewport writes — do not send one
per animation frame.

---

## Nodes

| | |
|---|---|
| `GET /nodes` | `200` → `Node[]` |
| `POST /nodes` | `201` → `Node` |
| `GET /nodes/:id` | `200` → `Node` · `404 node_not_found` |
| `PATCH /nodes/:id` | `200` → `Node` · `404 node_not_found` |
| `DELETE /nodes/:id` | `204` · `404 node_not_found` |

**Create** requires `type`, `x`, `y`. `title` defaults to `"Untitled"`, `body` to `""`.

```json
{ "type": "content", "title": "Reel: linen care", "x": 320, "y": 140 }
```

**Update** takes any subset of `type`, `title`, `body`, `fileIds`, `x`, `y`.

**Delete cascades.** Removing a node also removes every edge touching it and every annotation
on it. The API returns `204` with no body — if you want undo, hold the deleted objects client-side
and POST them back.

| Failure | Status | code |
|---|---|---|
| `type` not one of the six | 422 | `invalid_type` |
| `x` or `y` missing / not a number | 422 | `invalid_field` |

---

## Edges

| | |
|---|---|
| `GET /edges` | `200` → `Edge[]` |
| `POST /edges` | `201` → `Edge` |
| `DELETE /edges/:id` | `204` · `404 edge_not_found` |

```json
{ "fromId": "nd_con_linenstyle", "toId": "nd_cmp_linen", "kind": "serves", "label": null }
```

| Failure | Status | code |
|---|---|---|
| `fromId === toId` | 422 | `self_edge` |
| Connection already exists | 409 | `edge_exists` |
| Either node missing | 404 | `node_not_found` |
| `kind` not `serves` / `relates-to` | 422 | `invalid_kind` |

`serves` is directional and duplicate-checked in one direction. `relates-to` is undirected —
A→B and B→A both count as the same connection.

---

## Annotations

| | |
|---|---|
| `GET /nodes/:id/annotations` | `200` → `Annotation[]` |
| `POST /nodes/:id/annotations` | `201` → `Annotation` |
| `DELETE /annotations/:id` | `204` · `404 annotation_not_found` |

```json
{ "body": "Reshoot the hook at 0:02." }
```

An empty or whitespace-only `body` is `422 invalid_field`.

---

## Files

**This API stores file *metadata* only. It never receives the bytes.**

Keep the blob in the browser (`URL.createObjectURL`) and register its metadata here. On reload
the record comes back and the blob does not — that is the `file-missing` state, and it is
deliberate.

| | |
|---|---|
| `GET /files` | `200` → `FileRef[]` |
| `POST /files` | `201` → `FileRef` |
| `DELETE /files/:id` | `204` · `404 file_not_found` |

```json
{ "name": "vayn-lookbook.pdf", "mime": "application/pdf", "sizeBytes": 4182339 }
```

| Failure | Status | code |
|---|---|---|
| Over 25MB | 413 | `file_too_large` |
| Unsupported type | 415 | `unsupported_type` |

Accepted: any `image/*`, PDF, plain text, markdown, and common office formats.

Deleting a file also removes its id from every node's `fileIds`.

---

## Strokes

The whiteboard ink layer. Strokes sit above the graph: they have board coordinates but no
node relationships. Deleting a node never deletes ink drawn near it.

| | |
|---|---|
| `GET /strokes` | `200` → `Stroke[]` |
| `POST /strokes` | `201` → `Stroke` |
| `DELETE /strokes` | `204`. Clears **every** stroke on the board — this backs the dock's clear-ink action. |
| `DELETE /strokes/:id` | `204` · `404 stroke_not_found` |

```json
{ "tool": "pen", "color": "#a8674f", "width": 3, "points": [10, 10, 20, 24] }
```

| Failure | Status | code |
|---|---|---|
| `tool` not `pen` / `highlighter` | 422 | `invalid_tool` |
| `points` not a flat array of ≥2 finite x,y pairs | 422 | `invalid_field` |
| `color` missing, or `width` not a number | 422 | `invalid_field` |

---

## Marks

Sticky notes and board text. **One entity, two variants** — they differ only in whether a
card is painted behind the text.

| | |
|---|---|
| `GET /marks` | `200` → `Mark[]` |
| `POST /marks` | `201` → `Mark` |
| `PATCH /marks/:id` | `200` → `Mark` · `404 mark_not_found` |
| `DELETE /marks/:id` | `204` · `404 mark_not_found` |

```json
{ "variant": "sticky", "x": 40, "y": 60, "body": "Reshoot the hook" }
```

**Create** requires `variant`, `x`, `y`. `body` defaults to `""` and `color` to `null` — you
drop a sticky and then type into it, so an empty body is not an error.
**Update** takes any subset of `variant`, `x`, `y`, `body`, `color`.

| Failure | Status | code |
|---|---|---|
| `variant` not `sticky` / `text` | 422 | `invalid_variant` |
| `x` or `y` missing / not a number | 422 | `invalid_field` |

---

## Pins and comments

Comment threads pinned to a point on the board.

| | |
|---|---|
| `GET /pins` | `200` → `Pin[]`, each with its `comments` inlined |
| `POST /pins` | `201` → `Pin`, unresolved, with an empty thread |
| `PATCH /pins/:id` | `200` → `Pin` · `404 pin_not_found`. Takes `x`, `y`, `resolved`. |
| `DELETE /pins/:id` | `204` · `404 pin_not_found`. Cascades to its comments. |
| `POST /pins/:id/comments` | `201` → `Comment` · `404 pin_not_found` |
| `DELETE /comments/:id` | `204` · `404 comment_not_found` |

```json
{ "x": 220, "y": 340 }
{ "body": "Hook lands late." }
```

Comments are returned **inlined** on each pin, oldest first — you never fetch a thread
separately. `author` is embedded, not a reference; there is no `/authors` endpoint. A comment
you post is attributed to the signed-in user.

**Attribution is not collaboration.** Comments carry an author so threads read correctly, but
a board still belongs to one account and cannot be shared. The demo board seeds comments from
two other names to show what a real thread looks like; those people are not users and cannot
sign in.

| Failure | Status | code |
|---|---|---|
| `x` or `y` missing / not a number | 422 | `invalid_field` |
| `resolved` not a boolean | 422 | `invalid_field` |
| Empty or whitespace-only comment `body` | 422 | `invalid_field` |

---

## Chat

### `POST /chat` — server-sent events

```json
{ "message": "what is happening with linen?" }
```

```json
{ "message": "how is the board doing?", "mode": "reasoner" }
```

`mode` is optional and defaults to `auto`, which picks from your message exactly as before.
Accepted: `auto`, `generator`, `librarian`, `reasoner`. Anything else is `422 invalid_mode`,
raised *before* the stream opens — so it arrives as normal JSON, not as an `error` event.

`operator` is **not** settable. It triggers on naming two nodes, which `auto` detects;
forcing it before those nodes are named would leave you in a mode that cannot act.

The response is a **stream**, not JSON. `Content-Type: text/event-stream`. Read it with
`fetch` + a reader, or `EventSource` if you move the token to a query param.

Four event types, in order:

```
event: start   data: { "mode": "librarian" }
event: token   data: { "token": "3 " }          ← repeats, ~20ms apart
event: done    data: { "citedNodeIds": [...], "proposal": {...} | null }
```

and instead of `done`, on failure:

```
event: error   data: { "code": "stream_failed", "message": "The response was interrupted…" }
```

Concatenate every `token` in order to get the message body. It is markdown.

**Four response modes.** Three are chosen from your message; `reasoner` is only ever
requested explicitly:

| Mode | Triggered by | You get back |
|---|---|---|
| `generator` | message starts with write / draft / create / make / generate | text + a `create-node` proposal |
| `operator` | message contains connect / link / attach / relate / join **and** names two nodes | text + a `create-edge` proposal |
| `librarian` | anything else | text + `citedNodeIds` to highlight on the canvas |
| `reasoner` | `mode: "reasoner"` only — never auto-detected | a structural audit of the board + `citedNodeIds` for every node it names. Never a proposal. |

**Proposals** are suggestions, not writes. Nothing is created until you call `POST /nodes` or
`POST /edges` yourself with the payload.

```json
{ "kind": "create-node", "payload": { "type": "content", "title": "…", "body": "…" } }
{ "kind": "create-edge", "payload": { "fromId": "nd_…", "toId": "nd_…", "kind": "serves" } }
```

`create-edge` proposals always point up the chain — content → campaign → strategy → goal —
regardless of the order you named the nodes in.

**To test the failure path**, put `__fail` anywhere in your message. The stream starts, emits a
few tokens, then sends `error` and closes.

---

## Testing your error states

You do not have to break things by hand.

| | |
|---|---|
| `X-Mock-Latency: 1500` | Delay any response by N ms (max 10000). For loading states. |
| `X-Mock-Fail: 500` | Force any endpoint to return that status with `code: forced_failure`. |

Both also work as query params: `?__latency=1500`, `?__fail=503`.

```bash
curl http://localhost:4000/nodes -H "Authorization: Bearer $TOKEN" -H "X-Mock-Fail: 503"
```

---

## Utility

| | |
|---|---|
| `GET /health` | `200` → `{ ok, nodes }`. No auth. |
| `GET /__reset` | Wipes all data back to the seed. No auth. |

---

## Quick start

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@marketingcanvas.dev","password":"password123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl http://localhost:4000/nodes -H "Authorization: Bearer $TOKEN"
```

CORS is open to every origin, so a Vite dev server on `:5173` works with no proxy.
