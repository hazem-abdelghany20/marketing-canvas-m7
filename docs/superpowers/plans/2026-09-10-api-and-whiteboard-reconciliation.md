# API Reconciliation and Whiteboard Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four planning artifacts agree with each other, and extend the mock API with the whiteboard layer the design already draws.

**Architecture:** Three bodies of work in one plan. First the API grows four entity types (strokes, marks, pins, comments) and a chat mode override, each following the conventions already in `api/server.js` — same `route()` registration, same `ApiError` envelope, same per-board `ctx.user` scoping. Then the seed gains demo content so every new state renders on first run. Then the documentation is reconciled against what now exists: `spec.md` stops claiming to be frontend-only, `state-matrix.md` stops assuming localStorage, and seven new tickets describe the whiteboard build.

**Tech Stack:** Node 22, zero runtime dependencies. Tests use the built-in `node:test` runner and `node:assert/strict` — no test framework is added, because `api/`'s zero-dependency promise is part of its contract.

**Spec:** `docs/superpowers/specs/2026-09-10-whiteboard-layer-design.md`

## Global Constraints

- **`api/` has zero runtime dependencies and must keep zero.** No npm installs. `node:test` and `node:assert/strict` are built in and are the only test tooling.
- **Node 18+ is the stated floor** (`api/package.json` → `engines.node: ">=18"`). Do not use syntax newer than Node 18 supports.
- **Every new endpoint is scoped to `ctx.user`.** Rows carry `boardId` internally and it is stripped from responses by `shape()`.
- **Every error uses the existing envelope:** `{ error: { code, message, field } }`. `code` is stable and branchable; `message` is written for a human and may be shown directly; `field` is present only when the error belongs to one form field.
- **Error copy always says what failed AND what to do.** This rule governs `state-matrix.md` and every `ApiError` message added here.
- **Timestamps are ISO 8601 UTC**, produced by the existing `now()` helper.
- **Ids use the existing `id(prefix)` helper.** New prefixes: `stk` (stroke), `mrk` (mark), `pin` (pin), `cmt` (comment).
- **No new npm packages anywhere in this plan.** The frontend dependency manifest in `spec.md` is not touched.
- **This plan does not write any frontend code.** Tickets 001–022 remain separate future work; this plan only writes the ticket *files*.

---

## One deliberate deviation from the spec

The spec's **D7** says "Reconcile the docs first, in one commit, before ticket 001."
This plan reconciles the docs **last**, in five commits, and still before ticket 001.

The reason is that Task 7 documents endpoints and Task 8 points `spec.md` at them. Doing
that before the endpoints exist means writing a contract from memory and correcting it
afterwards — and Task 7 Step 5 and the Final Verification both cross-check the docs
against `server.js`, which is only possible once the server has the routes. The API is
also the risk: if an entity shape turns out wrong under test, it is far cheaper to learn
that before three documents describe it.

D7's actual intent — that no frontend ticket starts against contradictory documents — is
preserved exactly. Every task here lands before ticket 001.

The "one commit" half is dropped on purpose: eleven commits, each with its own passing
tests, is a better history than one commit that touches four documents and a server.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `api/test/helpers.mjs` | Spawns the server on a free port with an isolated data dir; provides `api()` request helper and `login()`. Shared by every test file. |
| `api/test/strokes.test.mjs` | Stroke CRUD and clear-all. |
| `api/test/marks.test.mjs` | Mark CRUD for both variants. |
| `api/test/pins.test.mjs` | Pin CRUD, comment posting, cascade on delete. |
| `api/test/chat.test.mjs` | Mode override validation and reasoner output. |
| `api/test/seed.test.mjs` | Asserts the demo board seeds the whiteboard layer. |
| `app/backlog/016-whiteboard-dock.md` … `022-send-board-to-assistant.md` | Seven new tickets. |

**Modified:**

| Path | Change |
|---|---|
| `api/server.js` | Data-dir env override; four route groups; chat mode override; reasoner response builder. |
| `api/seed.js` | Collaborator authors; seeded strokes, marks, pins, comments. |
| `api/package.json` | `test` script. |
| `api/README.md` | Documents every new endpoint, code and parameter. |
| `app/docs/spec.md` | Banner, `[SEAM]`s, Actors, Data model, Screen inventory, S3 behavior. |
| `app/docs/state-matrix.md` | localStorage error cells rewritten; O7/O8/O9 sections added. |
| `app/backlog/002-store-and-persistence.md` | localStorage store → API client + cache. |
| `app/backlog/003-auth-screens.md` | Dummy auth → real endpoints and real error codes. |

Route groups go in `api/server.js` in the order strokes → marks → pins, placed after the `files` group and before the `chat` group, each under the same `// --- name ---` banner comment style the file already uses.

---

## Task 1: Test harness and hermetic data directory

The API has no tests today. Every later API task needs a running server, an
authenticated client, and a data directory that does not clobber the developer's
own `.data/`. Build that first.

**Files:**
- Modify: `api/server.js:18` (the `DATA_DIR` constant)
- Modify: `api/package.json` (add a `test` script)
- Create: `api/test/helpers.mjs`
- Test: `api/test/smoke.test.mjs`

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces, all from `api/test/helpers.mjs`:
  - `startServer(): Promise<{ base: string, stop(): Promise<void> }>` — `base` is an origin like `http://127.0.0.1:41237` with no trailing slash.
  - `client(base: string, token?: string): (method, pathname, body?, headers?) => Promise<{ status: number, body: object|null }>`
  - `login(base: string): Promise<{ token: string, api: ReturnType<typeof client> }>` — logs in as the demo account.
  - `readSse(base: string, token: string, body: object): Promise<{ status, events: {event,data}[], text: string, body?: object }>` — for `POST /chat`, which streams and therefore cannot go through `client()`.

- [ ] **Step 1: Make the data directory overridable**

`api/server.js` hardcodes `DATA_DIR`, so tests would share the developer's board.
Change line 18 from:

```js
const DATA_DIR = path.join(__dirname, '.data')
```

to:

```js
const DATA_DIR = process.env.MC_DATA_DIR || path.join(__dirname, '.data')
```

Leave `DB_PATH` on the next line alone — it derives from `DATA_DIR` already.

- [ ] **Step 2: Write the harness**

Create `api/test/helpers.mjs`:

```js
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url))

/** Ask the OS for a free port, then release it. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** Boot a server on its own port with its own data dir. Always pair with stop(). */
export async function startServer() {
  const port = await freePort()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-api-'))
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), MC_DATA_DIR: dataDir },
    stdio: 'ignore',
  })

  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      const res = await fetch(`${base}/health`)
      if (res.ok) break
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`server did not come up on ${base} within 5s`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }

  return {
    base,
    async stop() {
      child.kill()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** JSON request helper. Returns parsed body, or null for 204. */
export function client(base, token) {
  return async function api(method, pathname, body, headers = {}) {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
}

export async function login(base) {
  const anon = client(base)
  const res = await anon('POST', '/auth/login', {
    email: 'demo@marketingcanvas.dev',
    password: 'password123',
  })
  if (res.status !== 200) throw new Error(`demo login failed: ${res.status}`)
  return { token: res.body.token, api: client(base, res.body.token) }
}

/**
 * POST /chat streams server-sent events, so it cannot go through client().
 * Buffers the whole stream, then splits it into events.
 */
export async function readSse(base, token, body) {
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (res.status !== 200) {
    return { status: res.status, body: raw ? JSON.parse(raw) : null, events: [], text: '' }
  }
  const events = raw
    .split('\n\n')
    .filter((chunk) => chunk.trim())
    .map((chunk) => ({
      event: /^event: (.+)$/m.exec(chunk)[1],
      data: JSON.parse(/^data: (.+)$/m.exec(chunk)[1]),
    }))
  const text = events.filter((e) => e.event === 'token').map((e) => e.data.token).join('')
  return { status: res.status, events, text }
}
```

- [ ] **Step 3: Write the failing smoke test**

Create `api/test/smoke.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login, client } from './helpers.mjs'

test('server boots with a seeded demo board and authenticates', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())

  const { api } = await login(server.base)

  const health = await api('GET', '/health')
  assert.equal(health.status, 200)
  assert.equal(health.body.ok, true)
  assert.equal(health.body.nodes, 16)

  const me = await api('GET', '/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, 'demo@marketingcanvas.dev')
})

test('an unauthenticated request is rejected with a branchable code', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())

  const anon = client(server.base)
  const res = await anon('GET', '/nodes')

  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'no_token')
})
```

- [ ] **Step 4: Add the test script**

In `api/package.json`, add to `scripts`:

```json
"test": "node --test test/*.test.mjs"
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd api && npm test`
Expected: PASS, 2 tests. If the boot times out, check that Step 1's `MC_DATA_DIR`
change was applied — without it the child writes to the shared `.data/`.

- [ ] **Step 6: Verify the isolation actually holds**

Run: `cd api && ls .data 2>/dev/null || echo "no shared .data written"`
Expected: either the developer's pre-existing `.data` unchanged, or the message.
The test run must not create or modify `api/.data`.

- [ ] **Step 7: Commit**

```bash
git add api/server.js api/package.json api/test/
git commit -m "test: add zero-dependency API test harness

Tests spawn the server on a free port with an isolated data dir, so they
never touch the developer's own board. MC_DATA_DIR makes that possible."
```

---

## Task 2: Strokes — the ink layer

**Files:**
- Modify: `api/server.js` (new route group after the `files` group, before `chat`)
- Test: `api/test/strokes.test.mjs`

**Interfaces:**
- Consumes: `startServer`, `login` from `api/test/helpers.mjs` (Task 1).
- Produces:
  - `Stroke = { id, tool: 'pen'|'highlighter', color: string, width: number, points: number[], createdAt: string }`
  - Endpoints `GET /strokes`, `POST /strokes`, `DELETE /strokes`, `DELETE /strokes/:id`
  - Error codes `invalid_tool` (422), `stroke_not_found` (404)
  - `db.strokes` — a top-level array on the database, which Task 6 seeds.

`points` is a **flat** `[x0, y0, x1, y1, …]` array, not an array of objects: it is
smaller on the wire and feeds an SVG path builder directly. Minimum length 4 (two
points) — a one-point stroke is not a stroke.

- [ ] **Step 1: Write the failing tests**

