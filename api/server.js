'use strict'

/**
 * Marketing Canvas — mock API server.
 *
 * Zero dependencies. Node 18+. `npm start` or `node server.js`.
 * The contract this serves is documented in README.md — that file is the only
 * thing you need to read to build against it.
 */

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { buildSeed } = require('./seed')

const PORT = Number(process.env.PORT || 4000)
const DATA_DIR = process.env.MC_DATA_DIR || path.join(__dirname, '.data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPTED_MIME = [
  /^image\//,
  /^application\/pdf$/,
  /^text\/plain$/,
  /^text\/markdown$/,
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^application\/msword$/,
  /^application\/vnd\.ms-excel$/,
  /^application\/vnd\.ms-powerpoint$/,
]
const NODE_TYPES = ['goal', 'strategy', 'campaign', 'content', 'asset', 'note']
const EDGE_KINDS = ['serves', 'relates-to']
// `operator` is intentionally absent — it is reachable through `auto` only.
// Selecting it before naming two nodes would strand the user in a mode that
// cannot act. See docs/superpowers/specs/2026-09-10-whiteboard-layer-design.md.
const CHAT_MODES = ['auto', 'generator', 'librarian', 'reasoner']

// ---------------------------------------------------------------- persistence

let db

function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  } catch {
    db = buildSeed()
    saveDb()
  }
}

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

function resetDb() {
  db = buildSeed()
  saveDb()
}

// --------------------------------------------------------------------- utils

const id = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`
const now = () => new Date().toISOString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

const bad = (code, message, field) => new ApiError(422, code, message, field)

/** Strip server-internal fields so responses match the documented shapes exactly. */
function shape(row, drop = ['boardId']) {
  const out = { ...row }
  for (const k of drop) delete out[k]
  return out
}

function requireString(body, key, { min = 1, max = 5000, label = key } = {}) {
  const v = body[key]
  if (typeof v !== 'string' || v.trim().length < min) {
    throw bad('invalid_field', `${label} is required and must be at least ${min} character(s).`, key)
  }
  if (v.length > max) {
    throw bad('invalid_field', `${label} must be ${max} characters or fewer.`, key)
  }
  return v
}

function requireNumber(body, key) {
  const v = body[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw bad('invalid_field', `${key} must be a finite number.`, key)
  }
  return v
}

// ---------------------------------------------------------------------- auth

function issueToken(userId) {
  const token = `mc_${crypto.randomBytes(24).toString('hex')}`
  db.sessions[token] = userId
  return token
}

function currentUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    throw new ApiError(401, 'no_token', 'This endpoint needs a token. Send it as `Authorization: Bearer <token>` from POST /auth/login.')
  }
  const userId = db.sessions[token]
  if (!userId) {
    throw new ApiError(401, 'invalid_token', 'That token is not valid any more. Sign in again to get a new one.')
  }
  const user = db.users.find((u) => u.id === userId)
  if (!user) {
    throw new ApiError(401, 'invalid_token', 'The account for that token no longer exists. Sign in again.')
  }
  return user
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })

// ------------------------------------------------------------- mock chat data

function detectMode(message) {
  const m = message.toLowerCase()
  if (/\b(connect|link|attach|relate|join)\b/.test(m)) return 'operator'
  if (/^\s*(write|draft|create|make|give me|generate)\b/.test(m)) return 'generator'
  return 'librarian'
}

function findMentionedNodes(message, nodes) {
  const m = message.toLowerCase()
  const scored = []
  for (const n of nodes) {
    const words = n.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
    const hits = words.filter((w) => m.includes(w)).length
    if (hits > 0) scored.push({ node: n, hits })
  }
  return scored.sort((a, b) => b.hits - a.hits).map((s) => s.node)
}

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

function buildChatResponse(message, nodes, edges, requested = 'auto') {
  const mode = requested === 'auto' ? detectMode(message) : requested
  if (mode === 'reasoner') return buildReasonerResponse(nodes, edges)
  const mentioned = findMentionedNodes(message, nodes)

  if (mode === 'generator') {
    const type = /\b(goal|strategy|campaign|content|asset|note)\b/.exec(message.toLowerCase())?.[1] || 'content'
    const title = message.replace(/^\s*(write|draft|create|make|give me|generate)\s+(a|an|the)?\s*/i, '').trim() || 'Untitled'
    return {
      mode,
      text:
        `Here is a ${type} you can drop straight onto the canvas.\n\n` +
        `**${title.slice(0, 80)}**\n\n` +
        `Keep it pointed at one outcome. If it does not trace back to a goal through a \`serves\` edge, ` +
        `it is decoration rather than work.`,
      citedNodeIds: [],
      proposal: {
        kind: 'create-node',
        payload: { type, title: title.slice(0, 80), body: 'Drafted from chat. Edit before you connect it.' },
      },
    }
  }

  if (mode === 'operator' && mentioned.length >= 2) {
    // A `serves` edge points up the canonical chain: content/asset -> campaign
    // -> strategy -> goal. Order the two ends by that rank so the proposal
    // always reads the right way round.
    const rank = { asset: 1, content: 2, note: 2, campaign: 3, strategy: 4, goal: 5 }
    const [from, to] = mentioned.slice(0, 2).sort((a, b) => rank[a.type] - rank[b.type])
    return {
      mode,
      text:
        `"${from.title}" should serve "${to.title}".\n\n` +
        `That gives you the chain from the piece back to the outcome it exists for.`,
      citedNodeIds: [from.id, to.id],
      proposal: { kind: 'create-edge', payload: { fromId: from.id, toId: to.id, kind: 'serves' } },
    }
  }

  if (mode === 'operator') {
    return {
      mode,
      text:
        `I can only see one node matching that. Name both ends of the connection ` +
        `and I will propose the edge — for example, "connect the linen reel to the linen drop".`,
      citedNodeIds: mentioned.map((n) => n.id),
      proposal: null,
    }
  }

  const cited = (mentioned.length ? mentioned : nodes).slice(0, 3)
  if (!cited.length) {
    return {
      mode,
      text: 'This board is empty, so there is nothing for me to trace yet. Add a goal first, then hang a strategy off it.',
      citedNodeIds: [],
      proposal: null,
    }
  }
  return {
    mode,
    text:
      `${cited.length} node${cited.length === 1 ? '' : 's'} on the board speak to that.\n\n` +
      cited.map((n) => `- **${n.title}** — ${n.type}`).join('\n') +
      `\n\nI have highlighted them on the canvas.`,
    citedNodeIds: cited.map((n) => n.id),
    proposal: null,
  }
}

