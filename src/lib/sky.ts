import { addDays, fromKey } from './dates'

// ── Star sign ───────────────────────────────

/** Western (tropical) signs, each from the day it starts. */
const SIGNS = [
  { from: [1, 20], name: 'Aquarius', glyph: '♒' },
  { from: [2, 19], name: 'Pisces', glyph: '♓' },
  { from: [3, 21], name: 'Aries', glyph: '♈' },
  { from: [4, 20], name: 'Taurus', glyph: '♉' },
  { from: [5, 21], name: 'Gemini', glyph: '♊' },
  { from: [6, 21], name: 'Cancer', glyph: '♋' },
  { from: [7, 23], name: 'Leo', glyph: '♌' },
  { from: [8, 23], name: 'Virgo', glyph: '♍' },
  { from: [9, 23], name: 'Libra', glyph: '♎' },
  { from: [10, 23], name: 'Scorpio', glyph: '♏' },
  { from: [11, 22], name: 'Sagittarius', glyph: '♐' },
  { from: [12, 22], name: 'Capricorn', glyph: '♑' },
] as const

// U+FE0E asks for the plain text glyph; without it phones draw these as purple emoji.
const TEXT = '︎'

export function starSign(day: string) {
  const d = fromKey(day)
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  // Before Aquarius starts on Jan 20 it's still Capricorn from last December.
  const sign = SIGNS.findLast((s) => md >= s.from[0] * 100 + s.from[1]) ?? SIGNS[SIGNS.length - 1]
  return { name: sign.name, glyph: sign.glyph + TEXT }
}

// ── Meteor showers ──────────────────────────

/** The major annual showers and their usual peak (it drifts by a day or so from year to year). */
const SHOWERS = [
  { name: 'Quadrantids', peak: [1, 3] },
  { name: 'Lyrids', peak: [4, 22] },
  { name: 'Eta Aquariids', peak: [5, 6] },
  { name: 'Perseids', peak: [8, 12] },
  { name: 'Draconids', peak: [10, 8] },
  { name: 'Orionids', peak: [10, 21] },
  { name: 'Leonids', peak: [11, 17] },
  { name: 'Geminids', peak: [12, 14] },
  { name: 'Ursids', peak: [12, 22] },
] as const

/** A shower peaking within the next week (or last night), as a short phrase; null otherwise. */
export function meteorShower(day: string): string | null {
  for (let ahead = -1; ahead <= 7; ahead++) {
    const d = addDays(fromKey(day), ahead)
    const shower = SHOWERS.find((s) => s.peak[0] === d.getMonth() + 1 && s.peak[1] === d.getDate())
    if (!shower) continue
    if (ahead === -1) return `${shower.name} still active`
    if (ahead === 0) return `${shower.name} peak tonight`
    if (ahead === 1) return `${shower.name} peak tomorrow`
    return `${shower.name} in ${ahead} days`
  }
  return null
}

// ── Planets ─────────────────────────────────

/**
 * Keplerian elements at J2000 and their change per century, from JPL's "Approximate Positions of
 * the Planets" (valid 1800–2050): a (au), e, I, L, long. of perihelion, long. of node (degrees).
 */
const ELEMENTS = {
  Mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
            0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255,
          0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
          0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
         0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
            -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
           -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
} as const

type Planet = Exclude<keyof typeof ELEMENTS, 'Earth'>
const PLANETS: Planet[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']

/** How far from the Sun (degrees) each has to be to show in twilight; Mercury needs the most room. */
const MIN_ELONGATION: Record<Planet, number> = { Mercury: 18, Venus: 10, Mars: 15, Jupiter: 15, Saturn: 15 }

const RAD = Math.PI / 180

/** Heliocentric ecliptic position (au) at T Julian centuries since J2000. */
function position(body: keyof typeof ELEMENTS, T: number) {
  const el = ELEMENTS[body]
  const [a, e, I, L, peri, node] = el.slice(0, 6).map((v, i) => v + el[i + 6] * T)
  const w = (peri - node) * RAD
  const W = node * RAD
  const inc = I * RAD
  let M = ((((L - peri) % 360) + 540) % 360) - 180
  M *= RAD
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const [cw, sw, cW, sW, cI, sI] = [Math.cos(w), Math.sin(w), Math.cos(W), Math.sin(W), Math.cos(inc), Math.sin(inc)]
  return {
    x: (cw * cW - sw * sW * cI) * xp + (-sw * cW - cw * sW * cI) * yp,
    y: (cw * sW + sw * cW * cI) * xp + (-sw * sW + cw * cW * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  }
}

export interface PlanetView {
  name: Planet
  /** Angle from the Sun as seen from Earth, degrees. */
  elongation: number
  /** East of the Sun sets after it (evening sky); west rises before it (morning sky). */
  east: boolean
  when: 'evening' | 'night' | 'dawn' | 'hidden'
}

/**
 * Where each bright planet is relative to the Sun at 9 pm on `day`. That alone says when it can be
 * seen, anywhere at mid-northern latitudes: east of the Sun it's in the evening sky, far from it
 * it's up most of the night, west of it only before dawn, and too close it's lost in the glare.
 */
export function planets(day: string): PlanetView[] {
  const evening = fromKey(day).getTime() + 21 * 3_600_000
  const T = (evening / 86_400_000 + 2440587.5 - 2451545) / 36525
  const earth = position('Earth', T)
  const sun = { x: -earth.x, y: -earth.y, z: -earth.z }
  return PLANETS.map((name) => {
    const p = position(name, T)
    const g = { x: p.x - earth.x, y: p.y - earth.y, z: p.z - earth.z }
    const dot = g.x * sun.x + g.y * sun.y + g.z * sun.z
    const elongation = Math.acos(dot / (Math.hypot(g.x, g.y, g.z) * Math.hypot(sun.x, sun.y, sun.z))) / RAD
    // Ecliptic longitude ahead of the Sun's (counterclockwise from above) means east of it.
    const ahead = ((((Math.atan2(g.y, g.x) - Math.atan2(sun.y, sun.x)) / RAD) % 360) + 540) % 360 - 180
    const east = ahead > 0
    const when =
      elongation < MIN_ELONGATION[name] ? 'hidden' : elongation >= 120 ? 'night' : east ? 'evening' : 'dawn'
    return { name, elongation, east, when }
  })
}

/** "Jupiter, Saturn" for tonight (evening or most of the night), and the ones only up before dawn. */
export function planetsTonight(day: string) {
  const all = planets(day)
  return {
    tonight: all.filter((p) => p.when === 'evening' || p.when === 'night').map((p) => p.name),
    dawn: all.filter((p) => p.when === 'dawn').map((p) => p.name),
  }
}