Create `api/test/strokes.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login } from './helpers.mjs'

const PEN = { tool: 'pen', color: '#a8674f', width: 3, points: [10, 10, 20, 24, 30, 18] }

test('a stroke round-trips through create and list', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const created = await api('POST', '/strokes', PEN)
  assert.equal(created.status, 201)
  assert.equal(created.body.tool, 'pen')
  assert.deepEqual(created.body.points, [10, 10, 20, 24, 30, 18])
  assert.match(created.body.id, /^stk_/)
  assert.ok(created.body.createdAt)
  assert.equal(created.body.boardId, undefined, 'boardId must be stripped from responses')

  const listed = await api('GET', '/strokes')
  assert.equal(listed.status, 200)
  assert.ok(listed.body.some((s) => s.id === created.body.id))
})

test('highlighter is accepted and any other tool is rejected', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const hi = await api('POST', '/strokes', { ...PEN, tool: 'highlighter' })
  assert.equal(hi.status, 201)

  const bad = await api('POST', '/strokes', { ...PEN, tool: 'crayon' })
  assert.equal(bad.status, 422)
  assert.equal(bad.body.error.code, 'invalid_tool')
  assert.equal(bad.body.error.field, 'tool')
})

test('malformed points are rejected', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  for (const points of [[10, 10], [10, 10, 20], 'nope', [10, 10, NaN, 5]]) {
    const res = await api('POST', '/strokes', { ...PEN, points })
    assert.equal(res.status, 422, `expected 422 for points ${JSON.stringify(points)}`)
    assert.equal(res.body.error.code, 'invalid_field')
    assert.equal(res.body.error.field, 'points')
  }
})

test('a single stroke can be erased', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const a = await api('POST', '/strokes', PEN)
  const b = await api('POST', '/strokes', PEN)

  const del = await api('DELETE', `/strokes/${a.body.id}`)
  assert.equal(del.status, 204)

  const listed = await api('GET', '/strokes')
  const ids = listed.body.map((s) => s.id)
  assert.ok(!ids.includes(a.body.id))
  assert.ok(ids.includes(b.body.id), 'erasing one stroke must not touch the others')

  const again = await api('DELETE', `/strokes/${a.body.id}`)
  assert.equal(again.status, 404)
  assert.equal(again.body.error.code, 'stroke_not_found')
})

test('clear-all removes every stroke on the board', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  await api('POST', '/strokes', PEN)
  await api('POST', '/strokes', { ...PEN, tool: 'highlighter' })

  const cleared = await api('DELETE', '/strokes')
  assert.equal(cleared.status, 204)

  const listed = await api('GET', '/strokes')
  assert.deepEqual(listed.body, [])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && node --test test/strokes.test.mjs`
Expected: FAIL. `POST /strokes` returns 404 `route_not_found`, so the first
assertion on status 201 fails.

- [ ] **Step 3: Implement the route group**

In `api/server.js`, immediately after the `files` route group and before the
`// --- chat (server-sent events) ---` banner, add:

```js
// --- strokes (whiteboard ink) -----------------------------------------------

const INK_TOOLS = ['pen', 'highlighter']

const strokesOf = (user) => db.strokes.filter((s) => s.boardId === user.boardId)

/** Ink is a flat [x0,y0,x1,y1,...] array — at least two points, all finite. */
function requirePoints(body) {
  const points = body.points
  const ok =
    Array.isArray(points) &&
    points.length >= 4 &&
    points.length % 2 === 0 &&
    points.every((n) => typeof n === 'number' && Number.isFinite(n))
  if (!ok) {
    throw bad(
      'invalid_field',
      'points must be a flat array of at least two x,y pairs, and every value must be a finite number.',
      'points',
    )
  }
  return points
}

route('GET', '/strokes', async (ctx) => ({
  status: 200,
  body: strokesOf(ctx.user).map((s) => shape(s)),
}))

route('POST', '/strokes', async (ctx) => {
  if (!INK_TOOLS.includes(ctx.body.tool)) {
    throw bad('invalid_tool', `tool must be one of: ${INK_TOOLS.join(', ')}.`, 'tool')
  }
  const stroke = {
    id: id('stk'),
    boardId: ctx.user.boardId,
    tool: ctx.body.tool,
    color: requireString(ctx.body, 'color', { label: 'Stroke colour', max: 32 }),
    width: requireNumber(ctx.body, 'width'),
    points: requirePoints(ctx.body),
    createdAt: now(),
  }
  db.strokes.push(stroke)
  saveDb()
  return { status: 201, body: shape(stroke) }
})

// Registered before /strokes/:id — matchRoute compares segment counts, so the
// two never collide, but keeping them adjacent makes the pair obvious.
route('DELETE', '/strokes', async (ctx) => {
  db.strokes = db.strokes.filter((s) => s.boardId !== ctx.user.boardId)
  saveDb()
  return { status: 204 }
})

route('DELETE', '/strokes/:id', async (ctx) => {
  const stroke = db.strokes.find((s) => s.id === ctx.params.id && s.boardId === ctx.user.boardId)
  if (!stroke) {
    throw new ApiError(
      404,
      'stroke_not_found',
      `No stroke with id ${ctx.params.id} on this board. It may already be erased — reload the board.`,
    )
  }
  db.strokes = db.strokes.filter((s) => s.id !== stroke.id)
  saveDb()
  return { status: 204 }
})
```

- [ ] **Step 4: Give the database a strokes array**

`db.strokes` must exist or `strokesOf` throws on a fresh seed. In `api/seed.js`,
inside the object returned by `buildSeed()`, add `strokes: [],` immediately after
the `files:` line. Task 6 replaces this empty array with real seeded ink.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && node --test test/strokes.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole suite**

Run: `cd api && npm test`
Expected: PASS, 7 tests. Nothing in Task 1 regressed.

- [ ] **Step 7: Commit**

```bash
git add api/server.js api/seed.js api/test/strokes.test.mjs
git commit -m "feat(api): add stroke endpoints for the whiteboard ink layer"
```

---

## Task 3: Marks — stickies and board text

One entity, two variants. A sticky and a board-text block are both a positioned
text box; they differ only in whether a card is painted behind the text. Two
tools in the UI, one entity here.

**Files:**
- Modify: `api/server.js` (route group after `strokes`)
- Modify: `api/seed.js` (add `marks: []`)
- Test: `api/test/marks.test.mjs`

**Interfaces:**
- Consumes: `startServer`, `login` from `api/test/helpers.mjs`.
- Produces:
  - `Mark = { id, variant: 'sticky'|'text', x: number, y: number, body: string, color: string|null, createdAt, updatedAt }`
  - `GET /marks`, `POST /marks`, `PATCH /marks/:id`, `DELETE /marks/:id`
  - Error codes `invalid_variant` (422), `mark_not_found` (404)
  - `findMark(user, markId)` — internal helper, mirrors the existing `findNode`.

`body` is **not** required on create: you drop a sticky and then type into it. An
abandoned empty sticky is the client's problem to discard, not the API's to reject.

- [ ] **Step 1: Write the failing tests**

Create `api/test/marks.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login } from './helpers.mjs'

test('both variants can be created, and an unknown variant is rejected', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const sticky = await api('POST', '/marks', { variant: 'sticky', x: 40, y: 60, body: 'Reshoot the hook' })
  assert.equal(sticky.status, 201)
  assert.equal(sticky.body.variant, 'sticky')
  assert.equal(sticky.body.body, 'Reshoot the hook')
  assert.match(sticky.body.id, /^mrk_/)
  assert.equal(sticky.body.boardId, undefined)

  const text = await api('POST', '/marks', { variant: 'text', x: 0, y: 0 })
  assert.equal(text.status, 201)
  assert.equal(text.body.body, '', 'body defaults to empty — you type after dropping')
  assert.equal(text.body.color, null)

  const nope = await api('POST', '/marks', { variant: 'banner', x: 0, y: 0 })
  assert.equal(nope.status, 422)
  assert.equal(nope.body.error.code, 'invalid_variant')
  assert.equal(nope.body.error.field, 'variant')
})

test('x and y are required and must be numbers', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const res = await api('POST', '/marks', { variant: 'sticky', x: 'left', y: 0 })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'invalid_field')
  assert.equal(res.body.error.field, 'x')
})

test('a mark can be moved and edited, and updatedAt advances', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const made = await api('POST', '/marks', { variant: 'sticky', x: 10, y: 10, body: 'first' })
  await new Promise((r) => setTimeout(r, 5))

  const moved = await api('PATCH', `/marks/${made.body.id}`, { x: 99, y: 120, body: 'second' })
  assert.equal(moved.status, 200)
  assert.equal(moved.body.x, 99)
  assert.equal(moved.body.y, 120)
  assert.equal(moved.body.body, 'second')
  assert.equal(moved.body.createdAt, made.body.createdAt, 'createdAt is immutable')
  assert.notEqual(moved.body.updatedAt, made.body.updatedAt)
})

test('a missing mark reports mark_not_found on read, patch and delete', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const patch = await api('PATCH', '/marks/mrk_nope', { x: 1 })
  assert.equal(patch.status, 404)
  assert.equal(patch.body.error.code, 'mark_not_found')

  const del = await api('DELETE', '/marks/mrk_nope')
  assert.equal(del.status, 404)
  assert.equal(del.body.error.code, 'mark_not_found')
})

test('a deleted mark leaves the others alone', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const a = await api('POST', '/marks', { variant: 'sticky', x: 1, y: 1 })
  const b = await api('POST', '/marks', { variant: 'text', x: 2, y: 2 })

  assert.equal((await api('DELETE', `/marks/${a.body.id}`)).status, 204)

  const listed = await api('GET', '/marks')
  const ids = listed.body.map((m) => m.id)
  assert.ok(!ids.includes(a.body.id), 'the deleted mark is gone')
  assert.ok(ids.includes(b.body.id), 'deleting one mark must not touch the others')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && node --test test/marks.test.mjs`
Expected: FAIL with 404 `route_not_found` on `POST /marks`.

- [ ] **Step 3: Implement the route group**

In `api/server.js`, after the `strokes` group:

