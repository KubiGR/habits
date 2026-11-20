let ctx: AudioContext | null = null
let out: AudioNode | null = null
let enabled = true

/** How much louder than each sound's own level everything plays. */
const VOLUME = 2.2

/**
 * Every sound goes through one volume boost, then a limiter, so overlapping notes (the day's
 * finishing chord) get louder without distorting.
 */
function output(c: AudioContext) {
  if (!out) {
    const volume = c.createGain()
    volume.gain.value = VOLUME
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.002
    limiter.release.value = 0.2
    volume.connect(limiter).connect(c.destination)
    out = volume
  }
  return out
}

export const setSoundEnabled = (on: boolean) => {
  enabled = on
}

// C major pentatonic from C5: any run of checks sounds good together.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]

/** A soft bell-like pluck: sine plus a quiet octave, fast attack, exponential decay. */
function pluck(freq: number, { at = 0, gain = 0.16, dur = 0.5 } = {}) {
  if (!enabled) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const t = ctx.currentTime + at
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(gain, t + 0.006)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  env.connect(output(ctx))
  for (const { mult, type, level } of [
    { mult: 1, type: 'sine', level: 1 },
    { mult: 2, type: 'triangle', level: 0.12 },
  ] as const) {
    const osc = ctx.createOscillator()
    const mix = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq * mult
    mix.gain.value = level
    osc.connect(mix).connect(env)
    osc.start(t)
    osc.stop(t + dur)
  }
}

/** Each check today climbs one step up the scale. */
export const playCheck = (step: number) => pluck(SCALE[Math.min(step, SCALE.length - 1)])
/** Same step, an octave down and softer: progress, but not the full note. */
export const playHalf = (step: number) => pluck(SCALE[Math.min(step, SCALE.length - 1)] / 2, { gain: 0.12, dur: 0.4 })
export const playTick =() => pluck(1046.5, { gain: 0.07, dur: 0.22 })
export const playUncheck = () => pluck(392, { gain: 0.07, dur: 0.18 })
export const playComplete = () =>
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => pluck(f, { at: i * 0.08, gain: 0.13, dur: 1.1 }))
