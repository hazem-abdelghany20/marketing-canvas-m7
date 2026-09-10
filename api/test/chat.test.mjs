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

  // Verb must agree with the finding count — "1 thing breaks", not "1 thing break".
  assert.ok(
    /\b1 thing breaks\b/.test(res.text) || /\b\d+ things break\b/.test(res.text),
    `subject-verb agreement broken in: ${res.text.split('\n')[0]}`,
  )

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
