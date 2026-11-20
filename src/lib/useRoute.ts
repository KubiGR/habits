import { useEffect, useState } from 'react'

export type Route = 'today' | 'stats' | 'people'

// Hash routes need no server support, so they work the same from Vite, the API server and an installed app.
const current = (): Route => (location.hash === '#/stats' ? 'stats' : location.hash === '#/people' ? 'people' : 'today')

export function useRoute() {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => {
      setRoute(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
