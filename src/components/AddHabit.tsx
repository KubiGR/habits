import { useRef, useState, type FocusEvent, type FormEvent } from 'react'
import type { Schedule } from '../lib/schedule'
import { ScheduleField } from './ScheduleField'

const SUGGESTIONS = ['Read 10 pages', 'Walk outside', 'Drink water', 'No phone in bed']
const DAILY: Schedule = { kind: 'daily' }

interface Props {
  onAdd: (name: string, schedule: Schedule) => void
  /** Shown when there are no habits yet. */
  suggest: boolean
}

/** The "Add a habit" row. Typing a name opens the schedule options right under it. */
export function AddHabit({ onAdd, suggest }: Props) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState(DAILY)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = focused || name.trim() !== ''

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed, schedule)
    setName('')
    setSchedule(DAILY)
    input.current?.focus()
  }

  function reset() {
    setName('')
    setSchedule(DAILY)
    input.current?.blur()
  }

  function pick(suggestion: string) {
    setName(suggestion)
    input.current?.focus()
  }

  // Only "unfocused" once focus leaves the whole composer, not when moving to an option.
  const onBlur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
  }

  return (
    <li className="adder" onFocus={() => setFocused(true)} onBlur={onBlur}>
      <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && reset()}>
        <div className="habit add">
          <span className="grip" />
          <span className="plus" aria-hidden="true">
            +
          </span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a habit"
            maxLength={60}
            autoComplete="off"
            aria-label="New habit"
          />
        </div>

        {open && (
          <div className="composer">
            <ScheduleField value={schedule} onChange={setSchedule} />
            <div className="editor-actions">
              <span className="spacer" />
              <button type="button" onClick={reset}>
                Cancel
              </button>
              <button type="submit" className="save" disabled={!name.trim()}>
                Add
              </button>
            </div>
          </div>
        )}
      </form>

      {suggest && !name && (
        <div className="suggest">
          <p>Start small. What's one thing you could do every day?</p>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => pick(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}