```js
// --- marks (stickies and board text) ----------------------------------------

const MARK_VARIANTS = ['sticky', 'text']

const marksOf = (user) => db.marks.filter((m) => m.boardId === user.boardId)

function findMark(user, markId) {
  const mark = db.marks.find((m) => m.id === markId && m.boardId === user.boardId)
  if (!mark) {
    throw new ApiError(
      404,
      'mark_not_found',
      `No sticky or text mark with id ${markId} on this board. It may have been deleted — reload the board.`,
    )
  }
  return mark
}

route('GET', '/marks', async (ctx) => ({
  status: 200,
  body: marksOf(ctx.user).map((m) => shape(m)),
}))

route('POST', '/marks', async (ctx) => {
  if (!MARK_VARIANTS.includes(ctx.body.variant)) {
    throw bad('invalid_variant', `variant must be one of: ${MARK_VARIANTS.join(', ')}.`, 'variant')
  }
  const mark = {
    id: id('mrk'),
    boardId: ctx.user.boardId,
    variant: ctx.body.variant,
    x: requireNumber(ctx.body, 'x'),
    y: requireNumber(ctx.body, 'y'),
    body: typeof ctx.body.body === 'string' ? ctx.body.body.slice(0, 2000) : '',
    color: typeof ctx.body.color === 'string' ? ctx.body.color.slice(0, 32) : null,
    createdAt: now(),
    updatedAt: now(),
  }
  db.marks.push(mark)
  saveDb()
  return { status: 201, body: shape(mark) }
})

route('PATCH', '/marks/:id', async (ctx) => {
  const mark = findMark(ctx.user, ctx.params.id)
  if (ctx.body.variant !== undefined) {
    if (!MARK_VARIANTS.includes(ctx.body.variant)) {
      throw bad('invalid_variant', `variant must be one of: ${MARK_VARIANTS.join(', ')}.`, 'variant')
    }
    mark.variant = ctx.body.variant
  }
  if (ctx.body.x !== undefined) mark.x = requireNumber(ctx.body, 'x')
  if (ctx.body.y !== undefined) mark.y = requireNumber(ctx.body, 'y')
  if (typeof ctx.body.body === 'string') mark.body = ctx.body.body.slice(0, 2000)
  if (ctx.body.color !== undefined) {
    mark.color = typeof ctx.body.color === 'string' ? ctx.body.color.slice(0, 32) : null
  }
  mark.updatedAt = now()
  saveDb()
  return { status: 200, body: shape(mark) }
})

route('DELETE', '/marks/:id', async (ctx) => {
  const mark = findMark(ctx.user, ctx.params.id)
  db.marks = db.marks.filter((m) => m.id !== mark.id)
  saveDb()
  return { status: 204 }
})
```

- [ ] **Step 4: Give the database a marks array**

In `api/seed.js`, add `marks: [],` directly after the `strokes: [],` line added in
Task 2.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && node --test test/marks.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole suite**

Run: `cd api && npm test`
Expected: PASS, 12 tests.

- [ ] **Step 7: Commit**

```bash
git add api/server.js api/seed.js api/test/marks.test.mjs
git commit -m "feat(api): add mark endpoints for stickies and board text"
```

---

## Task 4: Pins and comments — the attributed threads

This is where the multi-actor decision becomes visible. Comments carry an
embedded author; the board is still single-owner. There is no sharing, no
members endpoint, and no presence.

**Files:**
- Modify: `api/server.js` (route group after `marks`)
- Modify: `api/seed.js` (add `pins: []`, `comments: []`)
- Test: `api/test/pins.test.mjs`

**Interfaces:**
- Consumes: `startServer`, `login` from `api/test/helpers.mjs`.
- Produces:
  - `Comment = { id, body: string, createdAt, author: { id, name, avatarUrl } }`
  - `Pin = { id, x, y, resolved: boolean, createdAt, comments: Comment[] }`
  - `GET /pins`, `POST /pins`, `PATCH /pins/:id`, `DELETE /pins/:id`, `POST /pins/:id/comments`, `DELETE /comments/:id`
  - Error codes `pin_not_found` (404), `comment_not_found` (404)
  - `shapePin(pin)` — inlines a pin's comments, ordered oldest first.

Comments are stored flat in `db.comments` with a `pinId`, and **inlined on read**.
Flat storage makes `DELETE /comments/:id` a one-liner; inlining on read means the
client never makes a second request to render a thread.

- [ ] **Step 1: Write the failing tests**

Create `api/test/pins.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login } from './helpers.mjs'

test('a pin is created unresolved with an empty thread', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 220, y: 340 })
  assert.equal(pin.status, 201)
  assert.match(pin.body.id, /^pin_/)
  assert.equal(pin.body.resolved, false)
  assert.deepEqual(pin.body.comments, [])
  assert.equal(pin.body.boardId, undefined)
})

test('comments attribute to the signed-in user and thread oldest first', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 10, y: 10 })

  const first = await api('POST', `/pins/${pin.body.id}/comments`, { body: 'Hook lands late.' })
  assert.equal(first.status, 201)
  assert.match(first.body.id, /^cmt_/)
  assert.equal(first.body.body, 'Hook lands late.')
  assert.equal(first.body.author.name, 'Demo')
  assert.ok('avatarUrl' in first.body.author)
  assert.equal(first.body.pinId, undefined, 'pinId is internal and must be stripped')

  await new Promise((r) => setTimeout(r, 5))
  await api('POST', `/pins/${pin.body.id}/comments`, { body: 'Agreed — recut it.' })

  const listed = await api('GET', '/pins')
  const thread = listed.body.find((p) => p.id === pin.body.id)
  assert.equal(thread.comments.length, 2)
  assert.equal(thread.comments[0].body, 'Hook lands late.')
  assert.equal(thread.comments[1].body, 'Agreed — recut it.')
})

test('an empty comment is rejected', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 1, y: 1 })
  const res = await api('POST', `/pins/${pin.body.id}/comments`, { body: '   ' })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'invalid_field')
  assert.equal(res.body.error.field, 'body')
})

test('a pin can be resolved, unresolved and moved', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 1, y: 1 })

  const resolved = await api('PATCH', `/pins/${pin.body.id}`, { resolved: true })
  assert.equal(resolved.status, 200)
  assert.equal(resolved.body.resolved, true)

  const reopened = await api('PATCH', `/pins/${pin.body.id}`, { resolved: false, x: 50 })
  assert.equal(reopened.body.resolved, false)
  assert.equal(reopened.body.x, 50)
})

test('deleting a pin cascades to its comments', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 1, y: 1 })
  const comment = await api('POST', `/pins/${pin.body.id}/comments`, { body: 'gone soon' })

  assert.equal((await api('DELETE', `/pins/${pin.body.id}`)).status, 204)

  const orphaned = await api('DELETE', `/comments/${comment.body.id}`)
  assert.equal(orphaned.status, 404)
  assert.equal(orphaned.body.error.code, 'comment_not_found')
})

test('a single comment can be deleted without touching the pin', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pin = await api('POST', '/pins', { x: 1, y: 1 })
  const a = await api('POST', `/pins/${pin.body.id}/comments`, { body: 'keep' })
  const b = await api('POST', `/pins/${pin.body.id}/comments`, { body: 'drop' })

  assert.equal((await api('DELETE', `/comments/${b.body.id}`)).status, 204)

  const listed = await api('GET', '/pins')
  const thread = listed.body.find((p) => p.id === pin.body.id)
  assert.equal(thread.comments.length, 1)
  assert.equal(thread.comments[0].id, a.body.id)
})

test('an unknown pin reports pin_not_found', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const res = await api('POST', '/pins/pin_nope/comments', { body: 'hello' })
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'pin_not_found')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && node --test test/pins.test.mjs`
Expected: FAIL with 404 `route_not_found` on `POST /pins`.

- [ ] **Step 3: Implement the route group**

In `api/server.js`, after the `marks` group:

```js
// --- pins and comments (attributed threads on the board) --------------------

const pinsOf = (user) => db.pins.filter((p) => p.boardId === user.boardId)

/** Comments live flat in db.comments and are inlined when a pin is read. */
function shapePin(pin) {
  const comments = db.comments
    .filter((c) => c.pinId === pin.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => shape(c, ['boardId', 'pinId']))
  return { ...shape(pin), comments }
}

function findPin(user, pinId) {
  const pin = db.pins.find((p) => p.id === pinId && p.boardId === user.boardId)
  if (!pin) {
    throw new ApiError(
      404,
      'pin_not_found',
      `No comment pin with id ${pinId} on this board. It may have been deleted — reload the board.`,
    )
  }
  return pin
}

route('GET', '/pins', async (ctx) => ({
  status: 200,
  body: pinsOf(ctx.user).map((p) => shapePin(p)),
}))

route('POST', '/pins', async (ctx) => {
  const pin = {
    id: id('pin'),
    boardId: ctx.user.boardId,
    x: requireNumber(ctx.body, 'x'),
    y: requireNumber(ctx.body, 'y'),
    resolved: false,
    createdAt: now(),
  }
  db.pins.push(pin)
  saveDb()
  return { status: 201, body: shapePin(pin) }
})

route('PATCH', '/pins/:id', async (ctx) => {
  const pin = findPin(ctx.user, ctx.params.id)
  if (ctx.body.x !== undefined) pin.x = requireNumber(ctx.body, 'x')
  if (ctx.body.y !== undefined) pin.y = requireNumber(ctx.body, 'y')
  if (ctx.body.resolved !== undefined) {
    if (typeof ctx.body.resolved !== 'boolean') {
      throw bad('invalid_field', 'resolved must be true or false.', 'resolved')
    }
    pin.resolved = ctx.body.resolved
  }
  saveDb()
  return { status: 200, body: shapePin(pin) }
})

route('DELETE', '/pins/:id', async (ctx) => {
  const pin = findPin(ctx.user, ctx.params.id)
  db.pins = db.pins.filter((p) => p.id !== pin.id)
  db.comments = db.comments.filter((c) => c.pinId !== pin.id)
  saveDb()
  return { status: 204 }
})

route('POST', '/pins/:id/comments', async (ctx) => {
  const pin = findPin(ctx.user, ctx.params.id)
  const comment = {
    id: id('cmt'),
    boardId: ctx.user.boardId,
    pinId: pin.id,
    body: requireString(ctx.body, 'body', { label: 'Comment' }),
    author: { id: ctx.user.id, name: ctx.user.name, avatarUrl: ctx.user.avatarUrl ?? null },
    createdAt: now(),
  }
  db.comments.push(comment)
  saveDb()
  return { status: 201, body: shape(comment, ['boardId', 'pinId']) }
})

route('DELETE', '/comments/:id', async (ctx) => {
  const comment = db.comments.find((c) => c.id === ctx.params.id && c.boardId === ctx.user.boardId)
  if (!comment) {
    throw new ApiError(
      404,
      'comment_not_found',
      `No comment with id ${ctx.params.id}. It may already be deleted — reopen the thread to see what is there now.`,
    )
  }
  db.comments = db.comments.filter((c) => c.id !== comment.id)
  saveDb()
  return { status: 204 }
})
```

- [ ] **Step 4: Give the database pin and comment arrays**

In `api/seed.js`, add `pins: [],` and `comments: [],` after the `marks: [],` line.

- [ ] **Step 5: Confirm the demo user's display name**

The comment attribution test asserts `author.name === 'Demo'` — verified against the current seed.

Run: `cd api && node -e "console.log(require('./seed').buildSeed().users[0].name)"`
If the name differs, correct the assertion in `api/test/pins.test.mjs` to the real
value rather than renaming the seeded user — the name is demo content, not a contract.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd api && node --test test/pins.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 7: Run the whole suite**

Run: `cd api && npm test`
Expected: PASS, 19 tests.

- [ ] **Step 8: Commit**

```bash
git add api/server.js api/seed.js api/test/pins.test.mjs
git commit -m "feat(api): add pin and comment endpoints with author attribution"
```

---

## Task 5: Chat mode override and the Reasoner

The design's composer offers a mode picker the API cannot serve, and a mode the
API does not implement. Both land here.

