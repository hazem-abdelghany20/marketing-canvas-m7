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
