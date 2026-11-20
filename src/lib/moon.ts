import { fromKey } from './dates'

/** Average length of a lunar cycle, new moon to new moon, in days. */
const SYNODIC = 29.530588853
/** A known new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY = 86_400_000

export interface MoonPhase {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number
  /** Share of the disc that's lit, 0–1. */
  lit: number
  name: string
  /** Whole days until the next full moon; 0 on the day itself. */
  toFull: number
}

// Each name covers an eighth of the cycle, centred on its point (new at 0, first quarter at ¼, …).
const NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
]

/**
 * The moon on a day (taken at local noon), from the average cycle. Good to within about half a day,
 * which is plenty for a name and a picture.
 */
export function moonPhase(day: string): MoonPhase {
  const noon = fromKey(day).getTime() + 12 * 3_600_000
  const age = ((((noon - NEW_MOON) / DAY) % SYNODIC) + SYNODIC) % SYNODIC
  const phase = age / SYNODIC
  return {
    phase,
    lit: (1 - Math.cos(2 * Math.PI * phase)) / 2,
    name: NAMES[Math.round(phase * 8) % 8],
    toFull: Math.round((((0.5 - phase + 1) % 1) * SYNODIC) % SYNODIC),
  }
}

/**
 * SVG path for the lit part of a moon of radius r centred at (r, r), as seen from the northern
 * hemisphere: lit from the right while waxing, from the left while waning.
 */
export function litPath(phase: number, r: number) {
  const k = Math.cos(2 * Math.PI * phase) // 1 at new, 0 at the quarters, −1 at full
  const rx = Math.abs(k) * r
  const waxing = phase < 0.5
  // Down one side along the rim, then back up along the terminator, which bulges toward the lit
  // side for a crescent and away from it for a gibbous moon.
  const rim = waxing ? 1 : 0
  const terminator = waxing === k > 0 ? 0 : 1
  return `M ${r} 0 A ${r} ${r} 0 0 ${rim} ${r} ${2 * r} A ${rx} ${r} 0 0 ${terminator} ${r} 0 Z`
}
