import { checkId, type Data, type Habit, type Level } from './data'
import { addDays, fromKey, toKey } from './dates'
import { isOnDay, weekStart } from './schedule'

type Checks = Data['checks']

/** Full checks count 1, halves count ½. */
export const score = (level: Level | undefined) => (level === 'done' ? 1 : level === 'half' ? 0.5 : 0)

/** 2.5 → "2½", 0.5 → "½" */
export function formatScore(n: number) {
  const whole = Math.floor(n)
  if (n === whole) return String(n)
  return whole ? `${whole}½` : '½'
}

export const formatRate = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`)

const valueOn = (checks: Checks, id: string, day: string) => score(checks[checkId(id, day)])

/** First day that counts for a habit: when it was created, or an earlier day filled in late. */
export function startKey(h: Habit, checks: Checks) {
  let start = toKey(new Date(h.createdAt))
  const prefix = `${h.id}:`
  for (const key in checks) {
    if (key.startsWith(prefix) && key.slice(prefix.length) < start) start = key.slice(prefix.length)
  }
  return start
}

/** A weekly habit's score in the week starting `monday`, optionally only through `until`. */
export function weekScore(checks: Checks, id: string, monday: Date, until?: string) {
  let sum = 0
  for (let i = 0; i < 7; i++) {
    const key = toKey(addDays(monday, i))
    if (until !== undefined && key > until) break
    sum += valueOn(checks, id, key)
  }
  return sum
}

/**
 * Whether a habit is asked of you on `day`:
 * due, a rest day (not one of its days), or met (weekly target already reached earlier this week).
 */
export function dayState(h: Habit, checks: Checks, day: string): 'due' | 'rest' | 'met' {
  const d = fromKey(day)
  const s = h.schedule
  if (s.kind === 'days') return isOnDay(s, d) ? 'due' : 'rest'
  if (s.kind === 'weekly') {
    const before = weekScore(checks, h.id, weekStart(d), toKey(addDays(d, -1)))
    return before >= s.times ? 'met' : 'due'
  }
  return 'due'
}

export interface Streak {
  count: number
  unit: 'd' | 'w'
}

// Bounds the walk back through time; a ten-year streak is a nice problem to have.
const MAX_DAYS = 3660
const MAX_WEEKS = 530

/**
 * Daily and specific-days habits: consecutive asked-for days with any check (half counts, showing
 * up keeps the chain), ending today, or yesterday while today is still open. Rest days are skipped.
 * Weekly habits: consecutive weeks that hit the target, counting this week once it's hit.
 */
export function streak(h: Habit, checks: Checks, today: string): Streak {
  const s = h.schedule
  if (s.kind === 'weekly') {
    let monday = weekStart(fromKey(today))
    let count = weekScore(checks, h.id, monday) >= s.times ? 1 : 0
    for (let i = 0; i < MAX_WEEKS; i++) {
      monday = addDays(monday, -7)
      if (weekScore(checks, h.id, monday) < s.times) break
      count++
    }
    return { count, unit: 'w' }
  }
  let d = fromKey(today)
  if (!checks[checkId(h.id, today)]) d = addDays(d, -1)
  let count = 0
  for (let i = 0; i < MAX_DAYS; i++, d = addDays(d, -1)) {
    if (!isOnDay(s, d)) continue
    if (!checks[checkId(h.id, toKey(d))]) break
    count++
  }
  return { count, unit: 'd' }
}

/** Longest streak ever, by the same rules as `streak`. */
export function bestStreak(h: Habit, checks: Checks, start: string, today: string): Streak {
  const s = h.schedule
  let run = 0
  let best = 0
  if (s.kind === 'weekly') {
    const current = weekStart(fromKey(today)).getTime()
    for (let m = weekStart(fromKey(start)); m.getTime() <= current; m = addDays(m, 7)) {
      if (weekScore(checks, h.id, m) >= s.times) best = Math.max(best, ++run)
      else if (m.getTime() !== current) run = 0
    }
    return { count: best, unit: 'w' }
  }
  for (let d = fromKey(start); toKey(d) <= today; d = addDays(d, 1)) {
    if (!isOnDay(s, d)) continue
    const key = toKey(d)
    if (checks[checkId(h.id, key)]) best = Math.max(best, ++run)
    else if (key !== today) run = 0
  }
  return { count: best, unit: 'd' }
}

/**
 * "Never miss twice": the last time this habit was asked of you was missed, and today is too, so far.
 * For weekly habits: last week missed its target and this week hasn't reached it yet.
 */
export function atRisk(h: Habit, checks: Checks, today: string) {
  const s = h.schedule
  const created = toKey(new Date(h.createdAt))
  const t = fromKey(today)
  if (s.kind === 'weekly') {
    const thisWeek = weekStart(t)
    const lastWeek = addDays(thisWeek, -7)
    if (toKey(lastWeek) < created) return false
    return weekScore(checks, h.id, lastWeek) < s.times && weekScore(checks, h.id, thisWeek) < s.times
  }
  if (!isOnDay(s, t) || checks[checkId(h.id, today)]) return false
  let prev = addDays(t, -1)
  for (let i = 0; i < 7 && !isOnDay(s, prev); i++) prev = addDays(prev, -1)
  return toKey(prev) >= created && !checks[checkId(h.id, toKey(prev))]
}

/**
 * Share of asked-for days (or weeks, for weekly habits) that were done, from `from` through today.
 * Today only counts once it's done, since the day isn't over. Null when nothing was asked yet.
 */
export function completion(h: Habit, checks: Checks, from: string, today: string): number | null {
  const s = h.schedule
  let done = 0
  let total = 0
  if (s.kind === 'weekly') {
    const current = weekStart(fromKey(today)).getTime()
    for (let m = weekStart(fromKey(from)); m.getTime() <= current; m = addDays(m, 7)) {
      const share = Math.min(1, weekScore(checks, h.id, m) / s.times)
      if (m.getTime() === current && share < 1) continue
      done += share
      total++
    }
    return total ? done / total : null
  }
  for (let d = fromKey(from); toKey(d) <= today; d = addDays(d, 1)) {
    if (!isOnDay(s, d)) continue
    const key = toKey(d)
    const v = valueOn(checks, h.id, key)
    if (key === today && !v) continue
    done += v
    total++
  }
  return total ? done / total : null
}

/**
 * Per weekday, Monday first: how often the habit was done on that weekday when asked.
 * Shows which days tend to slip. Null for weekdays it's never asked.
 */
export function weekdayRates(h: Habit, checks: Checks, from: string, today: string): (number | null)[] {
  const done = Array<number>(7).fill(0)
  const total = Array<number>(7).fill(0)
  for (let d = fromKey(from); toKey(d) <= today; d = addDays(d, 1)) {
    if (!isOnDay(h.schedule, d)) continue
    const key = toKey(d)
    const v = valueOn(checks, h.id, key)
    if (key === today && !v) continue
    const i = (d.getDay() + 6) % 7
    done[i] += v
    total[i]++
  }
  return done.map((x, i) => (total[i] ? x / total[i] : null))
}

/**
 * How complete a day was: the share of habits asked of you that day that got done (halves count ½).
 * Weekly habits only count on days they were done, since no single day is required of them.
 * Null when nothing was asked that day. Exactly 1 is a perfect day.
 */
export function dayFraction(habits: Habit[], starts: Map<string, string>, checks: Checks, day: string): number | null {
  const d = fromKey(day)
  let done = 0
  let total = 0
  for (const h of habits) {
    if (day < (starts.get(h.id) ?? day)) continue
    const v = valueOn(checks, h.id, day)
    if (h.schedule.kind === 'weekly') {
      if (v) {
        done += v
        total++
      }
    } else if (isOnDay(h.schedule, d)) {
      done += v
      total++
    }
  }
  return total ? done / total : null
}

export const habitStarts = (habits: Habit[], checks: Checks) =>
  new Map(habits.map((h) => [h.id, startKey(h, checks)]))
