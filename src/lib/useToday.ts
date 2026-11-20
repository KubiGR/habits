import { useEffect, useState } from 'react'
import { toKey } from './dates'

/** Today's day key, rolling over at local midnight. */
export function useToday() {
  const [today, setToday] = useState(() => toKey(new Date()))
  useEffect(() => {
    const tick = () => setToday(toKey(new Date()))
    const id = setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return today
}
