import type { Backend, Data } from './data'

async function request(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
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
