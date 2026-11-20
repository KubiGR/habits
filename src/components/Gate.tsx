import { useCallback, useEffect, useState } from 'react'
import type { Me } from '../lib/data'
import { account, httpBackend, SIGN_OUT } from '../lib/http'
import { Tracker } from './Tracker'

/** Finds out who is signed in. Only approved people get the tracker; everyone else waits here. */
export function Gate() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      setMe(await account.me())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Checking again on return picks up an approval, and keeps the owner's waiting count fresh.
  useEffect(() => {
    void check()
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [check])

  if (!me) {
    if (!error) return <div className="loading">…</div>
    return (
      <div className="loading" role="alert">
        <p className="err">Couldn't load: {error}</p>
        <p>
          Is the API running? Try <code>npm run db:up</code> and <code>npm run dev</code>.
        </p>
        <button onClick={() => void check()}>Retry</button>
      </div>
    )
  }

  if (me.status === 'approved') return <Tracker backend={httpBackend} me={me} onPeopleChange={check} />

  return (
    <div className="loading gate">
      {me.status === 'pending' ? (
        <>
          <h1 className="title">Almost there</h1>
          <p>
            You're signed in as <strong>{me.email}</strong>. Your account is waiting for approval; once it's approved,
            this page opens your tracker.
          </p>
          <button onClick={() => void check()}>Check again</button>
        </>
      ) : (
        <>
          <h1 className="title">No access</h1>
          <p>
            <strong>{me.email}</strong> doesn't have access to this tracker.
          </p>
        </>
      )}
      <a href={SIGN_OUT}>Use a different account</a>
    </div>
  )
}
