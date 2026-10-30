/**
 * Tempo, beat grid, bar lines and section changes from decoded audio. Plain signal
 * processing (spectral flux, autocorrelation, dynamic-programming beat tracking), no AI:
 * it runs in the browser on the MP3 the song already has, and in Node for tests.
 */

export const ANALYSIS_RATE = 22_050
const FRAME = 1024
const HOP = 256
const BANDS = 24
const TEMPO_MIN = 50
const TEMPO_MAX = 210
/** A frame is stamped with its window start, but an onset is seen when it is ~70 % into the window. Measured on a click track. */
const ONSET_DELAY_MS = ((0.71 * FRAME) / ANALYSIS_RATE) * 1000

export type BeatGrid = {
  bpm: number
  /** Media time of some bar line (the first one at or after 0). Bar k starts at anchorMs + k × barMs. */
  anchorMs: number
  beatsPerBar: number
}

export type AudioAnalysis = {
  durationMs: number
  /** First and last audible moments; the silence around them is not part of the song. */
  soundStartMs: number
  soundEndMs: number
  grid: BeatGrid
  /** 0..1: how well the beats sit on a steady grid and how clear the pulse is. */
  confidence: number
  /** Beats farther than this from the grid on average mean the tempo drifts (live recording). */
  driftMs: number
  /** Half and double tempo, for when the pulse was counted at the wrong level. */
  alternatives: { bpm: number; label: string }[]
  /** How much the sound changes at each bar line, from the grid's bar 0 on (higher = new section). */
  barNovelty: number[]
  /** Loudness per bar, 0..1. */
  barEnergy: number[]
  /** Waveform for drawing: the loudest sample in each of `peaks.length` equal slices, 0..1. */
  peaks: number[]
}

export type AnalyzeOptions = {
  /** Called with 0..1 while working. */
  onProgress?: (fraction: number) => void
  /** Bins in `peaks`. */
  peakCount?: number
  /** Pin the beats per bar instead of guessing it. */
  beatsPerBar?: 3 | 4
  /** Count the pulse at this tempo instead of the detected one (the ½×, 2× or ⅔× of it). */
  bpm?: number
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** In-place radix-2 FFT over separate real and imaginary arrays. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = re[i]!
      re[i] = re[j]!
      re[j] = r
      const m = im[i]!
      im[i] = im[j]!
      im[j] = m
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < size / 2; k += 1) {
        const a = start + k
        const b = a + size / 2
        const tr = re[b]! * cr - im[b]! * ci
        const ti = re[b]! * ci + im[b]! * cr
        re[b] = re[a]! - tr
        im[b] = im[a]! - ti
        re[a] = re[a]! + tr
        im[a] = im[a]! + ti
        const next = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = next
      }
    }
  }
}

/** FFT bin ranges of BANDS log-spaced bands from 40 Hz to 8 kHz. */
function bandEdges(): number[] {
  const low = 40
  const high = 8000
  const edges: number[] = []
  for (let i = 0; i <= BANDS; i += 1) {
    const hz = low * (high / low) ** (i / BANDS)
    edges.push(Math.min(FRAME / 2, Math.max(1, Math.round((hz * FRAME) / ANALYSIS_RATE))))
  }
  for (let i = 1; i < edges.length; i += 1) if (edges[i]! <= edges[i - 1]!) edges[i] = edges[i - 1]! + 1
  return edges
}

type Spectrum = {
  frames: number
  /** log-compressed band magnitudes, frames × BANDS */
  bands: Float32Array
  rms: Float32Array
}

async function spectrogram(samples: Float32Array, report: (fraction: number) => void): Promise<Spectrum> {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1)
  const bands = new Float32Array(frames * BANDS)
  const rms = new Float32Array(frames)
  const window = new Float64Array(FRAME)
  for (let i = 0; i < FRAME; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
  const edges = bandEdges()
  const re = new Float64Array(FRAME)
  const im = new Float64Array(FRAME)
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * HOP
    let energy = 0
    for (let i = 0; i < FRAME; i += 1) {
      const value = samples[offset + i]!
      re[i] = value * window[i]!
      im[i] = 0
      energy += value * value
    }
    rms[frame] = Math.sqrt(energy / FRAME)
    fft(re, im)
    for (let band = 0; band < BANDS; band += 1) {
      let sum = 0
      for (let bin = edges[band]!; bin < edges[band + 1]!; bin += 1) sum += Math.hypot(re[bin]!, im[bin]!)
      bands[frame * BANDS + band] = Math.log1p(100 * sum)
    }
    if (frame % 800 === 0) {
      report(frame / frames)
      await tick()
    }
  }
  return { frames, bands, rms }
}

