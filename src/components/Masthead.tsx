import { fromKey } from '../lib/dates'
import { cls } from '../lib/dom'
import { litPath, moonPhase } from '../lib/moon'
import type { Route } from '../lib/useRoute'

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

const TITLE: Partial<Record<Route, string>> = { stats: 'Stats', people: 'People' }

interface Props {
  today: string
  route: Route
  admin: boolean
}

export function Masthead({ today, route, admin }: Props) {
  const d = fromKey(today)
  return (
    <header className="masthead">
      <div>
        <h1 className="title">{TITLE[route] ?? weekdayFmt.format(d)}</h1>
        <div className="date">{dateFmt.format(d)}</div>
      </div>
      <nav className="tabs">
        <a href="#/" className={cls(route === 'today' && 'active')} aria-current={route === 'today' ? 'page' : undefined}>
          Today
        </a>
        <a href="#/stats" className={cls(route === 'stats' && 'active')} aria-current={route === 'stats' ? 'page' : undefined}>
          Stats
        </a>
        {admin && (
          <a
            href="#/people"
            className={cls(route === 'people' && 'active')}
            aria-current={route === 'people' ? 'page' : undefined}
          >
            People
          </a>
        )}
      </nav>
      <div className="sky">
        <Moon day={today} />
      </div>
    </header>
  )
}

function Moon({ day }: { day: string }) {
  const { phase, lit, name, toFull } = moonPhase(day)
  const r = 6.5
  const until = toFull === 1 ? 'full tomorrow' : `full in ${toFull} days`
  return (
    <span className="moon" title={`${name}, ${Math.round(lit * 100)}% lit`}>
      <svg viewBox={`-1 -1 ${2 * r + 2} ${2 * r + 2}`} aria-hidden="true">
        <circle cx={r} cy={r} r={r} />
        {lit > 0.01 && <path d={litPath(phase, r)} />}
      </svg>
      {name}
      {name !== 'Full moon' && <span> · {until}</span>}
    </span>
  )
}
