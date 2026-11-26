import { useCallback, useEffect, useState } from 'react'
import type { Person, Status } from '../lib/data'
import { account } from '../lib/http'

const joinedFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const STATUS_LABEL: Record<Status, string> = { approved: 'Active', blocked: 'Blocked' }

/** Owner only: manage access for everyone who has signed in. */
export function People({ me }: { me: string }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPeople(await account.people())
    } catch (e) {
      setError(`Couldn't load people: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function set(email: string, status: Status) {
    setBusy(email)
    setError(null)
    try {
      await account.setStatus(email, status)
      await load()
    } catch (e) {
      setError(`Couldn't update ${email}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="people">
      <div className="section-head">
        <h2>People</h2>
      </div>
      <p className="people-note">
        Anyone can sign in and start tracking their own private habits.
      </p>

      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {!people ? (
        !error && <p className="empty">…</p>
      ) : (
        <ul className="people-list">
          {people.map((p) => (
            <li key={p.email} className={p.status}>
              <div>
                <div className="email">{p.email}</div>
                <div className="meta">
                  {p.email === me ? 'You' : STATUS_LABEL[p.status]} · joined {joinedFmt.format(new Date(p.createdAt))} ·{' '}
                  {p.habits === 1 ? '1 habit' : `${p.habits} habits`}
                </div>
              </div>
              {p.email !== me && (
                <div className="editor-actions">
                  {p.status === 'blocked' ? (
                    <button className="save" disabled={busy === p.email} onClick={() => void set(p.email, 'approved')}>
                      Restore access
                    </button>
                  ) : (
                    <button disabled={busy === p.email} onClick={() => void set(p.email, 'blocked')}>
                      Remove access
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