**Files:**
- Modify: `api/server.js` — `buildChatResponse` signature, new `buildReasonerResponse`, the `POST /chat` handler
- Test: `api/test/chat.test.mjs`

**Interfaces:**
- Consumes: `startServer`, `login`, `readSse` from `api/test/helpers.mjs`.
- Produces:
  - `POST /chat` accepts optional `mode: 'auto'|'generator'|'librarian'|'reasoner'`, default `'auto'`
  - Error code `invalid_mode` (422)
  - `edgesOf(user)` — internal helper, mirrors `nodesOf`
  - `buildChatResponse(message, nodes, edges, requested)` — **signature change**, two new parameters

`operator` is deliberately absent from the accepted override list. It triggers on
naming two nodes, which `auto` detects reliably, and forcing it before those nodes
are named would strand the user in a mode that cannot act. It remains reachable
through `auto`, exactly as today.

- [ ] **Step 1: Write the failing tests**

Create `api/test/chat.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login, readSse, client } from './helpers.mjs'

test('omitting mode preserves auto-detection', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, { message: 'draft a reel about linen' })
  assert.equal(res.status, 200)
  assert.equal(res.events[0].event, 'start')
  assert.equal(res.events[0].data.mode, 'generator')

  const librarian = await readSse(server.base, token, { message: 'what is happening with linen?' })
  assert.equal(librarian.events[0].data.mode, 'librarian')
})

test('an explicit mode overrides detection', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  // "draft" would auto-detect as generator; librarian must win.
  const res = await readSse(server.base, token, { message: 'draft a reel about linen', mode: 'librarian' })
  assert.equal(res.events[0].data.mode, 'librarian')

  const done = res.events.at(-1)
  assert.equal(done.event, 'done')
  assert.equal(done.data.proposal, null, 'librarian never proposes')
})

test('mode auto is accepted explicitly and behaves as omission', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, { message: 'draft a reel', mode: 'auto' })
  assert.equal(res.events[0].data.mode, 'generator')
})

test('an unknown mode is rejected before the stream opens', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, { message: 'hello', mode: 'oracle' })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'invalid_mode')
  assert.equal(res.body.error.field, 'mode')
})

test('operator cannot be forced, but is still reachable through auto', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const forced = await readSse(server.base, token, { message: 'hello', mode: 'operator' })
  assert.equal(forced.status, 422)
  assert.equal(forced.body.error.code, 'invalid_mode')

  const auto = await readSse(server.base, token, {
    message: 'connect the linen reel to the linen drop',
  })
  assert.equal(auto.events[0].data.mode, 'operator')
})

test('reasoner audits the seeded board and cites real node ids', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await login(server.base)

  const res = await readSse(server.base, token, { message: 'how is the board doing?', mode: 'reasoner' })
  assert.equal(res.events[0].data.mode, 'reasoner')
  assert.ok(res.text.length > 0)

  const done = res.events.at(-1)
  assert.equal(done.event, 'done')
  assert.equal(done.data.proposal, null, 'the reasoner audits, it does not propose')
  assert.ok(done.data.citedNodeIds.length > 0, 'the seeded board has findings to cite')

  // Every cited id must be a real node on this board.
  const nodes = await api('GET', '/nodes')
  const real = new Set(nodes.body.map((n) => n.id))
  for (const cid of done.data.citedNodeIds) {
    assert.ok(real.has(cid), `cited ${cid} is not a node on this board`)
  }
})

test('reasoner names the disconnected notes on the seeded board', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await login(server.base)

  const nodes = await api('GET', '/nodes')
  const edges = await api('GET', '/edges')
  const touched = new Set(edges.body.flatMap((e) => [e.fromId, e.toId]))
  const orphans = nodes.body.filter((n) => !touched.has(n.id))

  const res = await readSse(server.base, token, { message: 'audit', mode: 'reasoner' })

  for (const orphan of orphans) {
    assert.ok(
      res.text.includes(orphan.title),
      `the audit must name the unconnected node "${orphan.title}"`,
    )
  }
})

test('reasoner on an empty board says so instead of inventing findings', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())

  const anon = client(server.base)
  const signup = await anon('POST', '/auth/signup', {
    name: 'Fresh', email: 'fresh@example.com', password: 'password123',
  })
  assert.equal(signup.status, 201)

  const res = await readSse(server.base, signup.body.token, { message: 'audit', mode: 'reasoner' })
  assert.equal(res.events[0].data.mode, 'reasoner')
  assert.match(res.text, /empty/i)
  assert.deepEqual(res.events.at(-1).data.citedNodeIds, [])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && node --test test/chat.test.mjs`
Expected: FAIL. The `mode` parameter is ignored, so the override test sees
`generator` where it expects `librarian`, and `invalid_mode` is never raised.

- [ ] **Step 3: Add the mode constant and the edges helper**

In `api/server.js`, beside the existing `NODE_TYPES` / `EDGE_KINDS` constants near
the top of the file, add:

```js
// `operator` is intentionally absent — it is reachable through `auto` only.
// Selecting it before naming two nodes would strand the user in a mode that
// cannot act. See docs/superpowers/specs/2026-09-10-whiteboard-layer-design.md.
const CHAT_MODES = ['auto', 'generator', 'librarian', 'reasoner']
```

And beside the existing `nodesOf` definition (`api/server.js:312`), add:

```js
const edgesOf = (user) => db.edges.filter((e) => e.boardId === user.boardId)
```

- [ ] **Step 4: Write the reasoner response builder**

In `api/server.js`, directly above `buildChatResponse`, add:

```js
/**
 * The Reasoner audits structure rather than answering questions: it looks for
 * places the traceability spine is broken. Every finding cites the real nodes
 * it names, so the canvas can highlight them.
 */
function buildReasonerResponse(nodes, edges) {
  if (!nodes.length) {
    return {
      mode: 'reasoner',
      text: 'This board is empty, so there is no structure to audit yet. Add a goal, then hang a strategy off it and work down to content.',
      citedNodeIds: [],
      proposal: null,
    }
  }

  const serves = edges.filter((e) => e.kind === 'serves')
  const touched = new Set(edges.flatMap((e) => [e.fromId, e.toId]))
  const isServed = new Set(serves.map((e) => e.toId))
  const servesSomething = new Set(serves.map((e) => e.fromId))

  const findings = []
  const cited = new Set()

  const list = (ns) => ns.map((n) => `"${n.title}"`).join(', ')
  const record = (ns, sentence) => {
    if (!ns.length) return
    findings.push(sentence)
    for (const n of ns) cited.add(n.id)
  }

  const orphans = nodes.filter((n) => !touched.has(n.id))
  record(
    orphans,
    `**${orphans.length} node${orphans.length === 1 ? '' : 's'} connected to nothing** — ${list(orphans)}. ` +
      `An unconnected node cannot be traced back to an outcome, which is the only reason this board exists.`,
  )

  const barrenGoals = nodes.filter((n) => n.type === 'goal' && !isServed.has(n.id))
  record(
    barrenGoals,
    `**${barrenGoals.length} goal${barrenGoals.length === 1 ? '' : 's'} that nothing serves** — ${list(barrenGoals)}. ` +
      `A goal with no work pointing at it is a wish. Connect a strategy to it.`,
  )

  const looseCampaigns = nodes.filter((n) => n.type === 'campaign' && !servesSomething.has(n.id))
  record(
    looseCampaigns,
    `**${looseCampaigns.length} campaign${looseCampaigns.length === 1 ? '' : 's'} serving no strategy** — ${list(looseCampaigns)}. ` +
      `A campaign that serves nothing is activity without a thesis.`,
  )

  const looseContent = nodes.filter((n) => n.type === 'content' && !servesSomething.has(n.id))
  record(
    looseContent,
    `**${looseContent.length} piece${looseContent.length === 1 ? '' : 's'} of content serving no campaign** — ${list(looseContent)}. ` +
      `Content that traces to nothing is decoration.`,
  )

  if (!findings.length) {
    return {
      mode: 'reasoner',
      text:
        `I audited all ${nodes.length} nodes and the spine holds.\n\n` +
        `Every node is connected, every goal has work pointing at it, and every campaign and piece of ` +
        `content serves something above it. Nothing to fix structurally.`,
      citedNodeIds: [],
      proposal: null,
    }
  }

  return {
    mode: 'reasoner',
    text:
      `I audited all ${nodes.length} nodes. ${findings.length} ` +
      `${findings.length === 1 ? 'thing breaks' : 'things break'} the traceability spine:\n\n` +
      findings.map((f, i) => `${i + 1}. ${f}`).join('\n\n') +
      `\n\nI have highlighted every node named above.`,
    citedNodeIds: [...cited],
    proposal: null,
  }
}
```

- [ ] **Step 5: Route the requested mode through buildChatResponse**

Change the signature at `api/server.js:151` from:

```js
function buildChatResponse(message, nodes) {
  const mode = detectMode(message)
```

to:

```js
function buildChatResponse(message, nodes, edges, requested = 'auto') {
  const mode = requested === 'auto' ? detectMode(message) : requested
  if (mode === 'reasoner') return buildReasonerResponse(nodes, edges)
```

Leave the rest of the function untouched — the `generator`, `operator` and
`librarian` branches all read `mode`, which now honours the override.

- [ ] **Step 6: Validate and pass the mode in the handler**

In the `POST /chat` handler, change the first two lines from:

```js
  const message = requireString(ctx.body, 'message', { label: 'Message' })
  const response = buildChatResponse(message, nodesOf(ctx.user))
```

to:

```js
  const message = requireString(ctx.body, 'message', { label: 'Message' })
  const requested = ctx.body.mode === undefined ? 'auto' : ctx.body.mode
  if (!CHAT_MODES.includes(requested)) {
    throw bad('invalid_mode', `mode must be one of: ${CHAT_MODES.join(', ')}.`, 'mode')
  }
  const response = buildChatResponse(message, nodesOf(ctx.user), edgesOf(ctx.user), requested)
```

Validation happens **before** `res.writeHead`, so a bad mode is a normal JSON 422
rather than an error event inside an already-open stream. The tests depend on that.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd api && node --test test/chat.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 8: Run the whole suite**

Run: `cd api && npm test`
Expected: PASS, 27 tests.

- [ ] **Step 9: Commit**

```bash
git add api/server.js api/test/chat.test.mjs
git commit -m "feat(api): add chat mode override and the Reasoner audit mode"
```

---

## Task 6: Seed the whiteboard layer

Every new state needs something to render on first run, the way the board already
seeds 16 nodes and 13 edges.

**Files:**
- Modify: `api/seed.js`
- Test: `api/test/seed.test.mjs`

**Interfaces:**
- Consumes: the entity shapes from Tasks 2–4.
- Produces: seeded `strokes`, `marks`, `pins` and `comments` on `brd_demo`, plus
  two collaborator identities used as comment authors.