// ------------------------------------------------------------------- handlers

const routes = []
const route = (method, pattern, handler, { auth = true } = {}) =>
  routes.push({ method, pattern, handler, auth })

// --- health + control -------------------------------------------------------

route('GET', '/health', async () => ({ status: 200, body: { ok: true, nodes: db.nodes.length } }), { auth: false })

route('GET', '/__reset', async () => {
  resetDb()
  return { status: 200, body: { ok: true, message: 'Database reset to seed data.' } }
}, { auth: false })

// --- auth -------------------------------------------------------------------

route('POST', '/auth/signup', async (ctx) => {
  const name = requireString(ctx.body, 'name', { label: 'Name' })
  const email = requireString(ctx.body, 'email', { label: 'Email' })
  const password = requireString(ctx.body, 'password', { label: 'Password' })

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw bad('invalid_email', 'That email address is not valid. Check for a missing @ or domain.', 'email')
  }
  if (password.length < 8) {
    throw bad('weak_password', 'Password needs at least 8 characters.', 'password')
  }
  if (email.toLowerCase() === 'taken@example.com' || db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new ApiError(409, 'email_taken', 'That email address is already registered. Sign in instead, or use another address.', 'email')
  }

  const boardId = id('brd')
  db.boards.push({ id: boardId, name: 'Marketing Canvas', viewport: { x: 0, y: 0, zoom: 1 } })
  const user = { id: id('usr'), name, email, password, avatarUrl: null, boardId }
  db.users.push(user)
  const token = issueToken(user.id)
  saveDb()

  return { status: 201, body: { token, user: publicUser(user), board: db.boards.at(-1) } }
}, { auth: false })

