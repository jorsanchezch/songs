import { barStart, type AudioAnalysis } from '@/lib/audioAnalysis'

export type PartSuggestion = {
  /** Media time each part starts, in chart order. */
  startsMs: number[]
  /** Where the last part ends. */
  endMs: number
  /** Each part's length in whole bars. */
  bars: number[]
  /** 0..1: how many boundaries landed on a clear change in the sound. */
  quality: number
}

const LENGTH_WEIGHT = 1.2
const NOVELTY_WEIGHT = 3
const FIRST_START_REACH = 24

/**
 * Splits the song into the chart's parts on bar lines. The chart says how long each part
 * should be relative to the others (`weights`, in bars); the audio says where the sound
 * really changes (`barNovelty`). Dynamic programming picks the boundaries that best agree
 * with both, preferring parts of 2 and 4 bars multiples.
 */
export function suggestParts(analysis: AudioAnalysis, weights: number[]): PartSuggestion | null {
  const count = weights.length
  if (!count) return null
  const { grid, barNovelty } = analysis
  const barMs = (60_000 / grid.bpm) * grid.beatsPerBar
  const total = barNovelty.length
  const first = Math.max(0, Math.ceil((analysis.soundStartMs - 0.3 * barMs - grid.anchorMs) / barMs))
  const end = Math.min(total, Math.max(first + count, Math.round((analysis.soundEndMs - grid.anchorMs) / barMs)))
  if (end - first < count) return null

  const sum = weights.reduce((a, b) => a + Math.max(1, b), 0)
  const expected = weights.map((weight) => (Math.max(1, weight) * (end - first)) / sum)
  const novelty = (bar: number) => barNovelty[bar] ?? 0
  const evenness = (length: number) => (length % 4 === 0 ? 0.2 : length % 2 === 0 ? 0.1 : 0)
  const penalty = (length: number, part: number) =>
    LENGTH_WEIGHT * Math.log(length / expected[part]!) ** 2 - evenness(length)

  // best[p][b]: cost of starting part p at bar b with parts 0..p-1 placed before.
  const best: Float64Array[] = []
  const from: Int32Array[] = []
  for (let part = 0; part < count; part += 1) {
    best.push(new Float64Array(end + 1).fill(Infinity))
    from.push(new Int32Array(end + 1).fill(-1))
  }
  for (let bar = first; bar <= Math.min(end - count + 1, first + FIRST_START_REACH); bar += 1) {
    // Starting late costs a little: most songs open with the first part.
    best[0]![bar] = 0.04 * (bar - first) - NOVELTY_WEIGHT * 0.3 * novelty(bar)
  }
  for (let part = 1; part < count; part += 1) {
    for (let bar = first + part; bar <= end - (count - part) + 1; bar += 1) {
      for (let prev = first + part - 1; prev < bar; prev += 1) {
        const before = best[part - 1]![prev]!
        if (before === Infinity) continue
        const cost = before + penalty(bar - prev, part - 1) - NOVELTY_WEIGHT * novelty(bar)
        if (cost < best[part]![bar]!) {
          best[part]![bar] = cost
          from[part]![bar] = prev
        }
      }
    }
  }
  let bestCost = Infinity
  let last = -1
  for (let bar = first + count - 1; bar < end; bar += 1) {
    const before = best[count - 1]![bar]!
    if (before === Infinity) continue
    const cost = before + penalty(end - bar, count - 1)
    if (cost < bestCost) {
      bestCost = cost
      last = bar
    }
  }
  if (last < 0) return null
  const starts = new Array<number>(count)
  starts[count - 1] = last
  for (let part = count - 1; part > 0; part -= 1) starts[part - 1] = from[part]![starts[part]!]!
  const lengths = starts.map((bar, part) => (part + 1 < count ? starts[part + 1]! : end) - bar)
  const mean = barNovelty.reduce((a, b) => a + b, 0) / Math.max(1, barNovelty.length)
  const strong = starts.slice(1).filter((bar) => novelty(bar) > mean * 1.5).length
  return {
    startsMs: starts.map((bar) => Math.round(barStart(grid, bar))),
    endMs: Math.round(barStart(grid, end)),
    bars: lengths,
    quality: count > 1 ? Math.round((strong / (count - 1)) * 100) / 100 : 1,
  }
}