The two collaborators exist **only as embedded `author` objects on seeded
comments**. They are not users, they cannot sign in, and there is no endpoint that
lists them. That is the whole of "multi-actor": attribution.

- [ ] **Step 1: Write the failing test**

Create `api/test/seed.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login, client } from './helpers.mjs'

test('the demo board seeds a whiteboard layer', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const strokes = await api('GET', '/strokes')
  assert.ok(strokes.body.length >= 2, 'seed at least two strokes')
  assert.ok(strokes.body.some((s) => s.tool === 'pen'))
  assert.ok(strokes.body.some((s) => s.tool === 'highlighter'))
  for (const s of strokes.body) {
    assert.ok(s.points.length >= 4 && s.points.length % 2 === 0)
  }

  const marks = await api('GET', '/marks')
  assert.ok(marks.body.length >= 2)
  assert.ok(marks.body.some((m) => m.variant === 'sticky'))
  assert.ok(marks.body.some((m) => m.variant === 'text'))

  const pins = await api('GET', '/pins')
  assert.equal(pins.body.length, 2, 'one open thread and one resolved')
  assert.ok(pins.body.some((p) => p.resolved === false))
  assert.ok(pins.body.some((p) => p.resolved === true))
})

test('a seeded thread has a reply from a second author', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { api } = await login(server.base)

  const pins = await api('GET', '/pins')
  const open = pins.body.find((p) => !p.resolved)

  assert.ok(open.comments.length >= 2, 'the open thread has a reply')
  const names = new Set(open.comments.map((c) => c.author.name))
  assert.ok(names.size >= 2, 'attribution is visible: more than one author in the thread')
  for (const c of open.comments) {
    assert.ok(c.author.id, 'every comment carries an author id')
    assert.ok('avatarUrl' in c.author)
  }
})

test('a new account gets an empty whiteboard, not the demo one', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())

  const anon = client(server.base)
  const signup = await anon('POST', '/auth/signup', {
    name: 'Fresh', email: 'fresh@example.com', password: 'password123',
  })
  const api = client(server.base, signup.body.token)

  assert.deepEqual((await api('GET', '/strokes')).body, [])
  assert.deepEqual((await api('GET', '/marks')).body, [])
  assert.deepEqual((await api('GET', '/pins')).body, [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && node --test test/seed.test.mjs`
Expected: FAIL — the arrays added in Tasks 2–4 are empty, so the length
assertions fail. The third test already passes; that is fine.

- [ ] **Step 3: Add the seed data**

In `api/seed.js`, above `buildSeed`, alongside the existing `nodes` / `edges` /
`annotations` / `files` module-level arrays, add:

```js
// The two people whose comments appear on the demo board. They exist only as
// embedded authors — they are not users and cannot sign in. Attribution, not
// collaboration.
const RANIA = { id: 'usr_rania', name: 'Rania', avatarUrl: null }
const OMAR = { id: 'usr_omar', name: 'Omar', avatarUrl: null }

const strokes = [
  // A circle scrawled around the linen campaign cluster.
  {
    id: 'stk_ring',
    tool: 'pen',
    color: '#a8674f',
    width: 3,
    points: [360, 440, 470, 430, 540, 470, 545, 545, 470, 590, 380, 575, 345, 510, 360, 440],
  },
  // A highlighter swipe across the best-performing reel.
  {
    id: 'stk_swipe',
    tool: 'highlighter',
    color: '#c0a25c',
    width: 18,
    points: [300, 712, 470, 712],
  },
]

const marks = [
  {
    id: 'mrk_hook',
    variant: 'sticky',
    x: 600,
    y: 640,
    body: 'The hook is the whole reel. Everything after 0:02 is retention, not acquisition.',
    color: '#c0a25c',
  },
  {
    id: 'mrk_heading',
    variant: 'text',
    x: 40,
    y: 400,
    body: 'Q4 — everything below traces to one of the two goals',
    color: null,
  },
]

const pins = [
  { id: 'pin_reel', x: 470, y: 690, resolved: false },
  { id: 'pin_price', x: 640, y: 240, resolved: true },
]

const comments = [
  {
    id: 'cmt_1',
    pinId: 'pin_reel',
    author: RANIA,
    body: 'This one carried the whole drop. Can we cut three more in the same shape?',
  },
  {
    id: 'cmt_2',
    pinId: 'pin_reel',
    author: OMAR,
    body: 'Shooting Thursday. Same location, different styling so it does not read as a repost.',
  },
  {
    id: 'cmt_3',
    pinId: 'pin_price',
    author: RANIA,
    body: 'Held the line on price. Closing this — revisit if it is still true in six weeks.',
  },
]
```

- [ ] **Step 4: Wire the seed arrays into buildSeed**

In the object `buildSeed()` returns, replace the four empty arrays added in
Tasks 2–4 with:

```js
    strokes: strokes.map((s) => ({ ...s, boardId: DEMO_BOARD_ID, createdAt: now })),
    marks: marks.map((m) => ({
      color: null,
      body: '',
      ...m,
      boardId: DEMO_BOARD_ID,
      createdAt: now,
      updatedAt: now,
    })),
    pins: pins.map((p) => ({ ...p, boardId: DEMO_BOARD_ID, createdAt: now })),
    comments: comments.map((c, i) => ({
      ...c,
      boardId: DEMO_BOARD_ID,
      // Stagger so the thread sorts oldest-first deterministically.
      createdAt: new Date(Date.parse(now) + i * 1000).toISOString(),
    })),
```

The comment stagger matters: `shapePin` sorts on `createdAt`, and identical
timestamps would leave thread order undefined.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && node --test test/seed.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole suite and check the demo board by hand**

Run: `cd api && npm test`
Expected: PASS, 30 tests.

Then confirm the running server serves it:

```bash
cd api && rm -rf .data && npm start &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@marketingcanvas.dev","password":"password123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://localhost:4000/pins -H "Authorization: Bearer $TOKEN"
```

Expected: two pins, the open one carrying two comments by different authors.
Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add api/seed.js api/test/seed.test.mjs
git commit -m "feat(api): seed the demo board with ink, marks and attributed threads"
```

---

## Task 7: Document the new API surface

`api/README.md` states it is "the only thing you need to read to build against it."
That has to stay true.

**Files:**
- Modify: `api/README.md`

**Interfaces:**
- Consumes: every endpoint, type and error code from Tasks 2–6.
- Produces: the reference every later frontend ticket reads.

- [ ] **Step 1: Extend the Types block**

In the `## Types` fenced block, after `FileRef`, add:

```ts
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

Below the block, add this note — it is the one thing a reader will otherwise get wrong:

> **`points` is flat.** `[x0, y0, x1, y1, …]`, not an array of objects. At least two
> points. Feed it straight to an SVG path builder.
>
> **Sticky notes and board text are the same thing.** One `Mark` entity, two
> `variant`s. They differ only in whether a card is painted behind the text.

- [ ] **Step 2: Add the three endpoint sections**

After the `## Files` section and before `## Chat`, add `## Strokes`, `## Marks` and
`## Pins and comments`, each in the existing two-column table style, listing every
endpoint from Tasks 2–4 with its success status and its failure codes. Copy the
exact `code` strings and status numbers from the implementations — a README that
disagrees with the server is worse than no README.

Each section gets one JSON request example, taken verbatim from the corresponding
test file so it is known to work:

```json
{ "tool": "pen", "color": "#a8674f", "width": 3, "points": [10, 10, 20, 24] }
{ "variant": "sticky", "x": 40, "y": 60, "body": "Reshoot the hook" }
{ "x": 220, "y": 340 }
{ "body": "Hook lands late." }
```

State explicitly in `## Pins and comments`:

> Comments are returned **inlined** on each pin, oldest first — you never fetch a
> thread separately. `author` is embedded, not a reference; there is no
> `/authors` endpoint. Deleting a pin deletes its comments.
>
> Attribution is not collaboration. Comments carry an author so threads read
> correctly, but a board still belongs to one account and cannot be shared.

- [ ] **Step 3: Document the chat mode override**

In `## Chat`, after the request example, add:

````
```json
{ "message": "how is the board doing?", "mode": "reasoner" }
```

`mode` is optional and defaults to `auto`, which picks from your message exactly as
before. Accepted: `auto`, `generator`, `librarian`, `reasoner`. Anything else is
`422 invalid_mode`, raised *before* the stream opens — so it arrives as normal JSON,
not as an `error` event.

`operator` is **not** settable. It triggers on naming two nodes, which `auto`
detects; forcing it before those nodes are named would leave you in a mode that
cannot act.
````

Then extend the three-row mode table to four, adding:

| Mode | Triggered by | You get back |
|---|---|---|
| `reasoner` | `mode: "reasoner"` only — never auto-detected | A structural audit of the board + `citedNodeIds` for every node it names. Never a proposal. |

- [ ] **Step 4: Note the test suite**

Under `## Run it`, after the existing `npm start` block, add:

````
### Tests

```bash
npm test
```

Spawns the server on a free port with a throwaway data directory, so your own
board is never touched. Zero dependencies — Node's built-in test runner.
````

- [ ] **Step 5: Verify every documented code actually exists**

Run:

```bash
cd api && for c in stroke_not_found mark_not_found pin_not_found comment_not_found \
  invalid_tool invalid_variant invalid_mode; do
  grep -q "'$c'" server.js && grep -q "$c" README.md \
    && echo "ok   $c" || echo "MISS $c"
done
```

Expected: seven `ok` lines. Any `MISS` means the README and the server disagree.

- [ ] **Step 6: Commit**

```bash
git add api/README.md
git commit -m "docs(api): document strokes, marks, pins and the chat mode override"
```

---

## Task 8: Reconcile spec.md with the API

**Files:**
- Modify: `app/docs/spec.md`

**Interfaces:**
- Consumes: the API surface as documented in Task 7.
- Produces: the spec that tickets 001–022 are written against.

Line numbers below are from the current file and will drift as you edit. Work
**top to bottom** and they stay usable.

- [ ] **Step 1: Replace the opening banner (lines 3–4)**

Replace:

```
> Frontend-only build. No server, no external integrations. All persistence is local; all
> chat responses are mocked. The seams where a backend attaches are marked **[SEAM]**.
```

with:

```
> Built against the local mock API in `api/`. Its contract is `api/README.md` — that file
> is authoritative for every request, response shape and error code named here. The API is
> a mock: it runs locally, has no external integrations, and its chat responses are
> generated rather than modelled. It is nonetheless the system of record; the client caches,
> it does not own the data.
```

- [ ] **Step 2: Rewrite § Actors + jobs (lines 17–26)**

Replace the "Single actor. No admin, no collaborator, no viewer, no sharing." paragraph with:

```
One owner per board. A board belongs to one account, is never shared, and has no
permission tiers.

Comment threads on the board carry an **author** — a name and an avatar — so a thread
reads as a conversation rather than a pile of anonymous text. That is attribution, not
collaboration: other authors reach a board through seeded content, never by signing in
to it. Nothing in this spec lets a second person open your board.

Sharing, invitations, presence and live sync are v2. They are a different spec, and the
mock API deliberately has no endpoints for them.
```

