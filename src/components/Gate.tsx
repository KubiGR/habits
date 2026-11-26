import { useCallback, useEffect, useState } from 'react'
import type { Me } from '../lib/data'
import { account, httpBackend, SIGN_OUT } from '../lib/http'
import { Tracker } from './Tracker'

/** Finds out whether the signed-in person can use the tracker. */
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

  // Checking again on return picks up changes to account access.
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

  if (me.status === 'approved') return <Tracker backend={httpBackend} me={me} />

  return (
    <div className="loading gate">
      <h1 className="title">No access</h1>
      <p>
        <strong>{me.email}</strong> doesn't have access to this tracker.
      </p>
      <a href={SIGN_OUT}>Use a different account</a>
    </div>
  )
}
