import type { Habit, Schedule } from './data'
import { addDays } from './dates'

export type { Schedule }

/** Monday first, the way most of the world plans a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

/** False only on the off days of a "specific days" habit. Weekly habits can be done any day. */
export const isOnDay = (s: Schedule, d: Date) => s.kind !== 'days' || s.days.includes(d.getDay())

/** Display order: the user's own. */
export const ordered = (habits: Habit[]) => [...habits].sort((a, b) => a.position - b.position)

const shortDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
// 2024-01-07 was a Sunday, so day n of the week is Jan 7 + n.
export const dayName = (day: number, fmt = shortDay) => fmt.format(new Date(2024, 0, 7 + day))

export function describe(s: Schedule) {
  if (s.kind === 'daily') return 'Every day'
  if (s.kind === 'weekly') return `${s.times}× a week`
  const days = [...s.days].sort().join()
  if (days === '1,2,3,4,5') return 'Weekdays'
  if (days === '0,6') return 'Weekends'
  return WEEK_ORDER.filter((d) => s.days.includes(d))
    .map((d) => dayName(d))
    .join(', ')
}
