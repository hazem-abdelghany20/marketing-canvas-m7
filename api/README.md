# Marketing Canvas — API

The backend for the Marketing Canvas app. Run it locally, build your frontend against it.

You do not need to read the server code. Everything you need is on this page.

---

## Run it

```bash
npm start
```

Serves on **`http://localhost:4000`**. No `npm install` — there are no dependencies. Node 18+.

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
```

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

## Chat

### `POST /chat` — server-sent events

```json
{ "message": "what is happening with linen?" }
```

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

**Three response modes**, chosen from your message:

| Mode | Triggered by | You get back |
|---|---|---|
| `generator` | message starts with write / draft / create / make / generate | text + a `create-node` proposal |
| `operator` | message contains connect / link / attach / relate / join **and** names two nodes | text + a `create-edge` proposal |
| `librarian` | anything else | text + `citedNodeIds` to highlight on the canvas |

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
