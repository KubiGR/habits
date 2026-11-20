import { useMemo } from 'react'
import { checkId, type Data, type Habit } from '../lib/data'
import { addDays, fromKey, toKey } from '../lib/dates'
import { TIME_LABEL, WEEK_ORDER, dayName, describe, isOnDay } from '../lib/schedule'
import {
  bestStreak,
  completion,
  dayFraction,
  formatRate,
  formatScore,
  habitStarts,
  score,
  streak,
  weekdayRates,
  type Streak,
} from '../lib/stats'
import { Heatmap } from './Heatmap'

const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const formatStreak = (s: Streak) => `${s.count}${s.unit}`

interface Props {
  habits: Habit[]
  checks: Data['checks']
  today: string
}

export function Stats({ habits, checks, today }: Props) {
  const starts = useMemo(() => habitStarts(habits, checks), [habits, checks])
  const overall = useMemo(() => {
    const earliest = [...starts.values()].sort()[0] ?? today
    let perfect = 0
    let run = 0
    let bestRun = 0
    for (let d = fromKey(earliest); toKey(d) <= today; d = addDays(d, 1)) {
      const key = toKey(d)
      const f = dayFraction(habits, starts, checks, key)
      if (f === 1) {
        perfect++
        bestRun = Math.max(bestRun, ++run)
      } else if (f !== null && key !== today) {
        run = 0
      }
    }
    const checkIns = Object.values(checks).reduce((sum, l) => sum + score(l), 0)
    return { perfect, bestRun, checkIns }
  }, [habits, starts, checks, today])

  if (!habits.length) return <p className="empty">Add a habit and your stats will grow here.</p>

  return (
    <>
      <section>
        <div className="tiles">
          <Tile value={formatScore(overall.checkIns)} label="Check-ins" />
          <Tile value={overall.perfect} label="Perfect days" />
          <Tile value={`${overall.bestRun}d`} label="Longest perfect run" />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Past year</h2>
        </div>
        <Heatmap
          today={today}
          value={(day) => dayFraction(habits, starts, checks, day)}
          describe={(v) => (v === null ? 'nothing scheduled' : `${formatRate(v)} done`)}
        />
      </section>

      <section>
        <div className="section-head">
          <h2>Habits</h2>
        </div>
        <div className="habit-stats">
          {habits.map((h) => (
            <HabitStats key={h.id} habit={h} checks={checks} start={starts.get(h.id) ?? today} today={today} />
          ))}
        </div>
      </section>
    </>
  )
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function HabitStats({ habit: h, checks, start, today }: { habit: Habit; checks: Data['checks']; start: string; today: string }) {
  const last30 = toKey(addDays(fromKey(today), -29))
  const from30 = last30 > start ? last30 : start
  const rates = weekdayRates(h, checks, start, today)
  const checkIns = Object.entries(checks).reduce((sum, [k, l]) => (k.startsWith(`${h.id}:`) ? sum + score(l) : sum), 0)

  return (
    <article className="habit-card">
      <header>
        <h3>{h.name}</h3>
        <span className="meta">
          {describe(h.schedule)}
          {h.timeOfDay !== 'anytime' && ` · ${TIME_LABEL[h.timeOfDay]}`}
        </span>
      </header>

      <div className="tiles small">
        <Tile value={formatStreak(streak(h, checks, today))} label="Streak" />
        <Tile value={formatStreak(bestStreak(h, checks, start, today))} label="Best" />
        <Tile value={formatRate(completion(h, checks, from30, today))} label="Last 30 days" />
        <Tile value={formatRate(completion(h, checks, start, today))} label="All time" />
        <Tile value={formatScore(checkIns)} label="Check-ins" />
      </div>

      <div className="weekdays" role="img" aria-label="Completion by weekday">
        {WEEK_ORDER.map((d, i) => {
          const r = rates[i]
          return (
            <div key={d} className="weekday" title={`${dayName(d)}: ${r === null ? 'not scheduled' : formatRate(r)}`}>
              <div className="bar">
                <span style={{ height: `${Math.round((r ?? 0) * 100)}%` }} className={r === null ? 'off' : undefined} />
              </div>
              <span>{dayName(d, narrowDay)}</span>
            </div>
          )
        })}
      </div>

      <Heatmap
        today={today}
        value={(day) => {
          if (day < start) return null
          const v = score(checks[checkId(h.id, day)])
          // Days it wasn't asked (off days, or any day of a weekly habit) only show when done.
          const asked = h.schedule.kind !== 'weekly' && isOnDay(h.schedule, fromKey(day))
          return asked || v ? v : null
        }}
        describe={(v) => (v === null ? '–' : v === 1 ? 'done' : v ? 'half' : 'missed')}
      />
    </article>
  )
}
