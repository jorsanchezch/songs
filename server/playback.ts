/** Per-song playback calibration: measured on one recording, shared with everyone who plays it. */

export type PlaybackTrack = {
  src: string
  introMs: number
  parts: Record<string, number>
  grid?: { bpm: number; anchorMs: number; beatsPerBar: number }
}

export type SongPlayback = { youtube?: PlaybackTrack; mp3?: PlaybackTrack; speed?: number }

const PART_KEY = /^[\w-]+(~\d+)?$/

function wholeIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

function track(value: unknown): PlaybackTrack | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const src = typeof raw.src === 'string' ? raw.src.trim() : ''
  if (!src || src.length > 500) return undefined
  const parts: Record<string, number> = {}
  if (raw.parts && typeof raw.parts === 'object' && !Array.isArray(raw.parts)) {
    for (const [key, ms] of Object.entries(raw.parts).slice(0, 200)) {
      const length = wholeIn(ms, 1, 1_800_000)
      if (length != null && key.length <= 120 && PART_KEY.test(key)) parts[key] = length
    }
  }
  const out: PlaybackTrack = {
    src,
    // Negative: the recording runs ahead of the chart (no intro, or parts longer than estimated).
    introMs: wholeIn(raw.introMs, -600_000, 600_000) ?? 0,
    parts,
  }
  const grid = raw.grid
  if (grid && typeof grid === 'object' && !Array.isArray(grid)) {
    const { bpm, anchorMs, beatsPerBar } = grid as Record<string, unknown>
    if (typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 && (beatsPerBar === 3 || beatsPerBar === 4)) {
      out.grid = { bpm: Math.round(bpm * 100) / 100, anchorMs: wholeIn(anchorMs, -600_000, 1_800_000) ?? 0, beatsPerBar }
    }
  }
  return out
}

export function songPlayback(value: unknown): SongPlayback {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const out: SongPlayback = {}
  const youtube = track(raw.youtube)
  const mp3 = track(raw.mp3)
  if (youtube) out.youtube = youtube
  if (mp3) out.mp3 = mp3
  if (typeof raw.speed === 'number' && Number.isFinite(raw.speed)) {
    const speed = Math.round(Math.min(2, Math.max(0.5, raw.speed)) * 100) / 100
    if (speed !== 1) out.speed = speed
  }
  return out
}