/** Positive change of each band from one frame to the next, summed: how much new sound starts. */
function onsetEnvelope(spec: Spectrum, from = 0, to = BANDS): Float32Array {
  const out = new Float32Array(spec.frames)
  for (let frame = 1; frame < spec.frames; frame += 1) {
    let flux = 0
    for (let band = from; band < to; band += 1) {
      const change = spec.bands[frame * BANDS + band]! - spec.bands[(frame - 1) * BANDS + band]!
      if (change > 0) flux += change
    }
    out[frame] = flux
  }
  return out
}

/** Removes the slow level so only the peaks of new sound stay, then scales to unit spread. */
function emphasize(env: Float32Array, rate: number): Float32Array {
  const radius = Math.max(2, Math.round(rate * 0.4))
  const out = new Float32Array(env.length)
  let sum = 0
  let count = 0
  for (let i = 0; i < Math.min(env.length, radius); i += 1) {
    sum += env[i]!
    count += 1
  }
  for (let i = 0; i < env.length; i += 1) {
    const add = i + radius
    const drop = i - radius - 1
    if (add < env.length) {
      sum += env[add]!
      count += 1
    }
    if (drop >= 0) {
      sum -= env[drop]!
      count -= 1
    }
    out[i] = Math.max(0, env[i]! - sum / Math.max(1, count))
  }
  let power = 0
  for (const value of out) power += value * value
  const spread = Math.sqrt(power / Math.max(1, out.length)) || 1
  for (let i = 0; i < out.length; i += 1) out[i] = out[i]! / spread
  return out
}

/** Strength of a pulse at each lag in frames, from the autocorrelation of the onset envelope. */
function autocorrelation(env: Float32Array, maxLag: number): Float64Array {
  const out = new Float64Array(maxLag + 1)
  const n = env.length
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let sum = 0
    for (let i = lag; i < n; i += 1) sum += env[i]! * env[i - lag]!
    out[lag] = sum / Math.max(1, n - lag)
  }
  return out
}

type TempoCandidate = { bpm: number; score: number }

/** Prefers tempos people play at; worship songs sit mostly between 60 and 140. */
function tempoPrior(bpm: number): number {
  const octaves = Math.log2(bpm / 100)
  return Math.exp(-0.5 * (octaves / 0.8) ** 2)
}

function tempoCandidates(env: Float32Array, rate: number): TempoCandidate[] {
  const minLag = Math.floor((60 * rate) / TEMPO_MAX)
  const maxLag = Math.ceil((60 * rate) / TEMPO_MIN)
  const acf = autocorrelation(env, maxLag * 2)
  const at = (lag: number) => {
    const low = Math.floor(lag)
    const high = Math.min(acf.length - 1, low + 1)
    const mix = lag - low
    return (acf[low] ?? 0) * (1 - mix) + (acf[high] ?? 0) * mix
  }
  const scored: TempoCandidate[] = []
  for (let lag = minLag; lag <= maxLag; lag += 0.25) {
    // A real pulse also repeats at twice the lag, and its half-beat sits between.
    const strength = at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag * 4)
    const bpm = (60 * rate) / lag
    scored.push({ bpm, score: strength * tempoPrior(bpm) })
  }
  // Local peaks only.
  const peaks = scored.filter((item, i) => item.score > 0 && item.score >= (scored[i - 1]?.score ?? 0) && item.score >= (scored[i + 1]?.score ?? 0))
  return peaks.sort((a, b) => b.score - a.score).slice(0, 6)
}

/**
 * The steady beat grid that best matches the onsets: tries periods near the autocorrelation
 * estimate and every phase, scores how much new sound lands on each grid, then snaps the
 * grid's beats to the nearby peaks and refits a line through them.
 */
