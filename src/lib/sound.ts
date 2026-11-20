let ctx: AudioContext | null = null
let enabled = true

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
  env.connect(ctx.destination)
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

/** Petting the buddy: a low, soft rumble, pulsing about 24 times a second like a purr. */
export function playPurr() {
  if (!enabled) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const t = ctx.currentTime
  const dur = 0.9
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(0.14, t + 0.12)
  env.gain.linearRampToValueAtTime(0.1, t + dur - 0.3)
  env.gain.linearRampToValueAtTime(0, t + dur)
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 320
  const rumble = ctx.createOscillator()
  rumble.type = 'sawtooth'
  rumble.frequency.value = 52
  // The pulse: a gain that a slow oscillator swings between silent and full.
  const pulse = ctx.createGain()
  pulse.gain.value = 0.5
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 24
  const depth = ctx.createGain()
  depth.gain.value = 0.5
  lfo.connect(depth).connect(pulse.gain)
  rumble.connect(lowpass).connect(pulse).connect(env).connect(ctx.destination)
  for (const osc of [rumble, lfo]) {
    osc.start(t)
    osc.stop(t + dur)
  }
}
