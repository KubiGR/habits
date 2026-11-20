import { useEffect, useMemo, useRef, useState } from 'react'
import { checkId, type Data, type Habit, type Level } from '../lib/data'
import { addDays, fromKey, toKey } from '../lib/dates'
import { cls, isTyping } from '../lib/dom'
import { pressHandlers } from '../lib/press'
import { isOnDay } from '../lib/schedule'
import { playHalf, playTick, playUncheck } from '../lib/sound'
import { dayFraction, formatScore, habitStarts, score } from '../lib/stats'
import { useMediaQuery } from '../lib/useMediaQuery'

/** Days shown before today. */
const PAST = 24
/** Empty days after today, so today sits near the right edge rather than against it. */
const AHEAD = 6
/** Phones have room for only a handful of columns; spend them on past days. */
const AHEAD_NARROW = 1
/** How far ← → move the window. */
const STEP = 7

const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const labelFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

interface Props {
  habits: Habit[]
  checks: Data['checks']
  today: string
  onToggle: (habitId: string, day: string, level: Level | null) => void
}

/** A rolling window of recent days, GitHub-graph style: habits down the side, days across. */
export function RecentGrid({ habits, checks, today, onToggle }: Props) {
  // How many days the window has been moved back from its default position.
  const [back, setBack] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const ahead = useMediaQuery('(max-width: 640px)') ? AHEAD_NARROW : AHEAD

  const first = addDays(fromKey(today), -PAST - back)
  const days = Array.from({ length: PAST + 1 + ahead }, (_, i) => addDays(first, i))
  const keys = days.map(toKey)
  const past = keys.filter((k) => k <= today)
  const shift = (n: number) => setBack((b) => Math.max(0, b + n))

  // Month labels over the columns, one per run of days in the same month.
  const months: { label: string; span: number }[] = []
  for (const d of days) {
    const last = months.at(-1)
    if (last && d.getDate() !== 1) last.span++
    else months.push({ label: monthFmt.format(d), span: 1 })
  }

  const starts = useMemo(() => habitStarts(habits, checks), [habits, checks])
  const levelOf = (habitId: string, day: string): Level | undefined => checks[checkId(habitId, day)]
  const perfect = (day: string) => day <= today && dayFraction(habits, starts, checks, day) === 1

  /** Score in the window, against how much was asked: scheduled days, or the weekly target pro rata. */
  function tally(h: Habit) {
    const s = h.schedule
    const asked =
      s.kind === 'weekly' ? Math.round((s.times * past.length) / 7) : past.filter((k) => isOnDay(s, fromKey(k))).length
    const done = past.reduce((sum, k) => sum + score(levelOf(h.id, k)), 0)
    return { done, asked }
  }

  /** Sets `want`, or clears it if it's already set. */
  function mark(habitId: string, day: string, want: Level) {
    const next = levelOf(habitId, day) === want ? null : want
    onToggle(habitId, day, next)
    if (!next) playUncheck()
    else if (next === 'half') playHalf(0)
    else playTick()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'ArrowLeft') shift(STEP)
      if (e.key === 'ArrowRight') shift(-STEP)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // On narrow screens the grid scrolls sideways; keep the newest days in view.
  const hasHabits = habits.length > 0
  useEffect(() => {
    if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth
  }, [back, hasHabits, ahead])

  return (
    <section className="recent">
      <div className="section-head">
        <h2>{back === 0 ? `Last ${PAST + 1} days` : `${shortFmt.format(days[0])} – ${shortFmt.format(fromKey(past.at(-1) ?? keys[0]))}`}</h2>
        <div className="nav">
          {back > 0 && <button onClick={() => setBack(0)}>Today</button>}
          <button onClick={() => shift(STEP)} aria-label="Earlier">
            ←
          </button>
          <button onClick={() => shift(-STEP)} disabled={back === 0} aria-label="Later">
            →
          </button>
        </div>
      </div>

      {!hasHabits ? (
        <p className="empty">Your days fill in here as you go.</p>
      ) : (
        <div className="grid-wrap" ref={wrap}>
          <table className="grid">
            <thead>
              <tr className="months">
                <th />
                {months.map((m, i) => (
                  // A label over a run of one or two days would collide with the next month's.
                  <th key={i} colSpan={m.span}>
                    {m.span > 2 ? m.label : ''}
                  </th>
                ))}
                <th />
              </tr>
              <tr>
                <th />
                {days.map((d, i) => (
                  <th key={keys[i]} className={cls(keys[i] === today && 'is-today')}>
                    {weekdayFmt.format(d)}
                    <b>{d.getDate()}</b>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const { done, asked } = tally(h)
                return (
                <tr key={h.id}>
                  <th scope="row" title={h.name}>
                    {h.name}
                  </th>
                  {days.map((d, i) => {
                    const k = keys[i]
                    const level = levelOf(h.id, k)
                    const rest = !isOnDay(h.schedule, d)
                    return (
                      <td key={k}>
                        <button
                          className={cls(
                            'cell',
                            level,
                            rest ? 'rest' : d.getDay() % 6 === 0 && 'weekend',
                            k === today && 'is-today',
                          )}
                          disabled={k > today}
                          aria-pressed={level === 'done' ? true : level === 'half' ? 'mixed' : false}
                          aria-label={`${h.name}, ${labelFmt.format(d)}`}
                          title="Click: done · Shift-click, right-click or long-press: half"
                          {...pressHandlers(
                            (e) => mark(h.id, k, e.shiftKey ? 'half' : 'done'),
                            () => mark(h.id, k, 'half'),
                          )}
                        />
                      </td>
                    )
                  })}
                  <td className="count">
                    {formatScore(done)}
                    <span>/{asked}</span>
                  </td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Perfect days</th>
                {keys.map((k) => (
                  <td key={k}>
                    <span className={cls('dot', perfect(k) && 'on')} />
                  </td>
                ))}
                <td className="count">{past.filter(perfect).length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
