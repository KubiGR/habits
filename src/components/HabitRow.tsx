import { useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import type { Habit, Level } from '../lib/data'
import { cls } from '../lib/dom'
import { pressHandlers } from '../lib/press'
import { TIMES_OF_DAY, TIME_LABEL, WEEK_ORDER, dayName, describe, type Schedule } from '../lib/schedule'
import { formatScore, type Streak } from '../lib/stats'

const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

interface RowProps {
  ref: Ref<HTMLLIElement>
  habit: Habit
  index: number
  level: Level | undefined
  state: 'due' | 'rest' | 'met'
  /** This week's progress, for weekly habits. */
  week: { done: number; times: number } | null
  streak: Streak
  atRisk: boolean
  burst: number | null
  /** Vertical shift while a drag is in progress. */
  offset: number
  dragging: boolean
  onMark: (level: Level) => void
  onEdit: () => void
  grip: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
    onPointerCancel: () => void
    onKeyDown: (e: KeyboardEvent) => void
  }
}

export function HabitRow({ ref, ...p }: RowProps) {
  const { habit, level, state, week, streak } = p
  const press = pressHandlers(
    (e) => p.onMark(e.shiftKey ? 'half' : 'done'),
    () => p.onMark('half'),
  )
  const hot = streak.unit === 'd' ? streak.count >= 7 : streak.count >= 4

  let meta: string | null = null
  if (state === 'rest') meta = 'Rest day'
  else if (week) meta = `${formatScore(week.done)} of ${week.times} this week`
  else if (habit.schedule.kind === 'days') meta = describe(habit.schedule)

  return (
    <li
      ref={ref}
      className={cls('habit', level, state !== 'due' && 'off', p.dragging && 'lifted')}
      style={p.offset ? { transform: `translateY(${p.offset}px)` } : undefined}
    >
      <button className="grip" aria-label={`Reorder ${habit.name}; use arrow keys`} title="Drag to reorder" {...p.grip}>
        <span className="num">{p.index < 9 ? p.index + 1 : ''}</span>
        <span className="dots" aria-hidden="true">
          ⠿
        </span>
      </button>
      <button
        className={cls('box', level)}
        {...press}
        aria-pressed={level === 'done' ? true : level === 'half' ? 'mixed' : false}
        aria-label={`${habit.name}: ${level === 'done' ? 'done' : level === 'half' ? 'partly done' : 'not done'} today`}
        title="Click: done · Shift-click or long-press: half"
      >
        <span className="fill" />
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 12.5l4 4 8-9" />
        </svg>
        {p.burst !== null && <span className={cls('burst', level === 'half' && 'soft')} key={p.burst} />}
      </button>

      <button className="name" {...press} tabIndex={-1}>
        <span>{habit.name}</span>
        {p.atRisk ? <span className="miss">Never miss twice</span> : meta && <span className="meta">{meta}</span>}
      </button>

      <span className={cls('streak', hot && 'hot')} title={streak.count ? `${streak.count}-${streak.unit === 'd' ? 'day' : 'week'} streak` : undefined}>
        {streak.count > 0 ? `${streak.count}${streak.unit}` : ''}
      </span>

      <span className="actions">
        <button
          className={cls('half-btn', level === 'half' && 'active')}
          onClick={() => p.onMark('half')}
          aria-pressed={level === 'half'}
          title="Did part of it"
        >
          ½
        </button>
        <button onClick={p.onEdit}>Edit</button>
      </span>
    </li>
  )
}

const KIND_LABEL = { daily: 'Every day', days: 'Some days', weekly: 'Times a week' } as const

function switchKind(current: Schedule, kind: Schedule['kind']): Schedule {
  if (kind === 'daily') return { kind }
  if (kind === 'days') return current.kind === 'days' ? current : { kind, days: [1, 2, 3, 4, 5] }
  return current.kind === 'weekly' ? current : { kind, times: 3 }
}

interface EditorProps {
  habit: Habit
  onSave: (habit: Habit) => void
  onCancel: () => void
  onDelete: () => void
}

export function HabitEditor({ habit, onSave, onCancel, onDelete }: EditorProps) {
  const [name, setName] = useState(habit.name)
  const [schedule, setSchedule] = useState(habit.schedule)
  const [time, setTime] = useState(habit.timeOfDay)
  const [confirming, setConfirming] = useState(false)

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({ ...habit, name: trimmed, schedule, timeOfDay: time })
  }

  function toggleDay(day: number) {
    if (schedule.kind !== 'days') return
    const days = schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day]
    if (days.length) setSchedule({ kind: 'days', days })
  }

  return (
    <li
      className="editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <input
        className="name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
        }}
        aria-label="Habit name"
        maxLength={60}
        autoFocus
      />

      <div className="field">
        <span className="label">Repeat</span>
        <div className="options">
          {(['daily', 'days', 'weekly'] as const).map((kind) => (
            <button key={kind} aria-pressed={schedule.kind === kind} onClick={() => setSchedule(switchKind(schedule, kind))}>
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      {schedule.kind === 'days' && (
        <div className="field">
          <span className="label" />
          <div className="options days">
            {WEEK_ORDER.map((d) => (
              <button key={d} aria-pressed={schedule.days.includes(d)} aria-label={dayName(d)} onClick={() => toggleDay(d)}>
                {dayName(d, narrowDay)}
              </button>
            ))}
          </div>
        </div>
      )}

      {schedule.kind === 'weekly' && (
        <div className="field">
          <span className="label" />
          <div className="stepper">
            <button
              aria-label="Fewer"
              disabled={schedule.times <= 1}
              onClick={() => setSchedule({ kind: 'weekly', times: schedule.times - 1 })}
            >
              −
            </button>
            <span>{schedule.times}× a week</span>
            <button
              aria-label="More"
              disabled={schedule.times >= 7}
              onClick={() => setSchedule({ kind: 'weekly', times: schedule.times + 1 })}
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span className="label">Time</span>
        <div className="options">
          {TIMES_OF_DAY.map((t) => (
            <button key={t} aria-pressed={time === t} onClick={() => setTime(t)}>
              {TIME_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="editor-actions">
        {confirming ? (
          <span className="confirm">
            Delete with history?
            <button onClick={onDelete}>Yes</button>
            <button onClick={() => setConfirming(false)} autoFocus>
              No
            </button>
          </span>
        ) : (
          <button className="danger" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button onClick={onCancel}>Cancel</button>
        <button className="save" onClick={save} disabled={!name.trim()}>
          Save
        </button>
      </div>
    </li>
  )
}
