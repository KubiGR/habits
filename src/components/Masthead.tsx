import { fromKey } from '../lib/dates'
import { cls } from '../lib/dom'
import { litPath, moonPhase } from '../lib/moon'
import { meteorShower, planets, planetsTonight, starSign } from '../lib/sky'
import type { Route } from '../lib/useRoute'

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

const TITLE: Partial<Record<Route, string>> = { stats: 'Stats', people: 'People' }

interface Props {
  today: string
  route: Route
  /** The owner gets a People tab, with how many are waiting. */
  admin: boolean
  waiting: number
}

export function Masthead({ today, route, admin, waiting }: Props) {
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
            aria-label={waiting ? `People, ${waiting} waiting` : undefined}
          >
            People
            {waiting > 0 && <span className="badge">{waiting}</span>}
          </a>
        )}
      </nav>
      <Sky day={today} />
    </header>
  )
}

const WHEN = { evening: 'evening', night: 'most of the night', dawn: 'before dawn', hidden: 'too close to the Sun' }

/** Tonight's sky under the date: moon, star sign, a meteor shower when one is near, and visible planets. */
function Sky({ day }: { day: string }) {
  const sign = starSign(day)
  const shower = meteorShower(day)
  const { tonight, dawn } = planetsTonight(day)
  const detail = planets(day)
    .map((p) => `${p.name}: ${WHEN[p.when]} (${Math.round(p.elongation)}° from the Sun)`)
    .join('\n')
  return (
    <div className="sky">
      <Moon day={day} />
      <span title="Star sign">
        <span className="sky-glyph" aria-hidden="true">
          {sign.glyph}
        </span>
        {sign.name}
      </span>
      {shower && (
        <span title="Meteor shower">
          <span className="sky-glyph" aria-hidden="true">
            ✦
          </span>
          {shower}
        </span>
      )}
      {(tonight.length > 0 || dawn.length > 0) && (
        <span title={detail}>{tonight.length ? `Tonight: ${tonight.join(', ')}` : `Before dawn: ${dawn.join(', ')}`}</span>
      )}
    </div>
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
      {name !== 'Full moon' && <span className="moon-more"> · {until}</span>}
    </span>
  )
}
