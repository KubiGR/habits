import { useEffect, useRef } from 'react'
import { addDays, fromKey, toKey } from '../lib/dates'
import { cls } from '../lib/dom'
import { weekStart } from '../lib/schedule'

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const labelFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

/** 0 → empty, partial → two steps of ink, 1 → solid. Null means nothing was asked that day. */
function shade(v: number | null) {
  if (v === null) return 'none'
  if (v === 0) return 'l0'
  if (v < 0.5) return 'l1'
  if (v < 1) return 'l2'
  return 'l3'
}

interface Props {
  today: string
  /** 0–1 for a day, or null when nothing was asked of you. */
  value: (day: string) => number | null
  describe: (v: number | null) => string
  weeks?: number
}

/** GitHub-style year graph: a column per week (Monday on top), a square per day. */
export function Heatmap({ today, value, describe, weeks = 53 }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const first = addDays(weekStart(fromKey(today)), -7 * (weeks - 1))

  // On narrow screens the graph scrolls sideways; start at the recent end.
  useEffect(() => {
    if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth
  }, [])

  const cells = []
  const months = []
  let lastLabel = -4
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d)
      const key = toKey(date)
      // Label a month over the week its 1st falls in, unless the previous label is too close.
      if (date.getDate() === 1 && w - lastLabel >= 3) {
        months.push(
          <span key={key} className="heat-month" style={{ gridColumn: w + 1 }}>
            {monthFmt.format(date)}
          </span>,
        )
        lastLabel = w
      }
      if (key > today) continue
      const v = value(key)
      cells.push(
        <span
          key={key}
          className={cls('heat-cell', shade(v), key === today && 'is-today')}
          style={{ gridColumn: w + 1, gridRow: d + 2 }}
          title={`${labelFmt.format(date)}: ${describe(v)}`}
        />,
      )
    }
  }

  return (
    <div className="heat-wrap" ref={wrap}>
      <div className="heat" style={{ gridTemplateColumns: `repeat(${weeks}, var(--heat-cell))` }} role="img" aria-label="Activity over the past year">
        {months}
        {cells}
      </div>
    </div>
  )
}