function combGrid(env: Float32Array, rate: number, bpm: number): { startMs: number; periodMs: number; hit: number; driftMs: number } {
  const frameMs = 1000 / rate
  const smooth = new Float32Array(env.length)
  for (let i = 0; i < env.length; i += 1) smooth[i] = (env[i - 1] ?? 0) * 0.5 + env[i]! + (env[i + 1] ?? 0) * 0.5
  const guess = (60 * rate) / bpm
  let bestScore = -Infinity
  let bestPeriod = guess
  let bestPhase = 0
  for (let step = -60; step <= 60; step += 1) {
    const period = guess * (1 + step * 0.0005)
    for (let phase = 0; phase < period; phase += 1) {
      let score = 0
      for (let at = phase; at < smooth.length; at += period) score += smooth[Math.round(at)] ?? 0
      score /= Math.max(1, (smooth.length - phase) / period)
      if (score > bestScore) {
        bestScore = score
        bestPeriod = period
        bestPhase = phase
      }
    }
  }
  let start = bestPhase
  let period = bestPeriod
  const reach = Math.max(1, Math.round(rate * 0.03))
  let hit = 0
  let drift = 0
  for (let pass = 0; pass < 3; pass += 1) {
    const xs: number[] = []
    const ys: number[] = []
    let hits = 0
    const errors: number[] = []
    for (let k = 0; start + k * period < env.length - 1; k += 1) {
      const at = Math.round(start + k * period)
      let top = -1
      let topAt = at
      for (let i = at - reach; i <= at + reach; i += 1) {
        if ((env[i] ?? 0) > top) {
          top = env[i]!
          topAt = i
        }
      }
      errors.push(Math.abs(topAt - (start + k * period)))
      if (top >= 0.6) {
        hits += 1
        xs.push(k)
        ys.push(topAt)
      }
    }
    hit = hits / Math.max(1, errors.length)
    drift = ([...errors].sort((x, y) => x - y)[Math.floor(errors.length / 2)] ?? 0) * frameMs
    const n = xs.length
    if (n < 4) break
    const sx = xs.reduce((a, b) => a + b, 0)
    const sy = ys.reduce((a, b) => a + b, 0)
    const sxx = xs.reduce((a, b) => a + b * b, 0)
    const sxy = xs.reduce((a, b, i) => a + b * ys[i]!, 0)
    const denominator = n * sxx - sx * sx
    if (denominator === 0) break
    period = (n * sxy - sx * sy) / denominator
    start = (sy - period * sx) / n
  }
  return { startMs: start * frameMs, periodMs: period * frameMs, hit, driftMs: drift }
}

function mean(values: ArrayLike<number>, from: number, to: number): number {
  let sum = 0
  let count = 0
  for (let i = Math.max(0, from); i < Math.min(values.length, to); i += 1) {
    sum += values[i]!
    count += 1
  }
  return count ? sum / count : 0
}

