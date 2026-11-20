// Tiny API between the app and Postgres. Runs directly on Node (type stripping, no build step).
//   GET  /api/data  → the whole Data snapshot
//   POST /api/ops   → apply one Op
// With dist/ present (after `npm run build`) it also serves the app itself.

import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import postgres from 'postgres'
import type { Data, Level, Op, Schedule } from '../src/lib/data.ts'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '127.0.0.1'
const DIST = join(import.meta.dirname, '..', 'dist')
const MAX_BODY = 64 * 1024

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://habits:habits@127.0.0.1:5436/habits')

await sql.unsafe(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'))

async function load(): Promise<Data> {
  const [habits, checks] = await Promise.all([
    sql<{ id: string; name: string; position: number; created_at: Date; schedule: Schedule }[]>`
      select id, name, position, created_at, schedule from habits order by position, id`,
    sql<{ habit_id: string; day: string; level: Level }[]>`select habit_id, day::text, level from checks`,
  ])
  return {
    habits: habits.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      createdAt: r.created_at.toISOString(),
      schedule: r.schedule,
    })),
    checks: Object.fromEntries(checks.map((r) => [`${r.habit_id}:${r.day}`, r.level])),
  }
}

async function write(op: Op) {
  switch (op.type) {
    case 'saveHabit': {
      const h = op.habit
      await sql`
        insert into habits (id, name, position, created_at, schedule)
        values (${h.id}, ${h.name}, ${h.position}, ${h.createdAt}::timestamptz, ${sql.json(h.schedule)})
        on conflict (id) do update set
          name = excluded.name, position = excluded.position, schedule = excluded.schedule`
      return
    }
    case 'reorder':
      await sql`
        update habits set position = o.pos - 1
        from unnest(${op.ids}::uuid[]) with ordinality as o(id, pos)
        where habits.id = o.id`
      return
    case 'deleteHabit':
      await sql`delete from habits where id = ${op.id}`
      return
    case 'setCheck':
      if (op.level)
        await sql`insert into checks (habit_id, day, level) values (${op.habitId}, ${op.day}, ${op.level})
                  on conflict (habit_id, day) do update set level = excluded.level`
      else await sql`delete from checks where habit_id = ${op.habitId} and day = ${op.day}`
      return
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isDay = (v: unknown) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isUuid = (v: unknown) => isStr(v) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function isSchedule(v: unknown): v is Schedule {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (s.kind === 'daily') return true
  if (s.kind === 'weekly') return Number.isInteger(s.times) && (s.times as number) >= 1 && (s.times as number) <= 7
  if (s.kind === 'days') {
    const days = s.days
    return (
      Array.isArray(days) &&
      days.length >= 1 &&
      days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      new Set(days).size === days.length
    )
  }
  return false
}

/** The app is the only client, but a malformed body should get a 400, not a 500. */
function isOp(v: unknown): v is Op {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  switch (o.type) {
    case 'saveHabit': {
      const h = o.habit as Record<string, unknown> | null
      return (
        !!h &&
        isStr(h.id) &&
        isStr(h.name) &&
        Number.isInteger(h.position) &&
        isStr(h.createdAt) &&
        isSchedule(h.schedule)
      )
    }
    case 'reorder':
      return Array.isArray(o.ids) && o.ids.length <= 1000 && o.ids.every(isUuid)
    case 'deleteHabit':
      return isStr(o.id)
    case 'setCheck':
      return isStr(o.habitId) && isDay(o.day) && (o.level === null || o.level === 'done' || o.level === 'half')
    default:
      return false
  }
}

async function readJson(req: IncomingMessage) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'Body too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

// Vite fingerprints everything under /assets/, so those never change; anything else must be
// revalidated, the service worker above all, or an installed app would never pick up updates.
const cacheControl = (path: string) =>
  path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'

async function serveStatic(path: string, res: ServerResponse) {
  // `path` is an absolute URL path, so normalizing it can't climb above DIST.
  const file = join(DIST, path === '/' ? 'index.html' : normalize(path))
  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': cacheControl(path),
    })
    res.end(body)
  } catch {
    // Unknown paths fall back to the app shell.
    try {
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' })
      res.end(await readFile(join(DIST, 'index.html')))
    } catch {
      send(res, 404, { error: 'Not found. Run `npm run build` to serve the app from here.' })
    }
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  try {
    if (path === '/api/data' && req.method === 'GET') return send(res, 200, await load())
    if (path === '/api/ops' && req.method === 'POST') {
      const op = await readJson(req)
      if (!isOp(op)) throw new HttpError(400, 'Invalid op')
      await write(op)
      return send(res, 204)
    }
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found')
    // Node drops the body from HEAD responses by itself.
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(path, res)
    throw new HttpError(405, 'Method not allowed')
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message })
    console.error(e)
    send(res, 500, { error: e instanceof Error ? e.message : 'Server error' })
  }
}).listen(PORT, HOST, () => console.log(`habits api on http://${HOST}:${PORT}`))