route('POST', '/auth/login', async (ctx) => {
  const email = requireString(ctx.body, 'email', { label: 'Email' })
  const password = requireString(ctx.body, 'password', { label: 'Password' })

  if (password.length < 8) {
    throw bad('weak_password', 'Password needs at least 8 characters.', 'password')
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
  if (!user) {
    throw new ApiError(401, 'bad_credentials', 'That email and password do not match an account. Check both and try again.')
  }
  const token = issueToken(user.id)
  saveDb()
  return { status: 200, body: { token, user: publicUser(user) } }
}, { auth: false })

route('POST', '/auth/logout', async (ctx) => {
  const header = ctx.req.headers.authorization || ''
  delete db.sessions[header.slice(7)]
  saveDb()
  return { status: 204 }
})

route('GET', '/me', async (ctx) => ({ status: 200, body: { user: publicUser(ctx.user) } }))

// --- board ------------------------------------------------------------------

const boardOf = (user) => db.boards.find((b) => b.id === user.boardId)

route('GET', '/board', async (ctx) => ({ status: 200, body: boardOf(ctx.user) }))

route('PATCH', '/board', async (ctx) => {
  const board = boardOf(ctx.user)
  if (typeof ctx.body.name === 'string') board.name = requireString(ctx.body, 'name', { label: 'Board name' })
  if (ctx.body.viewport !== undefined) {
    const v = ctx.body.viewport
    if (!v || typeof v !== 'object') throw bad('invalid_field', 'viewport must be an object with x, y and zoom.', 'viewport')
    for (const k of ['x', 'y', 'zoom']) {
      if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) {
        throw bad('invalid_field', `viewport.${k} must be a finite number.`, `viewport.${k}`)
      }
    }
    board.viewport = { x: v.x, y: v.y, zoom: v.zoom }
  }
  saveDb()
  return { status: 200, body: board }
})

// --- nodes ------------------------------------------------------------------

const nodesOf = (user) => db.nodes.filter((n) => n.boardId === user.boardId)
const edgesOf = (user) => db.edges.filter((e) => e.boardId === user.boardId)

function findNode(user, nodeId) {
  const node = db.nodes.find((n) => n.id === nodeId && n.boardId === user.boardId)
  if (!node) {
    throw new ApiError(404, 'node_not_found', `No node with id ${nodeId} on this board. It may have been deleted — reload the board.`)
  }
  return node
}

route('GET', '/nodes', async (ctx) => ({ status: 200, body: nodesOf(ctx.user).map((n) => shape(n)) }))

route('POST', '/nodes', async (ctx) => {
  const type = ctx.body.type
  if (!NODE_TYPES.includes(type)) {
    throw bad('invalid_type', `type must be one of: ${NODE_TYPES.join(', ')}.`, 'type')
  }
  const node = {
    id: id('nd'),
    boardId: ctx.user.boardId,
    type,
    title: typeof ctx.body.title === 'string' ? ctx.body.title.slice(0, 200) : 'Untitled',
    body: typeof ctx.body.body === 'string' ? ctx.body.body : '',
    fileIds: Array.isArray(ctx.body.fileIds) ? ctx.body.fileIds.slice(0, 20) : [],
    x: requireNumber(ctx.body, 'x'),
    y: requireNumber(ctx.body, 'y'),
    createdAt: now(),
    updatedAt: now(),
  }
  db.nodes.push(node)
  saveDb()
  return { status: 201, body: shape(node) }
})

route('GET', '/nodes/:id', async (ctx) => ({ status: 200, body: shape(findNode(ctx.user, ctx.params.id)) }))

route('PATCH', '/nodes/:id', async (ctx) => {
  const node = findNode(ctx.user, ctx.params.id)
  if (ctx.body.type !== undefined) {
    if (!NODE_TYPES.includes(ctx.body.type)) {
      throw bad('invalid_type', `type must be one of: ${NODE_TYPES.join(', ')}.`, 'type')
    }
    node.type = ctx.body.type
  }
  if (ctx.body.title !== undefined) node.title = String(ctx.body.title).slice(0, 200)
  if (ctx.body.body !== undefined) node.body = String(ctx.body.body)
  if (ctx.body.fileIds !== undefined) {
    if (!Array.isArray(ctx.body.fileIds)) throw bad('invalid_field', 'fileIds must be an array of file ids.', 'fileIds')
    node.fileIds = ctx.body.fileIds.slice(0, 20)
  }
  if (ctx.body.x !== undefined) node.x = requireNumber(ctx.body, 'x')
  if (ctx.body.y !== undefined) node.y = requireNumber(ctx.body, 'y')
  node.updatedAt = now()
  saveDb()
  return { status: 200, body: shape(node) }
})

route('DELETE', '/nodes/:id', async (ctx) => {
  const node = findNode(ctx.user, ctx.params.id)
  db.nodes = db.nodes.filter((n) => n.id !== node.id)
  db.edges = db.edges.filter((e) => e.fromId !== node.id && e.toId !== node.id)
  db.annotations = db.annotations.filter((a) => a.nodeId !== node.id)
  saveDb()
  return { status: 204 }
})

// --- edges ------------------------------------------------------------------