export async function analyzeAudio(
  samples: Float32Array,
  sampleRate: number = ANALYSIS_RATE,
  options: AnalyzeOptions = {},
): Promise<AudioAnalysis> {
  if (sampleRate !== ANALYSIS_RATE) throw new Error(`Se espera audio a ${ANALYSIS_RATE} Hz.`)
  const report = (fraction: number) => options.onProgress?.(fraction)
  const durationMs = Math.round((samples.length / sampleRate) * 1000)
  const frameMs = (HOP / sampleRate) * 1000
  const rate = sampleRate / HOP

  // Waveform.
  const peakCount = options.peakCount ?? 600
  const peaks: number[] = new Array(peakCount).fill(0)
  const slice = samples.length / peakCount
  let loudest = 1e-9
  for (let bin = 0; bin < peakCount; bin += 1) {
    let top = 0
    const end = Math.min(samples.length, Math.floor((bin + 1) * slice))
    for (let i = Math.floor(bin * slice); i < end; i += 1) {
      const value = Math.abs(samples[i]!)
      if (value > top) top = value
    }
    peaks[bin] = top
    if (top > loudest) loudest = top
  }
  for (let bin = 0; bin < peakCount; bin += 1) peaks[bin] = peaks[bin]! / loudest

  const spec = await spectrogram(samples, (fraction) => report(fraction * 0.7))
  if (spec.frames < rate * 8) throw new Error('El audio es demasiado corto para analizarlo.')

  // Audible range: above −45 dB of the loud passages.
  const sorted = Float32Array.from(spec.rms).sort()
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 1e-6
  const floor = loud * 10 ** (-45 / 20)
  const smoothed = (frame: number) => mean(spec.rms, frame - 2, frame + 3)
  let first = 0
  while (first < spec.frames && smoothed(first) < floor) first += 1
  let last = spec.frames - 1
  while (last > first && smoothed(last) < floor) last -= 1
  const soundStartMs = Math.round(first * frameMs)
  const soundEndMs = Math.round(Math.min(durationMs, (last + FRAME / HOP) * frameMs))

  const all = emphasize(onsetEnvelope(spec), rate)
  const low = emphasize(onsetEnvelope(spec, 0, 6), rate)
  // Analyze the audible part only.
  const audible = all.slice(first, last + 1)
  const candidates = tempoCandidates(audible, rate)
  if (!candidates.length) throw new Error('No encontré un pulso claro en el audio.')

  report(0.75)
  await tick()
  const best = options.bpm && options.bpm >= TEMPO_MIN / 2 && options.bpm <= TEMPO_MAX * 2 ? { bpm: options.bpm, score: candidates[0]!.score } : candidates[0]!
  const fitted = combGrid(audible, rate, best.bpm)
  const grid = { start: fitted.startMs + first * frameMs + ONSET_DELAY_MS, period: fitted.periodMs, drift: fitted.driftMs, fit: fitted.hit }
  const beatMs = grid.period
  const bpm = Math.round((60_000 / beatMs) * 100) / 100

  // Where bar lines fall: the beat phase with the most low-end and new-sound strength, per meter.
  const strengthAt = (ms: number) => {
    const frame = Math.round((ms - ONSET_DELAY_MS) / frameMs)
    let top = 0
    for (let i = frame - 2; i <= frame + 2; i += 1) top = Math.max(top, (all[i] ?? 0) + 1.5 * (low[i] ?? 0))
    return top
  }
  const firstIndex = Math.ceil((soundStartMs - 80 - grid.start) / beatMs)
  const lastIndex = Math.floor((soundEndMs - grid.start) / beatMs)
  const phases = (meter: number) => {
    const sums = new Array<number>(meter).fill(0)
    const counts = new Array<number>(meter).fill(0)
    for (let k = firstIndex; k <= lastIndex; k += 1) {
      const slot = ((k % meter) + meter) % meter
      sums[slot]! += strengthAt(grid.start + k * beatMs)
      counts[slot]! += 1
    }
    return sums.map((sum, slot) => sum / Math.max(1, counts[slot]!))
  }
  const contrast = (values: number[]) => {
    const top = Math.max(...values)
    const rest = (values.reduce((a, b) => a + b, 0) - top) / Math.max(1, values.length - 1)
    return (top - rest) / (top + rest + 1e-9)
  }
  const four = phases(4)
  const three = phases(3)
  const beatsPerBar = options.beatsPerBar ?? (contrast(three) > contrast(four) * 1.35 ? 3 : 4)
  const chosen = beatsPerBar === 3 ? three : four
  const downSlot = chosen.indexOf(Math.max(...chosen))
  const barMs = beatMs * beatsPerBar
  // First bar line at or after 0 whose slot is the downbeat.
  let anchorIndex = Math.ceil(-grid.start / beatMs)
  while ((((anchorIndex % beatsPerBar) + beatsPerBar) % beatsPerBar) !== downSlot) anchorIndex += 1
  const anchorMs = Math.round(grid.start + anchorIndex * beatMs)

  // Per-bar timbre and loudness, then how much the sound changes at each bar line.
  const bars = Math.max(1, Math.floor((durationMs - anchorMs) / barMs))
  const features: Float64Array[] = []
  const barEnergy: number[] = []
  for (let bar = 0; bar < bars; bar += 1) {
    const a = Math.floor((anchorMs + bar * barMs) / frameMs)
    const b = Math.max(a + 1, Math.floor((anchorMs + (bar + 1) * barMs) / frameMs))
    const vector = new Float64Array(BANDS)
    for (let band = 0; band < BANDS; band += 1) {
      let sum = 0
      let count = 0
      for (let frame = a; frame < Math.min(b, spec.frames); frame += 1) {
        sum += spec.bands[frame * BANDS + band]!
        count += 1
      }
      vector[band] = count ? sum / count : 0
    }
    features.push(vector)
    barEnergy.push(mean(spec.rms, a, b))
  }
  const topEnergy = Math.max(...barEnergy, 1e-9)
  const normalizedEnergy = barEnergy.map((value) => value / topEnergy)
  const window = 4
  const barNovelty = features.map((_, bar) => {
    if (bar < 1 || bar > features.length - 1) return 0
    const before = new Float64Array(BANDS)
    const after = new Float64Array(BANDS)
    let nb = 0
    let na = 0
    for (let i = Math.max(0, bar - window); i < bar; i += 1, nb += 1) for (let k = 0; k < BANDS; k += 1) before[k]! += features[i]![k]!
    for (let i = bar; i < Math.min(features.length, bar + window); i += 1, na += 1) for (let k = 0; k < BANDS; k += 1) after[k]! += features[i]![k]!
    let distance = 0
    for (let k = 0; k < BANDS; k += 1) distance += (before[k]! / Math.max(1, nb) - after[k]! / Math.max(1, na)) ** 2
    const level = Math.abs((normalizedEnergy[bar]! - mean(normalizedEnergy, bar - window, bar)) * 2)
    return Math.sqrt(distance) + level
  })
  const peakNovelty = Math.max(...barNovelty, 1e-9)
  for (let i = 0; i < barNovelty.length; i += 1) barNovelty[i] = barNovelty[i]! / peakNovelty

  const confidence = Math.max(
    0,
    Math.min(1, grid.fit * 0.7 + Math.min(1, best.score / (candidates[1] ? candidates[1].score * 1.6 : best.score)) * 0.3),
  )
  report(1)
  return {
    durationMs,
    soundStartMs,
    soundEndMs,
    grid: { bpm, anchorMs, beatsPerBar },
    confidence: Math.round(confidence * 100) / 100,
    driftMs: Math.round(grid.drift),
    alternatives: tempoAlternatives(bpm),
    barNovelty,
    barEnergy: normalizedEnergy,
    peaks,
  }
}

