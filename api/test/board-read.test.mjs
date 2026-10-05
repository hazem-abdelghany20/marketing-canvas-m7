import test from 'node:test'
import assert from 'node:assert/strict'
import { startServer, login, readSse, client } from './helpers.mjs'

// Any PNG will do: the mock never looks at pixels. It reads the strokes, marks and pins the board holds.
const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const ASK = { message: 'Read my markup on the board.', board: { image: IMAGE } }

async function freshUser(base) {
  const anon = client(base)
  const email = `reader-${Math.random().toString(36).slice(2, 8)}@example.com`
  const res = await anon('POST', '/auth/signup', { name: 'Ada', email, password: 'password123' })
  assert.equal(res.status, 201)
  return { token: res.body.token, api: client(base, res.body.token) }
}

/** A ring drawn clockwise round a node's card: closed, and centred on it. */
const ringAround = (x, y) => [x - 20, y - 20, x + 256, y - 20, x + 256, y + 160, x - 20, y + 160, x - 20, y - 20]

test('reading the seeded board names the nodes the ink is on, quotes the stickies, and cites the nodes', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, ASK)

  assert.equal(res.status, 200)
  assert.equal(res.events[0].event, 'start')
  assert.equal(res.events[0].data.mode, 'reasoner')
  // The ring is drawn round the linen campaign; the highlighter lies across the best-performing reel.
  assert.match(res.text, /Vayn linen drop - September/)
  assert.match(res.text, /Reel: 3 ways to style linen/)
  // The sticky's own words, and the open thread's.
  assert.match(res.text, /The hook is the whole reel/)
  assert.match(res.text, /This one carried the whole drop/)
  assert.match(res.text, /Rania/)
  const done = res.events.at(-1)
  assert.equal(done.event, 'done')
  assert.equal(done.data.proposal, null)
  assert.ok(done.data.citedNodeIds.includes('nd_cmp_linen'), 'the circled campaign is cited')
  assert.ok(done.data.citedNodeIds.includes('nd_con_linenstyle'), 'the highlighted reel is cited')
  assert.ok(!done.data.citedNodeIds.includes('nd_goal_md'), 'a node nothing touches is not')
})

test('it tells what the ink did to a node: circled, or highlighted', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const { text } = await readSse(server.base, token, ASK)

  assert.match(text, /circled[^.\n]*Vayn linen drop - September/i)
  assert.match(text, /highlighted[^.\n]*Reel: 3 ways to style linen/i)
})

test('a resolved thread is read as closed, not as something still asked', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const { text } = await readSse(server.base, token, ASK)

  assert.match(text, /resolved[^.\n]*Competitor dropped price 20%|Competitor dropped price 20%[^.\n]*resolved/i)
  assert.match(text, /Held the line on price/)
})

test('it reads what is on the board now, not a canned answer', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await freshUser(server.base)
  const launch = await api('POST', '/nodes', { type: 'content', title: 'Launch email', x: 1000, y: 1000 })
  const faraway = await api('POST', '/nodes', { type: 'goal', title: 'Faraway goal', x: 4000, y: 4000 })
  await api('POST', '/strokes', { tool: 'pen', color: '#a14a3a', width: 3, points: ringAround(1000, 1000) })
  const sticky = await api('POST', '/marks', { variant: 'sticky', x: 1300, y: 1000, body: 'Move the CTA above the fold' })

  const first = await readSse(server.base, token, ASK)

  assert.match(first.text, /Launch email/)
  assert.match(first.text, /Move the CTA above the fold/)
  assert.doesNotMatch(first.text, /Faraway goal/, 'a node with no markup near it is left out')
  assert.doesNotMatch(first.text, /Vayn|Rania|hook/, 'nothing from another board leaks in')
  assert.deepEqual(first.events.at(-1).data.citedNodeIds, [launch.body.id])
  assert.ok(!first.events.at(-1).data.citedNodeIds.includes(faraway.body.id))

  await api('PATCH', `/marks/${sticky.body.id}`, { body: 'Swap the subject line' })
  const second = await readSse(server.base, token, ASK)

  assert.match(second.text, /Swap the subject line/)
  assert.doesNotMatch(second.text, /Move the CTA above the fold/)
})

test('ink that is on no node is called ink on open canvas, and no node is blamed for it', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await freshUser(server.base)
  await api('POST', '/nodes', { type: 'note', title: 'Lonely note', x: 100, y: 100 })
  await api('POST', '/strokes', { tool: 'pen', color: '#a14a3a', width: 3, points: [5000, 5000, 5200, 5100] })

  const res = await readSse(server.base, token, ASK)

  assert.match(res.text, /open canvas|on no node|empty canvas/i)
  assert.doesNotMatch(res.text, /Lonely note/)
  assert.deepEqual(res.events.at(-1).data.citedNodeIds, [])
})

test('with no markup at all it says so, invents nothing, and cites nothing', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await freshUser(server.base)
  await api('POST', '/nodes', { type: 'goal', title: 'A goal', x: 0, y: 0 })

  const res = await readSse(server.base, token, ASK)

  assert.equal(res.status, 200)
  assert.match(res.text, /no markup|nothing (is )?(drawn|marked)|haven't marked/i)
  assert.doesNotMatch(res.text, /A goal/)
  assert.deepEqual(res.events.at(-1).data.citedNodeIds, [])
  assert.equal(res.events.at(-1).data.proposal, null)
})

test('an empty draft sticky is not read as a note', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token, api } = await freshUser(server.base)
  await api('POST', '/marks', { variant: 'sticky', x: 10, y: 10, body: '   ' })

  const res = await readSse(server.base, token, ASK)

  assert.match(res.text, /no markup/i)
})

test('a board that is not an image is refused before the stream opens', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  for (const board of [{ image: 'hello' }, { image: 42 }, {}, 'x', null]) {
    const res = await readSse(server.base, token, { message: 'Read my markup', board })
    assert.equal(res.status, 422, JSON.stringify(board))
    assert.equal(res.body.error.code, 'invalid_field')
    assert.equal(res.body.error.field, 'board')
  }
})

test('the board read can fail mid-stream like any reply, so Retry can be tested', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, { ...ASK, message: 'Read my markup __fail' })

  assert.equal(res.events.at(-1).event, 'error')
  assert.equal(res.events.at(-1).data.code, 'stream_failed')
})

test('a message with no board is answered exactly as before', async (t) => {
  const server = await startServer()
  t.after(() => server.stop())
  const { token } = await login(server.base)

  const res = await readSse(server.base, token, { message: 'what is happening with linen?' })

  assert.equal(res.events[0].data.mode, 'librarian')
  assert.doesNotMatch(res.text, /markup/i)
})
