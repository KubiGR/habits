// Who is asking. In production Cloudflare Access sits in front of the app and signs every request
// it lets through (the Cf-Access-Jwt-Assertion header). We check that signature ourselves, so a
// request that reaches the server some other way can't claim to be anyone.
// In development there is no Access, and DEV_USER stands in for whoever is asking.

import { webcrypto } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const TEAM = process.env.ACCESS_TEAM_DOMAIN // e.g. yourteam.cloudflareaccess.com
const AUD = process.env.ACCESS_AUD // the Access application's audience tag
const DEV_USER = process.env.DEV_USER?.trim().toLowerCase()

if (!(TEAM && AUD) && !DEV_USER)
  throw new Error('Set ACCESS_TEAM_DOMAIN and ACCESS_AUD (Cloudflare Access), or DEV_USER for local development.')
if (TEAM && AUD && DEV_USER) console.warn('Cloudflare Access is configured, so DEV_USER is ignored.')

let keys = new Map<string, webcrypto.CryptoKey>()
let fetchedAt = 0

/** Access rotates its signing keys, so refetch on an unknown key id, at most once a minute. */
async function signingKey(kid: string) {
  if (!keys.has(kid) && Date.now() - fetchedAt > 60_000) {
    fetchedAt = Date.now()
    const res = await fetch(`https://${TEAM}/cdn-cgi/access/certs`)
    if (!res.ok) throw new Error(`Couldn't fetch Access signing keys: ${res.status}`)
    const { keys: jwks } = (await res.json()) as { keys: (webcrypto.JsonWebKey & { kid: string })[] }
    const imported = await Promise.all(
      jwks.map(async (k) => {
        const key = await webcrypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
        return [k.kid, key] as const
      }),
    )
    keys = new Map(imported)
  }
  return keys.get(kid)
}

const decode = (part: string) => new Uint8Array(Buffer.from(part, 'base64url'))
const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>

/** The signed-in email, lowercased, or null when the request has no valid Access login. */
export async function signedInEmail(req: IncomingMessage): Promise<string | null> {
  if (!TEAM || !AUD) return DEV_USER ?? null

  const token = req.headers['cf-access-jwt-assertion']
  if (typeof token !== 'string') return null
  const [head, payload, signature] = token.split('.')
  if (!head || !payload || !signature) return null

  let header: Record<string, unknown>, claims: Record<string, unknown>
  try {
    header = json(head)
    claims = json(payload)
  } catch {
    return null
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null

  const key = await signingKey(header.kid)
  if (!key) return null
  const valid = await webcrypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decode(signature),
    new TextEncoder().encode(`${head}.${payload}`),
  )
  if (!valid) return null

  const now = Date.now() / 1000
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(AUD)) return null
  if (claims.iss !== `https://${TEAM}`) return null
  if (typeof claims.exp !== 'number' || claims.exp < now) return null
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return null
  if (typeof claims.email !== 'string' || !claims.email) return null
  return claims.email.toLowerCase()
}
