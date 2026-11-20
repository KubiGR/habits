import { useCallback, useEffect, useRef, useState } from 'react'
import { apply, type Backend, type Data, type Op } from './data'

const message = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)

/**
 * Optimistic store: changes apply to the UI instantly, then writes go to the
 * backend one at a time, in order. Data reloads whenever the tab comes back
 * into view, so changes made on another device show up.
 */
export function useStore(backend: Backend) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const failed = useRef(false)

  const reload = useCallback(async () => {
    if (pending.current) return
    try {
      const fresh = await backend.load()
      if (!pending.current) setData(fresh)
    } catch (e) {
      setError(`Couldn't load: ${message(e)}`)
    }
  }, [backend])

  useEffect(() => {
    void reload()
    const onShow = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [reload])

  const dispatch = useCallback(
    (op: Op) => {
      setData((d) => (d ? apply(d, op) : d))
      pending.current++
      queue.current = queue.current.then(async () => {
        try {
          await backend.write(op)
        } catch (e) {
          failed.current = true
          setError(`Couldn't save: ${message(e)}`)
        } finally {
          pending.current--
        }
        // After a failed write, resync with what was actually saved.
        if (!pending.current && failed.current) {
          failed.current = false
          await reload()
        }
      })
    },
    [backend, reload],
  )

  return { data, error, dismissError: () => setError(null), dispatch, reload }
}
