// Tiny API between the app and Postgres. Runs directly on Node (type stripping, no build step).
//   GET  /api/me      → who is signed in, and whether they're approved
//   GET  /api/data    → their Data snapshot              (approved people only)
//   POST /api/ops     → apply one Op to their habits     (approved people only)
//   GET  /api/people  → everyone who signed in           (owner only)
//   POST /api/people  → approve or block someone         (owner only)
// With dist/ present (after `npm run build`) it also serves the app itself.

import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import postgres from 'postgres'
import type { Data, Level, Me, Op, Person, Schedule, Status } from '../src/lib/data.ts'
import { signedInEmail } from './auth.ts'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '127.0.0.1'
const DIST = join(import.meta.dirname, '..', 'dist')
const MAX_BODY = 64 * 1024

/** Approves everyone else. Habits from before there were people belong to them. */
const OWNER = process.env.OWNER_EMAIL?.trim().toLowerCase()
if (!OWNER) throw new Error('Set OWNER_EMAIL: the person who approves everyone else.')

// The schema re-runs on every start, so its "already exists, skipping" notices are noise.
const sql = postgres(process.env.DATABASE_URL ?? 'postgres://habits:habits@127.0.0.1:5436/habits', { onnotice: () => {} })

await sql.unsafe(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'))
await sql`insert into users (email, status) values (${OWNER}, 'approved')
          on conflict (email) do update set status = 'approved'`
await sql`update habits set owner = ${OWNER} where owner is null`
await sql`alter table habits alter column owner set not null`

async function load(owner: string): Promise<Data> {
  const [habits, checks] = await Promise.all([
    sql<{ id: string; name: string; position: number; created_at: Date; schedule: Schedule }[]>`
      select id, name, position, created_at, schedule from habits where owner = ${owner} order by position, id`,
    sql<{ habit_id: string; day: string; level: Level }[]>`
      select c.habit_id, c.day::text, c.level from checks c join habits h on h.id = c.habit_id
      where h.owner = ${owner}`,
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

/** Applies an Op to `owner`'s habits. Every statement is scoped to them, so ids from someone else do nothing. */
async function write(owner: string, op: Op) {
  switch (op.type) {
    case 'saveHabit': {
      const h = op.habit
      const saved = await sql`
        insert into habits (id, owner, name, position, created_at, schedule)
        values (${h.id}, ${owner}, ${h.name}, ${h.position}, ${h.createdAt}::timestamptz, ${sql.json(h.schedule)})
        on conflict (id) do update set
          name = excluded.name, position = excluded.position, schedule = excluded.schedule
        where habits.owner = excluded.owner
        returning id`
      if (!saved.length) throw new HttpError(404, 'No such habit')
      return
    }
    case 'reorder':
      await sql`
        update habits set position = o.pos - 1
        from unnest(${op.ids}::uuid[]) with ordinality as o(id, pos)
        where habits.id = o.id and habits.owner = ${owner}`
      return
    case 'deleteHabit':
      await sql`delete from habits where id = ${op.id} and owner = ${owner}`
      return
    case 'setCheck':
      if (op.level)
        await sql`insert into checks (habit_id, day, level)
                  select id, ${op.day}::date, ${op.level} from habits where id = ${op.habitId} and owner = ${owner}
                  on conflict (habit_id, day) do update set level = excluded.level`
      else
        await sql`delete from checks using habits
                  where checks.habit_id = habits.id and habits.owner = ${owner}
                    and checks.habit_id = ${op.habitId} and checks.day = ${op.day}`
      return
  }
}

/** The signed-in person; the first request from someone new adds them as pending. */
async function me(req: IncomingMessage): Promise<Me> {
  const email = await signedInEmail(req)
  // Our own 401 only happens when a request skipped Cloudflare Access; the app reloads to sign in.
  if (!email) throw new HttpError(401, 'Not signed in')
  let [user] = await sql<{ status: Status }[]>`select status from users where email = ${email}`
  if (!user) {
    await sql`insert into users (email) values (${email}) on conflict (email) do nothing`
    ;[user] = await sql<{ status: Status }[]>`select status from users where email = ${email}`
    console.log(`New sign-up waiting for approval: ${email}`)
  }
  const admin = email === OWNER
  const waiting = admin ? (await sql`select count(*)::int as n from users where status = 'pending'`)[0].n : 0
  return { email, status: user.status, admin, waiting }
}

async function approved(req: IncomingMessage) {
  const m = await me(req)
  // 409, not 403: the app treats 401/403 as "signed out" (that's what Access sends) and reloads.
  if (m.status !== 'approved') throw new HttpError(409, 'Waiting for approval')
  return m
}

async function people(): Promise<Person[]> {
  const rows = await sql<{ email: string; status: Status; created_at: Date; habits: number }[]>`
    select u.email, u.status, u.created_at, count(h.id)::int as habits
    from users u left join habits h on h.owner = u.email
    group by u.email order by u.status = 'pending' desc, u.created_at desc`
  return rows.map((r) => ({ email: r.email, status: r.status, createdAt: r.created_at.toISOString(), habits: r.habits }))
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

function isStatusChange(v: unknown): v is { email: string; status: 'approved' | 'blocked' } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return isStr(o.email) && (o.status === 'approved' || o.status === 'blocked')
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
    if (path === '/api/me' && req.method === 'GET') return send(res, 200, await me(req))
    if (path === '/api/data' && req.method === 'GET') return send(res, 200, await load((await approved(req)).email))
    if (path === '/api/ops' && req.method === 'POST') {
      const { email } = await approved(req)
      const op = await readJson(req)
      if (!isOp(op)) throw new HttpError(400, 'Invalid op')
      await write(email, op)
      return send(res, 204)
    }
    if (path === '/api/people') {
      // Plain 404 for everyone else, as if the route didn't exist.
      if (!(await approved(req)).admin) throw new HttpError(404, 'Not found')
      if (req.method === 'GET') return send(res, 200, await people())
      if (req.method === 'POST') {
        const change = await readJson(req)
        if (!isStatusChange(change)) throw new HttpError(400, 'Invalid change')
        if (change.email === OWNER) throw new HttpError(400, "The owner can't be blocked")
        const updated = await sql`update users set status = ${change.status} where email = ${change.email} returning email`
        if (!updated.length) throw new HttpError(404, 'No such person')
        return send(res, 204)
      }
      throw new HttpError(405, 'Method not allowed')
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
