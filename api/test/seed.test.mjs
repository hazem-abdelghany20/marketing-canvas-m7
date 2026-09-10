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
