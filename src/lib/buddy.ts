import { checkId, type Data, type Habit } from './data'
import { addDays, fromKey, toKey } from './dates'
import { dayFraction, dayState, habitStarts, score } from './stats'

export type Mood = 'new' | 'resting' | 'sad' | 'meh' | 'content' | 'happy' | 'ecstatic'

export interface BuddyState {
  mood: Mood
  /** Weighted share of the last 7 days done (yesterday counts most); null with no history yet. */
  recent: number | null
}

/** A tracker with no history yet starts out content, not sad. */
const FRESH = 0.7

/**
 * How the buddy feels. Mostly the last 7 days, with yesterday counting most, lifted by what's done
 * so far today. Finishing today always makes it ecstatic, whatever came before: showing up is the
 * point, and a bad week shouldn't make a good day feel like nothing.
 */
export function buddyMood(habits: Habit[], checks: Data['checks'], today: string): BuddyState {
  if (!habits.length) return { mood: 'new', recent: null }

  const starts = habitStarts(habits, checks)
  let sum = 0
  let weights = 0
  for (let i = 1; i <= 7; i++) {
    const fraction = dayFraction(habits, starts, checks, toKey(addDays(fromKey(today), -i)))
    if (fraction === null) continue
    sum += fraction * (8 - i)
    weights += 8 - i
  }
  const recent = weights ? sum / weights : null

  const due = habits.filter((h) => dayState(h, checks, today) === 'due')
  if (!due.length) return { mood: 'resting', recent }
  const levels = due.map((h) => checks[checkId(h.id, today)])
  if (levels.every((l) => l === 'done')) return { mood: 'ecstatic', recent }

  const todaySoFar = levels.reduce((s, l) => s + score(l), 0) / due.length
  const energy = (recent ?? FRESH) * 0.6 + todaySoFar * 0.4
  const mood = energy >= 0.6 ? 'happy' : energy >= 0.4 ? 'content' : energy >= 0.2 ? 'meh' : 'sad'
  return { mood, recent }
}
