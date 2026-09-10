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