route('GET', '/edges', async (ctx) => ({
  status: 200,
  body: db.edges.filter((e) => e.boardId === ctx.user.boardId).map((e) => shape(e)),
}))

route('POST', '/edges', async (ctx) => {
  const fromId = requireString(ctx.body, 'fromId', { label: 'fromId' })
  const toId = requireString(ctx.body, 'toId', { label: 'toId' })
  const kind = ctx.body.kind
  if (!EDGE_KINDS.includes(kind)) {
    throw bad('invalid_kind', `kind must be one of: ${EDGE_KINDS.join(', ')}.`, 'kind')
  }
  if (fromId === toId) {
    throw bad('self_edge', 'A node cannot connect to itself. Pick a different target.', 'toId')
  }
  findNode(ctx.user, fromId)
  findNode(ctx.user, toId)

  const duplicate = db.edges.find(
    (e) =>
      e.boardId === ctx.user.boardId &&
      ((e.fromId === fromId && e.toId === toId) || (e.kind === 'relates-to' && e.fromId === toId && e.toId === fromId)),
  )
  if (duplicate) {
    throw new ApiError(409, 'edge_exists', 'Those two nodes are already connected. Remove the existing connection first if you want to change its kind.')
  }

  const edge = {
    id: id('edg'),
    boardId: ctx.user.boardId,
    fromId,
    toId,
    kind,
    label: typeof ctx.body.label === 'string' ? ctx.body.label.slice(0, 60) : null,
  }
  db.edges.push(edge)
  saveDb()
  return { status: 201, body: shape(edge) }
})

route('DELETE', '/edges/:id', async (ctx) => {
  const edge = db.edges.find((e) => e.id === ctx.params.id && e.boardId === ctx.user.boardId)
  if (!edge) {
    throw new ApiError(404, 'edge_not_found', `No connection with id ${ctx.params.id} on this board. It may already be deleted — reload the board.`)
  }
  db.edges = db.edges.filter((e) => e.id !== edge.id)
  saveDb()
  return { status: 204 }
})

// --- annotations ------------------------------------------------------------

route('GET', '/nodes/:id/annotations', async (ctx) => {
  const node = findNode(ctx.user, ctx.params.id)
  return { status: 200, body: db.annotations.filter((a) => a.nodeId === node.id) }
})

route('POST', '/nodes/:id/annotations', async (ctx) => {
  const node = findNode(ctx.user, ctx.params.id)
  const body = requireString(ctx.body, 'body', { label: 'Annotation' })
  const annotation = { id: id('ann'), nodeId: node.id, body, createdAt: now() }
  db.annotations.push(annotation)
  saveDb()
  return { status: 201, body: annotation }
})

route('DELETE', '/annotations/:id', async (ctx) => {
  const annotation = db.annotations.find((a) => a.id === ctx.params.id)
  if (!annotation) {
    throw new ApiError(404, 'annotation_not_found', `No annotation with id ${ctx.params.id}. It may already be deleted.`)
  }
  findNode(ctx.user, annotation.nodeId)
  db.annotations = db.annotations.filter((a) => a.id !== annotation.id)
  saveDb()
  return { status: 204 }
})

// --- files (metadata only — the blob stays in the browser) -------------------

route('GET', '/files', async (ctx) => ({
  status: 200,
  body: db.files.filter((f) => f.boardId === ctx.user.boardId).map((f) => shape(f)),
}))

route('POST', '/files', async (ctx) => {
  const name = requireString(ctx.body, 'name', { label: 'File name', max: 260 })
  const mime = requireString(ctx.body, 'mime', { label: 'mime' })
  const sizeBytes = requireNumber(ctx.body, 'sizeBytes')

  if (sizeBytes > MAX_FILE_BYTES) {
    throw new ApiError(413, 'file_too_large', `${name} is larger than the 25MB limit. Compress it or attach a smaller version.`, 'sizeBytes')
  }
  if (!ACCEPTED_MIME.some((re) => re.test(mime))) {
    throw new ApiError(415, 'unsupported_type', `${name} is not a supported type. Accepted: images, PDF, plain text, markdown and common office formats.`, 'mime')
  }

  const file = { id: id('fil'), boardId: ctx.user.boardId, name, mime, sizeBytes, thumbUrl: null, createdAt: now() }
  db.files.push(file)
  saveDb()
  return { status: 201, body: shape(file) }
})

