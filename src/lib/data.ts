// No imports here: the server shares these types and resolves modules more strictly than Vite.

export type Schedule =
  | { kind: 'daily' }
  /** Days of the week, 0 = Sunday … 6 = Saturday (Date.getDay). */
  | { kind: 'days'; days: number[] }
  /** Any days, this many times per Monday-to-Sunday week. */
  | { kind: 'weekly'; times: number }


export interface Habit {
  id: string
  name: string
  /** Order in the list. */
  position: number
  createdAt: string
  schedule: Schedule
}

/** A full check, or "did part of it". */
export type Level = 'done' | 'half'

export interface Data {
  habits: Habit[]
  /** `${habitId}:${day}` → level; days without an entry weren't done */
  checks: Record<string, Level>
}

export type Op =
  | { type: 'saveHabit'; habit: Habit }
  | { type: 'deleteHabit'; id: string }
  | { type: 'setCheck'; habitId: string; day: string; level: Level | null }
  /** Every habit id, in the new order; positions become their indexes. */
  | { type: 'reorder'; ids: string[] }

/** Everyone who signs in starts approved. The owner can block or restore access. */
export type Status = 'approved' | 'blocked'

/** GET /api/me */
export interface Me {
  email: string
  status: Status
  /** The owner, who manages account access. */
  admin: boolean
}

/** GET /api/people (owner only) */
export interface Person {
  email: string
  status: Status
  createdAt: string
  habits: number
}

/** Where data lives. Every change goes through `write` as an Op. */
export interface Backend {
  load(): Promise<Data>
  write(op: Op): Promise<void>
}

export const checkId = (habitId: string, day: string) => `${habitId}:${day}`

const byPosition = (a: Habit, b: Habit) => a.position - b.position

/** Pure reducer: applies a change to the UI state before the server confirms it. */
export function apply(d: Data, op: Op): Data {
  switch (op.type) {
    case 'saveHabit':
      return { ...d, habits: [...d.habits.filter((h) => h.id !== op.habit.id), op.habit].sort(byPosition) }
    case 'deleteHabit': {
      const prefix = `${op.id}:`
      const checks = Object.fromEntries(Object.entries(d.checks).filter(([k]) => !k.startsWith(prefix)))
      return { ...d, habits: d.habits.filter((h) => h.id !== op.id), checks }
    }
    case 'setCheck': {
      const checks = { ...d.checks }
      const key = checkId(op.habitId, op.day)
      if (op.level) checks[key] = op.level
      else delete checks[key]
      return { ...d, checks }
    }
    case 'reorder': {
      const index = new Map(op.ids.map((id, i) => [id, i]))
      const habits = d.habits.map((h) => ({ ...h, position: index.get(h.id) ?? h.position }))
      return { ...d, habits: habits.sort(byPosition) }
    }
  }
}
