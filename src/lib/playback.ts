import type { DisplayBlock } from '@/lib/display'
import { findYoutubeSource } from '@/lib/songMedia'
import type { ChartLine, Song } from '@/lib/types'

export type PlaybackPace = 'duration' | 'parts'
export type PlaybackAudio = 'off' | 'youtube' | 'mp3'

export type PlaybackSettings = {
  /** `duration` spreads the song length over the parts; `parts` gives every line a fixed time. */
  pace: PlaybackPace
  /** With a BPM, lines weigh their bars and `parts` runs at that tempo. */
  useBpm: boolean
  audio: PlaybackAudio
  highlights: boolean
}

const STORAGE = 'songbook-playback-v1'

const DEFAULTS: PlaybackSettings = { pace: 'duration', useBpm: true, audio: 'off', highlights: true }

export function loadPlaybackSettings(): PlaybackSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<PlaybackSettings>
    return {
      pace: parsed.pace === 'parts' ? 'parts' : 'duration',
      useBpm: parsed.useBpm !== false,
      audio: parsed.audio === 'youtube' || parsed.audio === 'mp3' ? parsed.audio : 'off',
      highlights: parsed.highlights !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePlaybackSettings(settings: PlaybackSettings) {
  localStorage.setItem(STORAGE, JSON.stringify(settings))
}

/** Tempo assumed when a song has no BPM: two bars of 4/4 per line at 72. */
export const FALLBACK_BPM = 72
const BEATS_PER_BAR = 4
const FALLBACK_BARS_PER_LINE = 2

export type TimedLine = {
  lineIndex: number
  /** Offsets inside one pass of the part. */
  start: number
  end: number
  chords: number
}

export type TimedBlock = {
  id: string
  start: number
  end: number
  repeat: number
  passMs: number
  lines: TimedLine[]
}

export type TimelineBasis = 'media' | 'duration' | 'bpm' | 'estimate'

export type Timeline = {
  blocks: TimedBlock[]
  totalMs: number
  basis: TimelineBasis
  /** Tempo used for the beat pulse; null when the song has no BPM or it is off. */
  bpm: number | null
}

export type PlaybackCursor = {
  blockId: string
  blockIndex: number
  /** 1-based pass through a repeated part. */
  pass: number
  repeat: number
  lineIndex: number | null
  /** Index into the line's chords, in written order. */
  chordIndex: number | null
}

/**
 * Bars a line likely takes. A lyric line holds at least two bars; a chords-only
 * line gives each chord a bar.
 */
export function lineBars(line: ChartLine): number {
  const chords = line.chords.length
  if (line.lyric == null || !line.lyric.trim()) return Math.max(1, chords)
  return Math.min(4, Math.max(2, chords))
}

/** Lines a block plays, borrowing an earlier identical part's lines in folded views. */
export function blockLines(block: DisplayBlock, blocks: DisplayBlock[]): ChartLine[] {
  const earlier = block.duplicateOfId ? blocks.find((item) => item.id === block.duplicateOfId)?.section : undefined
  return (earlier ?? block.section).lines
}

export type TimelineInput = {
  blocks: DisplayBlock[]
  settings: Pick<PlaybackSettings, 'pace' | 'useBpm'>
  bpm?: number | null
  durationMs?: number | null
  /** Length of the audio that is playing, when known. It wins over the stored duration. */
  mediaMs?: number | null
}

export function buildTimeline({ blocks, settings, bpm, durationMs, mediaMs }: TimelineInput): Timeline {
  const tempo = settings.useBpm && bpm && bpm > 0 ? bpm : null
  // Without a tempo every line weighs the same, as the plan's lines × repeats.
  const weigh = (line: ChartLine) => (tempo ? lineBars(line) : 1)
  const shaped = blocks.map((block) => {
    const lines = blockLines(block, blocks)
    const weights = lines.length ? lines.map(weigh) : [tempo ? 2 : 1]
    const pass = weights.reduce((sum, value) => sum + value, 0)
    return { block, lines, weights, pass, repeat: Math.max(1, block.repeat) }
  })
  const units = shaped.reduce((sum, item) => sum + item.pass * item.repeat, 0)

  const length = mediaMs && mediaMs > 0 ? mediaMs : durationMs && durationMs > 0 ? durationMs : null
  let basis: TimelineBasis
  let unitMs: number
  if (settings.pace === 'duration' && length && units > 0) {
    basis = mediaMs && mediaMs > 0 ? 'media' : 'duration'
    unitMs = length / units
  } else if (tempo) {
    basis = 'bpm'
    unitMs = (BEATS_PER_BAR * 60_000) / tempo
  } else {
    basis = 'estimate'
    unitMs = (FALLBACK_BARS_PER_LINE * BEATS_PER_BAR * 60_000) / FALLBACK_BPM
  }

  let cursor = 0
  const timed = shaped.map(({ block, lines, weights, pass, repeat }) => {
    const passMs = pass * unitMs
    let offset = 0
    const timedLines: TimedLine[] = lines.map((line, lineIndex) => {
      const span = (weights[lineIndex] ?? 1) * unitMs
      const entry = { lineIndex, start: offset, end: offset + span, chords: line.chords.length }
      offset += span
      return entry
    })
    const start = cursor
    cursor += passMs * repeat
    return { id: block.id, start, end: cursor, repeat, passMs, lines: timedLines }
  })

  return { blocks: timed, totalMs: cursor, basis, bpm: tempo }
}

export function locate(timeline: Timeline, ms: number): PlaybackCursor | null {
  const { blocks } = timeline
  if (!blocks.length || ms < 0 || ms >= timeline.totalMs) return null
  let blockIndex = blocks.findIndex((block) => ms < block.end)
  if (blockIndex < 0) blockIndex = blocks.length - 1
  const block = blocks[blockIndex]!
  const into = ms - block.start
  const pass = block.passMs > 0 ? Math.min(block.repeat, Math.floor(into / block.passMs) + 1) : 1
  const local = block.passMs > 0 ? into - (pass - 1) * block.passMs : 0
  const line = block.lines.find((item) => local < item.end) ?? block.lines[block.lines.length - 1]
  let chordIndex: number | null = null
  if (line && line.chords > 0) {
    // Chords share the line evenly: one change per bar is the common case.
    const fraction = (local - line.start) / Math.max(1, line.end - line.start)
    chordIndex = Math.min(line.chords - 1, Math.max(0, Math.floor(fraction * line.chords)))
  }
  return {
    blockId: block.id,
    blockIndex,
    pass,
    repeat: block.repeat,
    lineIndex: line?.lineIndex ?? null,
    chordIndex,
  }
}

/** Where play begins for a part, or for a line inside it on its first pass. */
export function startOffset(timeline: Timeline, id: string | null, lineIndex: number | null = null): number {
  const block = id ? timeline.blocks.find((item) => item.id === id) : undefined
  if (!block) return 0
  const line = lineIndex == null ? undefined : block.lines.find((item) => item.lineIndex === lineIndex)
  return block.start + (line?.start ?? 0)
}

export function sameCursor(a: PlaybackCursor | null, b: PlaybackCursor | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.blockId === b.blockId &&
    a.pass === b.pass &&
    a.lineIndex === b.lineIndex &&
    a.chordIndex === b.chordIndex
  )
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Video id from youtu.be, watch, embed, shorts, live, or music links. */
export function youtubeVideoId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.replace(/^(www|m|music)\./, '').toLowerCase()
    const valid = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null)
    if (host === 'youtu.be') return valid(parsed.pathname.split('/')[1])
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
    const fromQuery = valid(parsed.searchParams.get('v'))
    if (fromQuery) return fromQuery
    const [, kind, id] = parsed.pathname.split('/')
    return kind && ['embed', 'shorts', 'live', 'v'].includes(kind) ? valid(id) : null
  } catch {
    return null
  }
}

export type SongMediaSources = {
  youtubeId: string | null
  audioUrl: string | null
  bpm: number | null
  durationMs: number | null
}

export function songMediaSources(song: Pick<Song, 'sources' | 'audioUrl' | 'bpm' | 'durationMs'>): SongMediaSources {
  const youtube = findYoutubeSource(song.sources ?? [])
  const audioUrl = song.audioUrl?.trim() || null
  return {
    youtubeId: youtube ? youtubeVideoId(youtube.url) : null,
    audioUrl,
    bpm: song.bpm && song.bpm > 0 ? song.bpm : null,
    durationMs: song.durationMs && song.durationMs > 0 ? song.durationMs : null,
  }
}

/** The audio that will actually play: falls back to silence when the song lacks the chosen source. */
export function effectiveAudio(choice: PlaybackAudio, media: SongMediaSources): PlaybackAudio {
  if (choice === 'youtube' && media.youtubeId) return 'youtube'
  if (choice === 'mp3' && media.audioUrl) return 'mp3'
  return 'off'
}