route('DELETE', '/files/:id', async (ctx) => {
  const file = db.files.find((f) => f.id === ctx.params.id && f.boardId === ctx.user.boardId)
  if (!file) {
    throw new ApiError(404, 'file_not_found', `No file with id ${ctx.params.id} on this board.`)
  }
  db.files = db.files.filter((f) => f.id !== file.id)
  for (const n of db.nodes) {
    if (n.fileIds?.includes(file.id)) n.fileIds = n.fileIds.filter((x) => x !== file.id)
  }
  saveDb()
  return { status: 204 }
})

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

// --- chat (server-sent events) ----------------------------------------------

route('POST', '/chat', async (ctx) => {
  const message = requireString(ctx.body, 'message', { label: 'Message' })
  const requested = ctx.body.mode === undefined ? 'auto' : ctx.body.mode
  if (!CHAT_MODES.includes(requested)) {
    throw bad('invalid_mode', `mode must be one of: ${CHAT_MODES.join(', ')}.`, 'mode')
  }
  const response = buildChatResponse(message, nodesOf(ctx.user), edgesOf(ctx.user), requested)
  const shouldFail = /__fail\b/.test(message)

  const res = ctx.res
  res.writeHead(200, {
    ...corsHeaders(ctx.req),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  send('start', { mode: response.mode })

  const tokens = response.text.match(/\S+\s*/g) || []
  const failAt = shouldFail ? Math.max(3, Math.floor(tokens.length / 3)) : -1

  for (let i = 0; i < tokens.length; i++) {
    if (res.writableEnded) return { handled: true }
    if (i === failAt) {
      send('error', {
        code: 'stream_failed',
        message: 'The response was interrupted. Retry to ask the same question again.',
      })
      res.end()
      return { handled: true }
    }
    send('token', { token: tokens[i] })
    await sleep(20)
  }

  send('done', {
    citedNodeIds: response.citedNodeIds,
    proposal: response.proposal,
  })
  res.end()
  return { handled: true }
})

// ------------------------------------------------------------- http plumbing

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Mock-Latency, X-Mock-Fail',
    'Access-Control-Expose-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue
    const rp = r.pattern.split('/')
    const pp = pathname.split('/')
    if (rp.length !== pp.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(pp[i])
      else if (rp[i] !== pp[i]) { ok = false; break }
    }
    if (ok) return { ...r, params }
  }
  return null
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 2 * 1024 * 1024) {
        reject(new ApiError(413, 'body_too_large', 'Request body is larger than 2MB. File contents are not uploaded to this API — send metadata only.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new ApiError(400, 'invalid_json', 'Request body is not valid JSON. Check the Content-Type header and the payload.'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(req, res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function sendError(req, res, err) {
  const status = err instanceof ApiError ? err.status : 500
  const code = err instanceof ApiError ? err.code : 'server_error'
  const message =
    err instanceof ApiError
      ? err.message
      : 'The server hit an unexpected error. Retry, and reset with GET /__reset if it persists.'
  if (status === 500) console.error(err)
  const body = { error: { code, message } }
  if (err.field) body.error.field = err.field
  sendJson(req, res, status, body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    return res.end()
  }

  try {
    // Mock controls — documented in the README, for exercising failure paths.
    const latency = Number(req.headers['x-mock-latency'] || url.searchParams.get('__latency') || 0)
    if (latency > 0) await sleep(Math.min(latency, 10_000))

    const forced = Number(req.headers['x-mock-fail'] || url.searchParams.get('__fail') || 0)
    if (forced >= 400) {
      throw new ApiError(forced, 'forced_failure', `Forced ${forced} for testing. Remove the X-Mock-Fail header to get a real response.`)
    }

    const matched = matchRoute(req.method, pathname)
    if (!matched) {
      throw new ApiError(404, 'route_not_found', `No route for ${req.method} ${pathname}. See README.md for the full list of endpoints.`)
    }

    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req)
    const user = matched.auth ? currentUser(req) : null
    const result = await matched.handler({ req, res, body, params: matched.params, query: url.searchParams, user })

    if (result?.handled) return
    if (result.status === 204) {
      res.writeHead(204, corsHeaders(req))
      return res.end()
    }
    sendJson(req, res, result.status, result.body)
  } catch (err) {
    if (res.headersSent) return res.end()
    sendError(req, res, err)
  }
})

loadDb()
server.listen(PORT, () => {
  console.log(`\n  Marketing Canvas API — http://localhost:${PORT}`)
  console.log(`  Demo account: demo@marketingcanvas.dev / password123`)
  console.log(`  Reset data:   curl http://localhost:${PORT}/__reset\n`)
})
