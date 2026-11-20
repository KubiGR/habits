import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { checkId, type Data, type Habit, type Level } from '../lib/data'
import { fromKey } from '../lib/dates'
import { cls, isTyping } from '../lib/dom'
import { haptic } from '../lib/press'
import { weekStart, type Schedule } from '../lib/schedule'
import { playCheck, playComplete, playHalf, playTick, playUncheck } from '../lib/sound'
import { atRisk, dayState, formatScore, score, streak, weekScore } from '../lib/stats'
import { AddHabit } from './AddHabit'
import { HabitEditor, HabitRow } from './HabitRow'

interface Props {
  /** Already in display order. */
  habits: Habit[]
  checks: Data['checks']
  today: string
  onToggle: (habitId: string, day: string, level: Level | null) => void
  onAdd: (name: string, schedule: Schedule) => void
  onSave: (habit: Habit) => void
  onDelete: (id: string) => void
  onReorder: (ids: string[]) => void
}

interface Drag {
  id: string
  from: number
  startY: number
  dy: number
  minDy: number
  maxDy: number
  height: number
  /** Vertical centers of the rows when the drag started. */
  mids: number[]
}

/** Where the dragged row would land: how many other rows' centers are above its center. */
const dropIndex = (d: Drag) => d.mids.filter((m, j) => j !== d.from && m < d.mids[d.from] + d.dy).length

function move<T>(list: T[], from: number, to: number) {
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function Today({ habits, checks, today, onToggle, onAdd, onSave, onDelete, onReorder }: Props) {
  const [burst, setBurst] = useState<{ id: string; n: number } | null>(null)
  const [celebrated, setCelebrated] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())

  const levelOf = (id: string): Level | undefined => checks[checkId(id, today)]
  const states = new Map(habits.map((h) => [h.id, dayState(h, checks, today)]))
  const due = habits.filter((h) => states.get(h.id) === 'due')
  const fullCount = due.filter((h) => levelOf(h.id) === 'done').length
  const total = due.reduce((sum, h) => sum + score(levelOf(h.id)), 0)
  const allDone = due.length > 0 && fullCount === due.length

  /** Sets `want`, or clears it if it's already set. */
  function mark(h: Habit, want: Level) {
    const next = levelOf(h.id) === want ? null : want
    onToggle(h.id, today, next)
    if (!next) return playUncheck()
    setBurst((b) => ({ id: h.id, n: (b?.n ?? 0) + 1 }))
    if (next === 'half') return playHalf(fullCount)
    if (states.get(h.id) !== 'due') return playTick()
    if (fullCount + 1 === due.length) {
      setCelebrated(today)
      playComplete()
    } else {
      playCheck(fullCount)
    }
  }

  function reorder(from: number, to: number) {
    onReorder(move(habits.map((h) => h.id), from, to))
    playTick()
    haptic(8)
  }

  function startDrag(e: PointerEvent<HTMLElement>, h: Habit) {
    if (e.button !== 0) return
    const rects = habits.map((x) => rows.current.get(x.id)!.getBoundingClientRect())
    const from = habits.indexOf(h)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      id: h.id,
      from,
      startY: e.clientY,
      dy: 0,
      minDy: rects[0].top - rects[from].top,
      maxDy: rects.at(-1)!.bottom - rects[from].bottom,
      height: rects[from].height,
      mids: rects.map((r) => r.top + r.height / 2),
    })
  }

  const dyAt = (d: Drag, e: PointerEvent) => Math.min(d.maxDy, Math.max(d.minDy, e.clientY - d.startY))

  function moveDrag(e: PointerEvent) {
    if (!drag) return
    const dy = dyAt(drag, e)
    if (dropIndex({ ...drag, dy }) !== dropIndex(drag)) haptic(5)
    setDrag({ ...drag, dy })
  }

  function endDrag(e: PointerEvent) {
    if (!drag) return
    // From the release point itself: a quick flick can end before the last move has rendered.
    const to = dropIndex({ ...drag, dy: dyAt(drag, e) })
    setDrag(null)
    if (to !== drag.from) reorder(drag.from, to)
  }

  /** How far a row slides to make room while another is dragged past it. */
  function offset(j: number) {
    if (!drag) return 0
    if (j === drag.from) return drag.dy
    const to = dropIndex(drag)
    if (drag.from < to && j > drag.from && j <= to) return -drag.height
    if (drag.from > to && j >= to && j < drag.from) return drag.height
    return 0
  }

  function nudge(from: number, by: -1 | 1) {
    const to = from + by
    if (to >= 0 && to < habits.length) reorder(from, to)
  }

  // Bound again on every render so the handler always sees the latest checks.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || editing) return
      // e.code, not e.key: Shift+1 reports "!" as its key.
      const digit = /^Digit([1-9])$/.exec(e.code)
      const habit = digit && habits[Number(digit[1]) - 1]
      if (!habit) return
      e.preventDefault()
      mark(habit, e.shiftKey ? 'half' : 'done')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section className="today">
      <div className="section-head">
        <h2>Today</h2>
        {due.length > 0 && !allDone && (
          <div className="progress" role="img" aria-label={`${formatScore(total)} of ${due.length} done`}>
            {due.map((h) => (
              <span key={h.id} className={cls('seg', levelOf(h.id))} />
            ))}
            <span className="tally">
              {formatScore(total)}/{due.length}
            </span>
          </div>
        )}
        {allDone && (
          <div className={cls('stamp', celebrated === today && 'animate')} aria-hidden="true">
            All
            <br />
            done
          </div>
        )}
      </div>

      {habits.length > 0 && due.length === 0 && <p className="rest-note">Nothing due today. Rest is part of it.</p>}

      <ul className={cls('habits', drag && 'dragging')}>
        {habits.map((h, index) => {
          if (editing === h.id) {
            return (
              <HabitEditor
                key={h.id}
                habit={h}
                onSave={(next) => {
                  onSave(next)
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
                onDelete={() => {
                  onDelete(h.id)
                  setEditing(null)
                }}
              />
            )
          }
          const s = h.schedule
          return (
            <HabitRow
              key={h.id}
              ref={(el) => {
                if (el) rows.current.set(h.id, el)
                else rows.current.delete(h.id)
              }}
              habit={h}
              index={index}
              level={levelOf(h.id)}
              state={states.get(h.id)!}
              week={s.kind === 'weekly' ? { done: weekScore(checks, h.id, weekStart(fromKey(today))), times: s.times } : null}
              streak={streak(h, checks, today)}
              atRisk={atRisk(h, checks, today)}
              burst={burst?.id === h.id ? burst.n : null}
              offset={offset(index)}
              dragging={drag?.id === h.id}
              onMark={(level) => mark(h, level)}
              onEdit={() => setEditing(h.id)}
              grip={{
                onPointerDown: (e) => startDrag(e, h),
                onPointerMove: moveDrag,
                onPointerUp: endDrag,
                onPointerCancel: () => setDrag(null),
                onKeyDown: (e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    nudge(index, e.key === 'ArrowUp' ? -1 : 1)
                  }
                },
              }}
            />
          )
        })}
        <AddHabit onAdd={onAdd} suggest={habits.length === 0} />
      </ul>

      {allDone && <p className="vote">Every action is a vote for the person you want to become.</p>}
    </section>
  )
}
