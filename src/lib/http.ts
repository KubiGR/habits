import type { Backend, Data, Me, Person, Status } from './data'

const RELOADED_AT = 'habits:signin-reload'

/**
 * Behind Cloudflare Access, an expired login answers API calls with a redirect to the login page
 * (which fetch can't follow cross-origin) or a 401/403; our own server sends 401 only when a request
 * has no valid login. Reloading the page lets the browser sign in. At most once a minute, so a
 * lasting failure can't loop.
 */
function signedOut(): never {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOADED_AT)) || 0
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    // No storage means no way to tell a loop apart, so only show the error.
    last = Date.now()
  }
  if (Date.now() - last > 60_000) location.reload()
  throw new Error('Signed out. Reload the page to sign in again.')
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, redirect: 'manual' })
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) signedOut()
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res
}

const json = { 'content-type': 'application/json' }

/** Cloudflare Access's own sign-out page; it clears the login for this app. */
export const SIGN_OUT = '/cdn-cgi/access/logout'

/** Who is signed in, and approving other people. */
export const account = {
  async me() {
    return (await (await request('/api/me')).json()) as Me
  },
  async people() {
    return (await (await request('/api/people')).json()) as Person[]
  },
  async setStatus(email: string, status: Exclude<Status, 'pending'>) {
    await request('/api/people', { method: 'POST', headers: json, body: JSON.stringify({ email, status }) })
  },
}

/** Talks to the local API server (server/index.ts), which stores everything in Postgres. */
export const httpBackend: Backend = {
  async load() {
    return (await (await request('/api/data')).json()) as Data
  },
  async write(op) {
    await request('/api/ops', { method: 'POST', headers: json, body: JSON.stringify(op) })
  },
}
