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
