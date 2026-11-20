import type { Backend, Data } from './data'

async function request(path: string, init?: RequestInit) {
  // Behind Cloudflare Access, an expired login answers API calls with a redirect to the login page,
  // which fetch can't follow cross-origin. Reloading the page lets the browser do the login instead.
  const res = await fetch(path, { ...init, redirect: 'manual' })
  if (res.type === 'opaqueredirect') {
    location.reload()
    throw new Error('Signed out, reloading to sign in again')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res
}

/** Talks to the local API server (server/index.ts), which stores everything in Postgres. */
export const httpBackend: Backend = {
  async load() {
    return (await (await request('/api/data')).json()) as Data
  },
  async write(op) {
    await request('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) })
  },
}