/**
 * The same pulse counted at another level. Songs are written at a half, double, or a
 * three-against-two feel of what the drums play, so any of these may be the "real" BPM.
 */
export function tempoAlternatives(bpm: number): { bpm: number; label: string }[] {
  const ratios: [number, number, string][] = [
    [1, 2, '½'],
    [2, 1, '2×'],
    [2, 3, '⅔'],
    [3, 2, '3⁄2'],
    [3, 4, '¾'],
    [4, 3, '4⁄3'],
  ]
  return ratios
    .map(([up, down, label]) => ({ bpm: Math.round(((bpm * up) / down) * 10) / 10, label }))
    .filter((item) => item.bpm >= 55 && item.bpm <= 200)
}

/** Media time of bar line k. */
export const barStart = (grid: BeatGrid, bar: number) => grid.anchorMs + bar * ((60_000 / grid.bpm) * grid.beatsPerBar)

/** The bar line nearest to a media time (may be negative before the anchor). */
export function nearestBar(grid: BeatGrid, ms: number): number {
  return Math.round((ms - grid.anchorMs) / ((60_000 / grid.bpm) * grid.beatsPerBar))
}

/** Beat number (0 = a downbeat) and its time at or before `ms`, for pulsing on the beat. */
export function beatAt(grid: BeatGrid, ms: number): { index: number; beatMs: number; downbeat: boolean; since: number } {
  const beat = 60_000 / grid.bpm
  const index = Math.floor((ms - grid.anchorMs) / beat)
  const at = grid.anchorMs + index * beat
  return { index, beatMs: at, downbeat: ((index % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar === 0, since: ms - at }
}
