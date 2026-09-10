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
