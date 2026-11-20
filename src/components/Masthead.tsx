import { fromKey } from '../lib/dates'
import { cls } from '../lib/dom'
import type { Route } from '../lib/useRoute'

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

export function Masthead({ today, route }: { today: string; route: Route }) {
  const d = fromKey(today)
  return (
    <header className="masthead">
      <div>
        <h1 className="title">{route === 'stats' ? 'Stats' : weekdayFmt.format(d)}</h1>
        <div className="date">{dateFmt.format(d)}</div>
      </div>
      <nav className="tabs">
        <a href="#/" className={cls(route === 'today' && 'active')} aria-current={route === 'today' ? 'page' : undefined}>
          Today
        </a>
        <a href="#/stats" className={cls(route === 'stats' && 'active')} aria-current={route === 'stats' ? 'page' : undefined}>
          Stats
        </a>
      </nav>
    </header>
  )
}
