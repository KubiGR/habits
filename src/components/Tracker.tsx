import { useEffect, useState } from 'react'
import { applyAppearance, nextAppearance, readAppearance } from '../lib/appearance'
import type { Backend, Level, Me } from '../lib/data'
import { SIGN_OUT } from '../lib/http'
import { ordered, type Schedule } from '../lib/schedule'
import { setSoundEnabled } from '../lib/sound'
import { useRoute } from '../lib/useRoute'
import { useStore } from '../lib/useStore'
import { useToday } from '../lib/useToday'
import { Masthead } from './Masthead'
import { People } from './People'
import { RecentGrid } from './RecentGrid'
import { Stats } from './Stats'
import { Today } from './Today'

const SOUND_KEY = 'habits:sound'

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'
  } catch {
    return true
  }
}

interface Props {
  backend: Backend
  me: Me
  /** After approving or blocking someone, so the waiting count updates. */
  onPeopleChange: () => void
}

export function Tracker({ backend, me, onPeopleChange }: Props) {
  const today = useToday()
  const { data, error, dismissError, dispatch, reload } = useStore(backend)
  const [sound, setSound] = useState(readSoundPref)
  const [appearance, setAppearance] = useState(readAppearance)
  const route = useRoute()

  useEffect(() => applyAppearance(appearance), [appearance])

  useEffect(() => {
    setSoundEnabled(sound)
    try {
      localStorage.setItem(SOUND_KEY, sound ? '1' : '0')
    } catch {
      // Preference just won't persist.
    }
  }, [sound])

  if (!data) {
    if (!error) return <div className="loading">…</div>
    return (
      <div className="loading" role="alert">
        <p className="err">{error}</p>
        <p>
          Is the API running? Try <code>npm run db:up</code> and <code>npm run dev</code>.
        </p>
        <button
          onClick={() => {
            dismissError()
            void reload()
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const { checks } = data
  const habits = ordered(data.habits)
  const toggle = (habitId: string, day: string, level: Level | null) =>
    dispatch({ type: 'setCheck', habitId, day, level })

  function addHabit(name: string, schedule: Schedule) {
    const position = habits.reduce((max, h) => Math.max(max, h.position), -1) + 1
    dispatch({
      type: 'saveHabit',
      habit: {
        id: crypto.randomUUID(),
        name,
        position,
        createdAt: new Date().toISOString(),
        schedule,
      },
    })
  }

  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `habits-${today}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="page">
      <Masthead today={today} route={route} admin={me.admin} waiting={me.waiting} />
      {route === 'people' && me.admin ? (
        <People me={me.email} onChange={onPeopleChange} />
      ) : route === 'stats' ? (
        <Stats habits={habits} checks={checks} today={today} />
      ) : (
        <>
          <Today
            habits={habits}
            checks={checks}
            today={today}
            onToggle={toggle}
            onAdd={addHabit}
            onSave={(habit) => dispatch({ type: 'saveHabit', habit })}
            onDelete={(id) => dispatch({ type: 'deleteHabit', id })}
            onReorder={(ids) => dispatch({ type: 'reorder', ids })}
          />
          <RecentGrid habits={habits} checks={checks} today={today} onToggle={toggle} />
        </>
      )}

      <footer className="foot">
        <span className="who">{me.email}</span>
        <a href={SIGN_OUT}>Sign out</a>
        <span className="spacer" />
        {route === 'today' && <span className="hint">1–9 check · ⇧ half · ← → week</span>}
        <button onClick={() => setAppearance((a) => nextAppearance[a])} title="Auto follows your system setting">
          {appearance === 'auto' ? 'Auto' : appearance === 'light' ? 'Light' : 'Dark'}
        </button>
        <button onClick={() => setSound((s) => !s)}>{sound ? 'Sound on' : 'Sound off'}</button>
        <button onClick={exportData}>Export</button>
      </footer>

      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={dismissError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </main>
  )
}
