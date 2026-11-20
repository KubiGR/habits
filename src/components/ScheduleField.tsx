import { WEEK_ORDER, dayName, type Schedule } from '../lib/schedule'

const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

const sameDays = (a: number[], b: number[]) => a.length === b.length && b.every((d) => a.includes(d))
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKENDS = [6, 0]

/** One click for the common schedules; "Pick days" and "Times a week" open their own controls. */
const PRESETS: { label: string; schedule: Schedule; active: (s: Schedule) => boolean }[] = [
  { label: 'Every day', schedule: { kind: 'daily' }, active: (s) => s.kind === 'daily' },
  {
    label: 'Weekdays',
    schedule: { kind: 'days', days: WEEKDAYS },
    active: (s) => s.kind === 'days' && sameDays(s.days, WEEKDAYS),
  },
  {
    label: 'Weekends',
    schedule: { kind: 'days', days: WEEKENDS },
    active: (s) => s.kind === 'days' && sameDays(s.days, WEEKENDS),
  },
  {
    label: 'Pick days',
    schedule: { kind: 'days', days: [1, 3, 5] },
    active: (s) => s.kind === 'days' && !sameDays(s.days, WEEKDAYS) && !sameDays(s.days, WEEKENDS),
  },
  { label: 'Times a week', schedule: { kind: 'weekly', times: 3 }, active: (s) => s.kind === 'weekly' },
]

export function ScheduleField({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  function toggleDay(day: number) {
    if (value.kind !== 'days') return
    const days = value.days.includes(day) ? value.days.filter((d) => d !== day) : [...value.days, day]
    if (days.length) onChange({ kind: 'days', days })
  }

  return (
    <>
      <div className="field">
        <span className="label">Repeat</span>
        <div className="options">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={p.active(value)}
              // Re-picking the active one keeps any days or count already chosen.
              onClick={() => !p.active(value) && onChange(p.schedule)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {value.kind === 'days' && (
        <div className="field">
          <span className="label" />
          <div className="options days">
            {WEEK_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={value.days.includes(d)}
                aria-label={dayName(d)}
                onClick={() => toggleDay(d)}
              >
                {dayName(d, narrowDay)}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.kind === 'weekly' && (
        <div className="field">
          <span className="label" />
          <div className="stepper">
            <button
              type="button"
              aria-label="Fewer"
              disabled={value.times <= 1}
              onClick={() => onChange({ kind: 'weekly', times: value.times - 1 })}
            >
              −
            </button>
            <span>{value.times}× a week</span>
            <button
              type="button"
              aria-label="More"
              disabled={value.times >= 7}
              onClick={() => onChange({ kind: 'weekly', times: value.times + 1 })}
            >
              +
            </button>
          </div>
        </div>
      )}
    </>
  )
}
