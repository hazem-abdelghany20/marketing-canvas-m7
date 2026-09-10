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