- [ ] **Step 3: Rewrite the persistence [SEAM] (line 104)**

Replace the `**[SEAM]** Persistence is localStorage…` paragraph with:

```
Persistence is the API. `store/` is a cache over it, not the system of record: mutations
issue a request and reconcile against the response. A reload re-fetches; nothing
authoritative lives in the browser.

Uploaded files are the one exception, and it is deliberate. `POST /files` registers
**metadata only** — the API never receives the bytes. The blob stays in the tab as a
`URL.createObjectURL` and does not survive a reload. The file *record* comes back, the
blob does not, and the asset node renders its `file-missing` state.
```

- [ ] **Step 4: Replace the auth [SEAM]s (lines 162 and 203)**

Line 162 — replace `Dummy auth: any well-formed email + password ≥ 8 chars succeeds. **[SEAM]**` with:

```
Auth is `POST /auth/login`. Failures are the API's own codes: `bad_credentials` (401),
`invalid_email` and `weak_password` (422). See `api/README.md` § Auth.
```

Line 203 — replace the dummy-signup sentence with:

```
Sign-up is `POST /auth/signup`, which returns a token, a user and an empty board.
Failures: `invalid_email`, `weak_password` (422) and `email_taken` (409). The address
`taken@example.com` always returns `email_taken`, so the duplicate path is testable
on demand.
```

- [ ] **Step 5: Fix the S1 acceptance criterion (line 185)**

Replace `…then the app navigates to `/` and a session exists in local storage.` with:

```
…then the app navigates to `/` and the returned token is held for subsequent requests.
```

- [ ] **Step 6: Correct the two data-model drifts**

In § Data model:
- `Edge` — change `label?: string` to `label: string | null`. The API always returns the key.
- `FileRef` — change `{ id, name, mime, sizeBytes, objectUrl, thumbUrl? }` to
  `{ id, name, mime, sizeBytes, thumbUrl, createdAt }`, and add a following line:
  `objectUrl` is **client-only** — it never round-trips to the API.

- [ ] **Step 7: Add the whiteboard types to § Data model**

After `Annotation`, add:

```ts
InkTool     = 'pen' | 'highlighter'
MarkVariant = 'sticky' | 'text'

Stroke  = { id, tool: InkTool, color, width, points: number[], createdAt }
Mark    = { id, variant: MarkVariant, x, y, body, color: string | null,
            createdAt, updatedAt }
Pin     = { id, x, y, resolved: boolean, createdAt, comments: Comment[] }
Comment = { id, body, createdAt, author: { id, name, avatarUrl } }
```

With this note beneath:

```
**The whiteboard layer sits above the graph, not inside it.** Strokes, marks and pins
have board coordinates but no edges and no node relationships. They annotate the canvas;
they are not part of the traceability spine. Deleting a node never deletes ink near it.

**One `Mark`, two variants.** A sticky and a board-text block are the same positioned
text box, differing only in whether a card is painted behind the text.
```

- [ ] **Step 8: Add three overlays to § Screen inventory**

Add to the overlay table:

| # | Overlay | Traces to |
|---|---|---|
| O7 | Whiteboard dock + tool modes | `add node` (annotating what you built) |
| O8 | Marks — stickies and board text | `open it, annotate` |
| O9 | Comment pins and threads | `open it, annotate` |

And extend the cut list to read: `…Notion/Drive sync, **sharing, presence, live sync and
permission tiers.**`

- [ ] **Step 9: Note the store's new role in § Dependency manifest**

No packages change. Add one line beneath the fenced list:

```
No HTTP client is listed because none is needed — `fetch` is native. `zustand` holds a
cache of API state plus genuinely client-only state (tool mode, selection, viewport
before it is flushed), not the system of record.
```

- [ ] **Step 10: Add the whiteboard and chat-mode behavior to S3**

Under § S3 — Behavior, add a `Whiteboard dock` block:

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

And update the chat response-shape table to four modes, adding the `reasoner` row from
Task 7 Step 3, plus a line stating that the composer carries a mode picker offering
Auto / Generator / Librarian / Reasoner, and that `operator` is reached only through Auto.

- [ ] **Step 11: Replace the remaining [SEAM] markers (lines 313, 381)**

Line 313 (file object URLs) — replace `**[SEAM]**` with a pointer to `api/README.md` § Files
and the metadata-only rule from Step 3.

Line 381 (chat mocks) — replace `**[SEAM]** All three come from `src/mocks/chat.ts`. One
module replacement wires a real model.` with:

```
All four modes come from `POST /chat` as a server-sent event stream. The responses are
generated by the mock, not by a model; swapping in a real model is a server change, not
a client one. See `api/README.md` § Chat.
```

- [ ] **Step 12: Verify no stale claims remain**

Run:

```bash
cd app/docs && grep -niE '\[SEAM\]|localStorage|frontend-only|no server|dummy auth' spec.md \
  && echo "^^ STALE — fix these" || echo "clean"
```

Expected: `clean`. Every hit is a claim the API now contradicts.

- [ ] **Step 13: Commit**

```bash
git add app/docs/spec.md
git commit -m "docs: reconcile spec.md with the mock API and the whiteboard layer

Drops the frontend-only banner and every [SEAM] marker, rewrites Actors for
attribution-without-sharing, corrects Edge.label and FileRef against the real
API shapes, and adds the Stroke/Mark/Pin/Comment types with overlays O7-O9."
```

---

## Task 9: Rewrite the state matrix for the API, and add O7–O9

The matrix's error cells assume `localStorage` quota failures. Every one becomes a
network or API failure. The gain is real: `X-Mock-Fail` and `X-Mock-Latency` make
all of them reachable on demand, so ticket 015 can *verify* these cells instead of
merely describing them.

**Files:**
- Modify: `app/docs/state-matrix.md`

**Interfaces:**
- Consumes: § Screen inventory (O7/O8/O9) and the whiteboard types from Task 8.
- Produces: the acceptance surface tickets 015–019 are verified against.

House rules, restated because they govern every cell you write: **no cell is blank**,
`n/a` is a deliberate answer that states its reason, and error copy always says **what
failed and what to do**.

- [ ] **Step 1: Rewrite the S3 Loading cell (line 36)**

Replace `Board hydrating from storage:` with `Board loading from the API:` and append to
the cell: `Exercised on demand with `X-Mock-Latency: 1500`.`

- [ ] **Step 2: Replace the S3 Error cell (line 38) entirely**

```
| **Error** | *Board request fails (5xx or offline):* full-canvas message — "We couldn't load your board. Check your connection, then reload." with a Reload button. Reachable with `X-Mock-Fail: 503`. *Token rejected (401 `invalid_token`):* redirect to `/signin` with a toast — "Your session expired. Sign in again." *A mutation fails:* toast — "Couldn't save that change. Check your connection and try again." with Retry. The change stays on screen and the canvas is not rolled back under the user. |
```

- [ ] **Step 3: Replace the O1 Error cell (line 49)**

```
| **Error** | `POST /nodes` returns non-2xx: menu closes, toast — "Couldn't add the node. Check your connection and try again." with Retry. No half-created node is left on the canvas. |
```

- [ ] **Step 4: Replace the O6 proposal-failure sentence (line 104)**

Within the O6 Error cell, replace *Proposal apply fails:* `toast — "Couldn't add that to
the canvas. Your board is out of storage on this device."` with:

```
*Proposal apply fails:* toast — "Couldn't add that to the canvas. Check your connection and try again." and the button returns to its actionable state.
```

- [ ] **Step 5: Fix the S4 Loading and Error cells (lines 113, 115)**

Line 113 — replace `before hydration` with `before the board request resolves`.

Line 115 — replace the *Autosave failure* sentence with:

```
*Autosave failure:* inline banner at the panel top — "Changes aren't saving. Check your connection — your text is still here, and we'll retry when you next edit." Edits stay in the fields.
```

Leave the *Node not found* and *Missing blob after reload* sentences alone. The first is
now a real `404 node_not_found` and reads correctly already; the second is a genuine
client-side blob loss, not an API failure, and is still accurate.

- [ ] **Step 6: Leave the O2 read-failure cell alone**

O2's *Read failure: "Couldn't read `{name}`. Try adding it again."* is a `FileReader`
failure in the browser, not an API failure. It stays. Add nothing.

- [ ] **Step 7: Append the three new sections**

At the end of `app/docs/state-matrix.md`, add:

```markdown
## O7 — Whiteboard dock

| State | Behavior |
|---|---|
| **Loading** | The dock renders with the board and needs nothing of its own. While the board request is in flight every tool is disabled — you cannot draw on a canvas that has not arrived. Tooltip on any tool: "Waiting for the board." |
| **Empty** | n/a — the dock always holds its seven tools. Clear-ink is hidden rather than disabled when there is no ink, because a control for erasing nothing is noise. |
| **Error** | *A stroke, mark or pin fails to save:* the object stays on screen and a toast reads "Couldn't save that mark. Check your connection and try again." with Retry. Nothing the user drew is removed because a request failed. *Clear-ink fails:* the ink returns and a toast reads "Couldn't clear the ink. Check your connection and try again." |
| **Success** | The active tool is visibly selected, the cursor changes to match it, and the tool-hint pill names it with its Esc affordance. |
| **Disabled** | Every tool disabled while the board is loading. Pen, Highlighter and Eraser disabled while connect mode is on — two drag-gestures cannot share the canvas; tooltip: "Finish connecting first." Eraser disabled with no ink; tooltip: "Nothing to erase yet." Save-PNG disabled on a completely empty board; tooltip: "Nothing to save yet." |
| **Permissions** | n/a — one owner per board, and the dock acts only on that board. |

## O8 — Marks (stickies and board text)

| State | Behavior |
|---|---|
| **Loading** | Marks arrive with the board, not separately. A mark whose save is in flight renders at full opacity with a subtle pending indicator — never greyed out, because the text is already real to the person who typed it. |
| **Empty** | *A mark with no body:* placeholder "Type a note" while focused. *On blur with an empty body:* the mark is discarded silently and never sent to the API. An empty sticky is an abandoned gesture, not content. |
| **Error** | *Create or update fails:* the mark stays on screen with its text intact, an inline retry affordance on the mark itself, and a toast — "Couldn't save that note. Check your connection and try again." *Delete fails:* the mark returns to the canvas and a toast reads "Couldn't delete that note. Check your connection and try again." |
| **Success** | The mark commits on blur and the pending indicator clears. No toast — the mark sitting there is the confirmation. |
| **Disabled** | The Sticky and Text tools are disabled while the board is loading, and while connect mode is on. Editing is disabled on a mark whose delete is in flight. |
| **Permissions** | n/a — one owner per board. Marks carry no author; only comments do. |

## O9 — Comment pins and threads

| State | Behavior |
|---|---|
| **Loading** | Pins and their comments arrive inlined with `GET /pins` — a thread never loads separately, so opening one is instant with no spinner. A comment being posted appears immediately in the thread with a pending indicator. |
| **Empty** | *A new pin before its first comment:* the thread opens with the composer focused and the line "New comment, pinned right here." *No pins on the board:* nothing renders; there is no empty state, because a pin layer with no pins should be invisible rather than advertise itself. |
| **Error** | *Posting a comment fails:* the comment stays in the thread marked as unsent, with Retry beside it, and the composer keeps the text — "Couldn't post that comment. Check your connection and try again." *Resolve fails:* the thread reverts to open and a toast explains it. *Deleting a pin fails:* the pin returns. *Opening a pin deleted elsewhere (404 `pin_not_found`):* the thread closes and a toast reads "That thread was deleted." |
| **Success** | The comment appears attributed to you with its timestamp, the composer clears and keeps focus for a follow-up. A resolved pin renders visibly muted but stays on the board — resolving is not deleting. |
| **Disabled** | Post is disabled while the composer is empty or whitespace only. Resolve is disabled on a thread with no comments — there is nothing to resolve. The Comment tool is disabled while the board is loading and while connect mode is on. |
| **Permissions** | Every comment carries an author, but a board still belongs to one account: there is nobody else to grant or refuse access to. You can delete any comment on your own board, including seeded ones. Sharing is v2 — see `spec.md` § Actors. |
```

