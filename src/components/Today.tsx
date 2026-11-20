import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { checkId, type Data, type Habit, type Level } from '../lib/data'
import { fromKey } from '../lib/dates'
import { cls, isTyping } from '../lib/dom'
import { haptic } from '../lib/press'
import { TIMES_OF_DAY, TIME_LABEL, weekStart, type TimeOfDay } from '../lib/schedule'
import { playCheck, playComplete, playHalf, playTick, playUncheck } from '../lib/sound'
import { atRisk, dayState, formatScore, score, streak, weekScore } from '../lib/stats'
import { HabitEditor, HabitRow } from './HabitRow'

const SUGGESTIONS = ['Read 10 pages', 'Walk outside', 'Drink water', 'No phone in bed']

interface Props {
  /** Already in display order (see `ordered`). */
  habits: Habit[]
  checks: Data['checks']
  today: string
  onToggle: (habitId: string, day: string, level: Level | null) => void
  onAdd: (name: string) => void
  onSave: (habit: Habit) => void
  onDelete: (id: string) => void
  onReorder: (ids: string[]) => void
}

interface Drag {
  id: string
  /** Ids of the dragged habit's time-of-day group, in order. */
  group: string[]
  from: number
  startY: number
  dy: number
  minDy: number
  maxDy: number
  height: number
  /** Vertical centers of the group's rows when the drag started. */
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

  const groups = TIMES_OF_DAY.map((time) => ({ time, items: habits.filter((h) => h.timeOfDay === time) })).filter(
    (g) => g.items.length,
  )
  // Section labels only earn their space once something isn't "Anytime".
  const showLabels = groups.some((g) => g.time !== 'anytime')

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

  function reorderGroup(time: TimeOfDay, ids: string[]) {
    const queue = [...ids]
    onReorder(habits.map((h) => (h.timeOfDay === time ? queue.shift()! : h.id)))
    playTick()
    haptic(8)
  }

  function startDrag(e: PointerEvent<HTMLElement>, h: Habit) {
    if (e.button !== 0) return
    const group = habits.filter((x) => x.timeOfDay === h.timeOfDay).map((x) => x.id)
    const rects = group.map((id) => rows.current.get(id)!.getBoundingClientRect())
    const from = group.indexOf(h.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      id: h.id,
      group,
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

  function endDrag(e: PointerEvent, h: Habit) {
    if (!drag) return
    // From the release point itself: a quick flick can end before the last move has rendered.
    const to = dropIndex({ ...drag, dy: dyAt(drag, e) })
    setDrag(null)
    if (to !== drag.from) reorderGroup(h.timeOfDay, move(drag.group, drag.from, to))
  }

  /** How far a row slides to make room while another is dragged past it. */
  function offset(id: string) {
    if (!drag) return 0
    const j = drag.group.indexOf(id)
    if (j === -1) return 0
    if (j === drag.from) return drag.dy
    const to = dropIndex(drag)
    if (drag.from < to && j > drag.from && j <= to) return -drag.height
    if (drag.from > to && j >= to && j < drag.from) return drag.height
    return 0
  }

  function nudge(h: Habit, by: -1 | 1) {
    const group = habits.filter((x) => x.timeOfDay === h.timeOfDay).map((x) => x.id)
    const from = group.indexOf(h.id)
    const to = from + by
    if (to < 0 || to >= group.length) return
    reorderGroup(h.timeOfDay, move(group, from, to))
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
      </div>

      {allDone && (
        <div className={cls('stamp', celebrated === today && 'animate')} aria-hidden="true">
          All
          <br />
          done
        </div>
      )}
      {habits.length > 0 && due.length === 0 && <p className="rest-note">Nothing due today. Rest is part of it.</p>}

      <div className={cls('groups', drag && 'dragging')}>
        {groups.map((g) => (
          <div key={g.time} className="group">
            {showLabels && <h3 className="group-label">{TIME_LABEL[g.time]}</h3>}
            <ul className="habits">
              {g.items.map((h) => {
                const index = habits.indexOf(h)
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
                const state = states.get(h.id)!
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
                    state={state}
                    week={s.kind === 'weekly' ? { done: weekScore(checks, h.id, weekStart(fromKey(today))), times: s.times } : null}
                    streak={streak(h, checks, today)}
                    atRisk={atRisk(h, checks, today)}
                    burst={burst?.id === h.id ? burst.n : null}
                    offset={offset(h.id)}
                    dragging={drag?.id === h.id}
                    onMark={(level) => mark(h, level)}
                    onEdit={() => setEditing(h.id)}
                    grip={{
                      onPointerDown: (e) => startDrag(e, h),
                      onPointerMove: moveDrag,
                      onPointerUp: (e) => endDrag(e, h),
                      onPointerCancel: () => setDrag(null),
                      onKeyDown: (e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          nudge(h, e.key === 'ArrowUp' ? -1 : 1)
                        }
                      },
                    }}
                  />
                )
              })}
            </ul>
          </div>
        ))}
        <ul className="habits">
          <AddHabit onAdd={onAdd} />
        </ul>
      </div>

      {habits.length === 0 && (
        <div className="suggest">
          <p>Start small. What's one thing you could do every day?</p>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => onAdd(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {allDone && <p className="vote">Every action is a vote for the person you want to become.</p>}
    </section>
  )
}

function AddHabit({ onAdd }: { onAdd: (name: string) => void }) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement
    const v = input.value.trim()
    if (!v) return
    onAdd(v)
    input.value = ''
  }
  return (
    <li className="habit add">
      <span className="grip" />
      <span className="plus" aria-hidden="true">
        +
      </span>
      <form onSubmit={submit}>
        <input name="name" placeholder="Add a habit" maxLength={60} autoComplete="off" aria-label="New habit" />
      </form>
    </li>
  )
}