- [ ] **Step 8: Verify the matrix is clean and complete**

Run:

```bash
cd app/docs && grep -niE 'out of storage|local storage|localStorage|hydrat' state-matrix.md \
  && echo "^^ STALE" || echo "no storage assumptions left"
grep -c '^## ' state-matrix.md
```

Expected: `no storage assumptions left`, and a section count of **13** — the four
screens (S1, S2, S3, S4) plus the nine overlays (O1–O9). That number must equal the
screen and overlay rows in `spec.md` § Screen inventory.

- [ ] **Step 9: Verify every new cell is filled**

Run:

```bash
cd app/docs && awk '/^## O[789]/,0' state-matrix.md | grep -c '^| \*\*'
```

Expected: `18` — three sections × six states, no cell skipped.

- [ ] **Step 10: Commit**

```bash
git add app/docs/state-matrix.md
git commit -m "docs: rewrite state matrix for API failures, add O7-O9

Every error cell assumed a localStorage quota failure. They now describe real
network and API failures, each reachable through X-Mock-Fail so ticket 015 can
verify them rather than describe them."
```

---

## Task 10: Rewrite tickets 002 and 003 (and 006, 014)

These were written against `localStorage` and dummy auth.

**Correction found during execution:** the plan originally claimed only 002 and 003
needed changing. It was wrong. Tickets **006** and **014** each carry an acceptance
criterion asserting the failure message states "the board is out of storage" — the
localStorage assumption, now contradicted by the O1 and O6 error cells rewritten in
Task 9. Both are corrected here. Tickets 001, 004, 005, 007–013 and 015 are genuinely
untouched.

**Files:**
- Modify: `app/backlog/002-store-and-persistence.md`
- Modify: `app/backlog/003-auth-screens.md`

**Interfaces:**
- Consumes: `spec.md` and `state-matrix.md` as rewritten in Tasks 8–9.
- Produces: the two tickets' new acceptance criteria.

- [ ] **Step 1: Replace 002 entirely**

```markdown
# Build the API client and the store cache

## Context
- `docs/spec.md` § Data model
- `docs/spec.md` § Dependency manifest, the store's role
- `../../api/README.md` — the contract this layer speaks
- `docs/state-matrix.md` § S3 — Workspace (shell), Loading and Error rows

## Scope
`src/api/client.ts` (fetch wrapper: base URL, bearer token, JSON, error envelope),
`src/api/endpoints.ts` (one typed function per endpoint), `src/store/` (slices for
board, nodes, edges, annotations, files, chat, session), `src/types.ts`.
Tests under `src/api/__tests__/` and `src/store/__tests__/`.

## Acceptance
- Given any endpoint call, when it returns a non-2xx, then the client throws a typed error carrying `code`, `message` and `field` from the response envelope, and never a bare `Error`.
- Given a 401 `invalid_token`, when any request returns it, then the session is cleared once and the app routes to `/signin` — concurrent 401s must not stack redirects.
- Given a mutation, when it settles, then the cache reflects the server's returned object rather than the optimistic guess.
- Given a mutation that fails, when the error surfaces, then the cache is unchanged and the failure is reported to the caller.
- Given a board load, when it resolves, then nodes, edges, annotations, files, strokes, marks, pins and viewport are all populated.
- Given a viewport change, when it is written, then `PATCH /board` is debounced to at most one request per 500ms.
- Given any mutation, when undo is invoked, then the prior state is restored and the history holds at least 50 entries.

## Guardrails
No React imports in this layer. No UI. No `localStorage` for anything except the
session token and the theme override — the API is the system of record.
Never construct a request URL by string concatenation of user input.

## Verify
`npm run typecheck && npx vitest run src/api src/store`
```

- [ ] **Step 2: Rewrite 003's Context, Scope and Acceptance**

Keep the ticket's title. Replace `src/auth/mockAuth.ts` in Scope with
`src/auth/session.ts`, add `../../api/README.md` § Auth to Context, and replace the
Acceptance list with:

```markdown
## Acceptance
- Given a signed-out visitor, when `/signin` loads, then the email field holds keyboard focus.
- Given an email without `@`, when the form is submitted, then submission is blocked client-side and an inline error names the email field — without a request.
- Given credentials the API rejects with `bad_credentials`, when submission returns, then both values are retained, a form-level error renders, and the submit button is interactive again.
- Given `taken@example.com` on the sign-up form, when submitted, then the `email_taken` error renders with an inline link to sign in.
- Given a successful login, when the token returns, then it is stored, and every subsequent request carries it as `Authorization: Bearer <token>`.
- Given a successful sign-up, when it returns, then the app lands on `/` and renders the first-run empty state, because a new board has zero nodes.
- Given an existing session, when `/signin` is visited, then the app redirects to `/` before first paint.
- While a submission is pending, the submit button shall be disabled and labelled `Signing in…` / `Creating…`.

## Guardrails
Passwords are never persisted and never logged.
Field-level validation runs client-side first; the API's codes drive form-level errors only.
Error copy comes from the state matrix, not from the raw API `message`, except where the
matrix explicitly defers to it.
```

- [ ] **Step 3: Verify no ticket still contradicts the spec**

Run:

```bash
cd app/backlog && grep -niE 'local storage|localStorage|dummy|mock auth|mockAuth' *.md \
  && echo "^^ STALE" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add app/backlog/002-store-and-persistence.md app/backlog/003-auth-screens.md
git commit -m "docs: rewrite tickets 002 and 003 against the real API"
```

---

## Task 11: Write tickets 016–022

Seven new ticket files, in the established shape: `# Title`, `## Context`,
`## Scope`, `## Acceptance`, `## Guardrails`, `## Verify`. Scope names files and
nothing else; acceptance criteria are given/when/then.

**Files:**
- Create: `app/backlog/016-whiteboard-dock.md` through `app/backlog/022-send-board-to-assistant.md`

**Interfaces:**
- Consumes: `spec.md` § S3 Behavior/Whiteboard dock, `state-matrix.md` § O7–O9, and the API from Tasks 2–6.
- Produces: the executable backlog for the whiteboard layer. These tickets are **not** implemented by this plan.

- [ ] **Step 1: Create 016**

`app/backlog/016-whiteboard-dock.md`:

```markdown
# Build the whiteboard dock and its tool state machine

## Context
- `docs/spec.md` § S3 — Behavior/Whiteboard dock
- `docs/state-matrix.md` § O7 — Whiteboard dock

## Scope
`src/whiteboard/toolMode.ts` (the reducer), `src/whiteboard/Dock.tsx`,
`src/whiteboard/ToolHint.tsx`, `src/whiteboard/useToolShortcuts.ts`.
Tests under `src/whiteboard/__tests__/`. No tool does anything yet — this is the
mode machine and its keyboard surface only.

## Acceptance
- Given the dock, when `V`, `P`, `H`, `E`, `S`, `T` or `C` is pressed outside a text field, then the matching tool becomes active and is visibly selected.
- Given a shortcut key pressed while focus is inside an input or textarea, then the tool does not change and the character is typed.
- Given any tool other than Select, when Escape is pressed, then the mode returns to Select.
- Given any tool other than Select, when it activates, then the tool-hint pill names it and offers Esc.
- Given Select is active, when the hint would render, then no pill is shown — Select is the resting state, not a mode to escape.
- Given the board request is still in flight, when the dock renders, then every tool is disabled with the tooltip "Waiting for the board."
- Given connect mode is active, when the dock renders, then Pen, Highlighter and Eraser are disabled with the tooltip "Finish connecting first."
- Given no ink on the board, when the dock renders, then Eraser is disabled and clear-ink is absent rather than disabled.

## Guardrails
The reducer is pure and has no React imports — every transition is unit-testable
without a DOM. Tool state is client-only and is never sent to the API.
Icons come from `lucide-react`; no inline SVG paths.

## Verify
`npm run typecheck && npx vitest run src/whiteboard`
```

- [ ] **Step 2: Create 017**

`app/backlog/017-ink.md`:

```markdown
# Draw, erase and persist ink

## Context
- `docs/spec.md` § S3 — Behavior/Whiteboard dock
- `docs/spec.md` § Data model — `Stroke`
- `docs/state-matrix.md` § O7 — Whiteboard dock
- `../../api/README.md` § Strokes

## Scope
`src/whiteboard/InkLayer.tsx`, `src/whiteboard/useDrawing.ts`,
`src/whiteboard/strokePath.ts`, `src/whiteboard/InkOptions.tsx`,
`src/store/strokes.ts`. Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given the Pen tool, when a drag completes on the canvas, then one stroke is created with a flat `points` array of at least two x,y pairs, in board coordinates rather than screen coordinates.
- Given a stroke in progress, when the pointer moves, then the live stroke renders before any request is made.
- Given a stroke drawn at one zoom level, when the canvas is zoomed or panned, then the stroke stays anchored to the same board position.
- Given the Highlighter, when a stroke is drawn, then it renders wider and translucent, and beneath node cards rather than over them.
- Given the Eraser, when a stroke is clicked, then that entire stroke is removed — never a segment of it.
- Given clear-ink, when it is confirmed, then every stroke on the board is removed in one request.
- Given `POST /strokes` fails, when the error returns, then the stroke stays on screen and a toast offers Retry.
- Given a reload, when the board loads, then every persisted stroke renders in its original colour, width and position.

## Guardrails
Colours come from the ink palette tokens — no raw hex in components.
Points are sampled, not recorded per pixel: coalesce moves so a long stroke does not
produce thousands of points.
The ink layer never intercepts pointer events while Select is active.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/store/strokes`
```

- [ ] **Step 3: Create 018**

`app/backlog/018-marks.md`:

```markdown
# Drop, edit and persist stickies and board text

## Context
- `docs/spec.md` § Data model — `Mark`, one entity two variants
- `docs/state-matrix.md` § O8 — Marks
- `../../api/README.md` § Marks

## Scope
`src/whiteboard/MarkLayer.tsx`, `src/whiteboard/MarkCard.tsx`,
`src/store/marks.ts`. Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given the Sticky tool, when the canvas is clicked, then a sticky is created at that board position and its textarea takes focus without a second click.
- Given the Text tool, when the canvas is clicked, then a text mark is created at that position, rendering with no card behind it.
- Given a mark with an empty body, when it loses focus, then it is discarded locally and no request is sent.
- Given a mark with text, when it loses focus, then the change is saved and the pending indicator clears with no toast.
- Given a mark being dragged, when the drag ends, then one `PATCH /marks/:id` carries the final position — not one request per pointer move.
- Given a save that fails, when the error returns, then the text stays on screen intact and a retry affordance appears on the mark itself.
- Given a reload, when the board loads, then every mark renders at its stored position with its stored variant and colour.

## Guardrails
Sticky and Text are one component with a variant prop — do not fork them into two.
Marks live above ink and below node cards.
Drag writes are debounced; typing writes only on blur.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/store/marks`
```

- [ ] **Step 4: Create 019**

`app/backlog/019-comment-pins.md`:

```markdown
# Pin comment threads to the board

## Context
- `docs/spec.md` § Actors + jobs — attribution, not collaboration
- `docs/spec.md` § Data model — `Pin`, `Comment`
- `docs/state-matrix.md` § O9 — Comment pins and threads
- `../../api/README.md` § Pins and comments

## Scope
`src/whiteboard/PinLayer.tsx`, `src/whiteboard/Thread.tsx`,
`src/whiteboard/ThreadComposer.tsx`, `src/store/pins.ts`.
Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given the Comment tool, when the canvas is clicked, then a pin is created at that position, its thread opens, and the composer takes focus.
- Given an open thread, when a comment is posted, then it renders attributed to the signed-in user with a timestamp, and the composer clears and keeps focus.
- Given a seeded thread with two authors, when it is opened, then each comment shows its own author's name, and replies are visually nested beneath the first comment.
- Given a composer holding only whitespace, when it renders, then Post is disabled.
- Given a thread with no comments, when it renders, then Resolve is disabled.
- Given a resolved thread, when the board renders, then its pin is visibly muted and still present — resolving is not deleting.
- Given a posting failure, when the error returns, then the comment remains in the thread marked unsent with Retry, and the composer keeps its text.
- Given a thread opened for a pin the API reports as `pin_not_found`, then the thread closes and a toast reads that it was deleted.
- Given a thread panel that would leave the viewport, when it opens, then it flips to the other side of the pin.

## Guardrails
A thread is never fetched separately — comments arrive inlined on `GET /pins`.
Author identity is display-only: never branch behavior on who authored a comment.
Timestamps render relative ("2h") with the absolute value in a `title` attribute.

## Verify
`npm run typecheck && npx vitest run src/whiteboard src/store/pins`
```

- [ ] **Step 5: Create 020**

`app/backlog/020-save-png.md`:

```markdown
# Save the marked-up board as a PNG

## Context
- `docs/spec.md` § S3 — Behavior/Whiteboard dock
- `docs/state-matrix.md` § O7 — Whiteboard dock, Disabled row

## Scope
`src/whiteboard/exportPng.ts`, `src/whiteboard/Dock.tsx` (the save control only).
Tests under `src/whiteboard/__tests__/`.

## Acceptance
- Given a board with nodes, edges, ink and marks, when save is used, then a PNG downloads containing all four layers.
- Given the export, when the PNG is produced, then the dock, chat rail, toolbar and any open overlay are absent from it.
- Given a completely empty board, when the dock renders, then save is disabled with the tooltip "Nothing to save yet."
- Given an export in progress, when it runs, then the control shows a pending state and cannot be triggered a second time.
- Given an export failure, when it returns, then a toast reads "Couldn't save the image. Try again." and the control returns to its actionable state.
- Given the current theme, when the PNG is produced, then its background matches the canvas background token of that theme rather than being transparent.

## Guardrails
No new dependencies — the manifest is closed. Rasterise with the platform `canvas` API.
If `foreignObject` proves unreliable for DOM content, draw nodes and marks directly to
the canvas instead of screenshotting the DOM; decide inside this ticket and record the
choice in a comment.
Export at 2× for legibility, and cap the output at 8192px on the long edge.

## Verify
`npm run typecheck && npx vitest run src/whiteboard/__tests__/exportPng`
```

- [ ] **Step 6: Create 021**

`app/backlog/021-chat-modes.md`:

```markdown
# Add the chat mode picker and the Reasoner

## Context
- `docs/spec.md` § S3 — Behavior/Chat rail, four-mode response table
- `docs/state-matrix.md` § O6 — Chat rail
- `../../api/README.md` § Chat, the `mode` parameter

## Scope
`src/chat/ModePicker.tsx`, `src/chat/Composer.tsx` (the picker only),
`src/store/chat.ts` (the `mode` parameter only).
Tests under `src/chat/__tests__/`.

## Acceptance
- Given the composer, when the picker renders, then it offers exactly Auto, Generator, Librarian and Reasoner, with Auto selected by default.
- Given Auto, when a message is sent, then no `mode` is sent and the server's chosen mode is shown on the completed response.
- Given a selected mode, when a message is sent, then that mode is sent and the response's `start` event reports it.
- Given a message that would auto-detect as Generator, when Librarian is selected, then the response comes back as Librarian and carries no proposal.
- Given the Reasoner on a board with disconnected nodes, when the response completes, then it names those nodes and highlights them on the canvas through the existing citation path.
- Given the Reasoner on an empty board, when the response completes, then it says the board is empty and cites nothing.
- Given a response is streaming, when the picker renders, then it is disabled until the stream completes.
- Given a selected mode, when the rail is collapsed and reopened, then the selection persists for the session.

## Guardrails
`operator` is not in the picker and must never be sent as `mode` — it is reachable
only through Auto. Sending it returns `422 invalid_mode`.
Reuse ticket 013's citation highlighting; do not add a second highlight path.

## Verify
`npm run typecheck && npx vitest run src/chat`
```

- [ ] **Step 7: Create 022**

`app/backlog/022-send-board-to-assistant.md`:

```markdown
# Send the marked-up board to the assistant

The last ticket in the milestone. Everything else ships first.

## Context
- `docs/spec.md` § S3 — Behavior/Whiteboard dock
- `docs/state-matrix.md` § O6 — Chat rail, § O7 — Whiteboard dock
- `../../api/README.md` § Chat

## Scope
`src/whiteboard/sendBoardToChat.ts`, `src/whiteboard/Dock.tsx` (the send control
only), `src/store/chat.ts` (the board payload only), plus the mocked read in
`api/server.js`. Tests under `src/whiteboard/__tests__/` and `api/test/`.

## Acceptance
- Given a board with ink and marks, when send is used, then a chat message is created carrying the rasterised board, and the assistant's reply references specific sticky text and at least one node the ink is drawn near.
- Given a reply about the board, when it completes, then the nodes it names are cited and highlighted on the canvas.
- Given a response is already streaming, when the dock renders, then send is disabled with the tooltip "Wait for the current reply to finish."
- Given a board with no ink and no marks, when the dock renders, then send is disabled with the tooltip "Draw or add a note first."
- Given the send fails, when the error returns, then the user's message is retained, the assistant bubble shows the error state with Retry, and the composer is re-enabled.

## Guardrails
The mock must be specific to be worth shipping: a reply that gestures vaguely at
"your annotations" is a failure of this ticket. It reads the real strokes, marks
and pins on the board and names actual content from them.
Reuse ticket 020's rasteriser — do not write a second one.
Reuse the existing SSE stream shape; no new event types.

## Verify
`npm run typecheck && npx vitest run src/whiteboard && cd api && npm test`
```

- [ ] **Step 8: Verify the backlog is consistent**

Run:

```bash
cd app/backlog && ls && echo "--- files: $(ls *.md | wc -l), expect 22 ---"
for f in 016*.md 017*.md 018*.md 019*.md 020*.md 021*.md 022*.md; do
  for h in '^# ' '^## Context' '^## Scope' '^## Acceptance' '^## Guardrails' '^## Verify'; do
    grep -q "$h" "$f" || echo "$f missing $h"
  done
done
echo "section check done"
```

Expected: 22 files, and no "missing" lines.

- [ ] **Step 9: Commit**

```bash
git add app/backlog/
git commit -m "docs: add tickets 016-022 for the whiteboard layer

Dock and tool machine, ink, marks, comment pins, PNG export, chat modes, and
send-to-assistant last."
```

---

## Final verification

- [ ] **Step 1: Full API suite from a clean database**

```bash
cd api && rm -rf .data && npm test
```

Expected: PASS, 30 tests, no skips.

- [ ] **Step 2: Every documented error code exists in the server**

```bash
cd api && for c in $(grep -oE "code: \`[a-z_]+\`|\`[a-z_]+\` \(4[0-9]{2}\)" README.md \
  | grep -oE '[a-z_]{4,}' | sort -u); do
  grep -q "'$c'" server.js || echo "documented but not implemented: $c"
done; echo "code cross-check done"
```

Expected: only the "done" line.

- [ ] **Step 3: No document still contradicts the API**

```bash
cd app && grep -rniE 'frontend-only|no server|\[SEAM\]|out of storage|localStorage' docs/ backlog/ \
  && echo "^^ STALE" || echo "all documents consistent"
```

Expected: `all documents consistent`.

- [ ] **Step 4: The demo board serves every layer**

```bash
cd api && rm -rf .data && npm start &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@marketingcanvas.dev","password":"password123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
for p in nodes edges strokes marks pins; do
  printf '%-8s %s\n' "$p" "$(curl -s http://localhost:4000/$p -H "Authorization: Bearer $TOKEN" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).length')"
done
```

Expected: `nodes 16`, `edges 13`, `strokes 2`, `marks 2`, `pins 2`. Stop the server.

- [ ] **Step 5: Confirm the frontend is genuinely untouched**

```bash
cd "$(git rev-parse --show-toplevel)" && git diff --stat 776e678..HEAD -- app/ \
  | grep -vE 'docs/|backlog/' && echo "^^ UNEXPECTED frontend changes" \
  || echo "no frontend source touched, as intended"
```

Expected: `no frontend source touched, as intended`. This plan writes docs, tickets
and API code — never `src/`.
