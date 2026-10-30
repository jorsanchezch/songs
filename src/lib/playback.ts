import type { DisplayBlock } from '@/lib/display'
import { isYoutubeEntry, selectedYoutubeIndex } from '@/lib/sourceEntry'
import { findYoutubeSource, resolveAudioUrl } from '@/lib/songMedia'
import type { SongSource } from '@/lib/types'
import type { ChartLine, PlaybackTrack, Song, SongPlayback } from '@/lib/types'

function apiRoot(): string {
  const value = import.meta.env?.VITE_SONGBOOK_API
  return typeof value === 'string' ? value.replace(/\/$/, '') : ''
}

export type PlaybackPace = 'duration' | 'tempo'
export type PlaybackAudio = 'off' | 'youtube' | 'mp3'

export type PlaybackSettings = {
  /** `duration` spreads the song length (or the measured parts) over the parts; `tempo` gives every line its bars at the BPM. */
  pace: PlaybackPace
  /** With a BPM, lines weigh their bars and `tempo` runs at that BPM. */
  useBpm: boolean
  audio: PlaybackAudio
  highlights: boolean
}

const STORAGE = 'songbook-playback-v1'

export function parsePlaybackSettings(raw: string | null): PlaybackSettings {
  let parsed: Partial<Record<keyof PlaybackSettings, unknown>> = {}
  try {
    const value = JSON.parse(raw ?? '{}') as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value
  } catch {
    parsed = {}
  }
  return {
    // `parts` was the first name of the fixed-tempo pace.
    pace: parsed.pace === 'tempo' || parsed.pace === 'parts' ? 'tempo' : 'duration',
    useBpm: parsed.useBpm !== false,
    audio: parsed.audio === 'youtube' || parsed.audio === 'mp3' ? parsed.audio : 'off',
    highlights: parsed.highlights !== false,
  }
}

export function loadPlaybackSettings(): PlaybackSettings {
  try {
    return parsePlaybackSettings(localStorage.getItem(STORAGE))
  } catch {
    return parsePlaybackSettings(null)
  }
}

export function savePlaybackSettings(settings: PlaybackSettings) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(settings))
  } catch {
    // Private windows may refuse storage; the settings still apply for this visit.
  }
}

/** Tempo assumed when a song has no BPM: two bars of 4/4 per line at 72. */
export const FALLBACK_BPM = 72
const BEATS_PER_BAR = 4
const FALLBACK_BARS_PER_LINE = 2

export const NUDGE_MS = 250
export const SPEED_MIN = 0.75
export const SPEED_MAX = 1.25
export const SPEED_STEP = 0.05
/** The footer cue lights up this close to the next part. */
export const NEAR_CUE_MS = 8000
export const LEAD_MAX_MS = 600_000

export type TimedLine = {
  lineIndex: number
  /** Offsets inside one pass of the part. */
  start: number
  end: number
  chords: number
}

export type TimedBlock = {
  id: string
  label: string
  start: number
  end: number
  repeat: number
  passMs: number
  /** The length came from a calibration mark rather than an estimate. */
  measured: boolean
  lines: TimedLine[]
}

export type TimelineBasis = 'marks' | 'media' | 'duration' | 'bpm' | 'estimate'

export type Timeline = {
  blocks: TimedBlock[]
  totalMs: number
  basis: TimelineBasis
  /** Tempo used for the beat pulse; null when the song has no BPM or it is off. */
  bpm: number | null
  /** Average length of one weight unit: a bar with a BPM, a line without. */
  unitMs: number
  weighs: 'bars' | 'lines'
  /** Blocks whose length was measured. */
  measured: number
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

/** What each part should weigh against the others, in bars across all its passes. */
export function partBars(blocks: DisplayBlock[]): number[] {
  return blocks.map((block) => {
    const lines = blockLines(block, blocks)
    const pass = lines.length ? lines.reduce((sum, line) => sum + lineBars(line), 0) : 2
    return pass * Math.max(1, block.repeat)
  })
}

/** Stable key per block for stored lengths: `verso`, then `verso~2` when the flow plays it again. */
export function partKeys(blocks: Pick<DisplayBlock, 'id'>[]): string[] {
  const seen = new Map<string, number>()
  return blocks.map((block) => {
    const count = (seen.get(block.id) ?? 0) + 1
    seen.set(block.id, count)
    return count === 1 ? block.id : `${block.id}~${count}`
  })
}

export type TimelineInput = {
  blocks: DisplayBlock[]
  settings: Pick<PlaybackSettings, 'pace' | 'useBpm'>
  bpm?: number | null
  durationMs?: number | null
  /** Length of the audio that is playing, when known. It wins over the stored duration. */
  mediaMs?: number | null
  /** Media time before the first part. */
  introMs?: number
  /** Measured part lengths by part key. Used only by the duration pace. */
  parts?: Record<string, number> | null
  /** Length of one bar in the audio. With it, lines start and end on bar lines. */
  barMs?: number | null
}

export function buildTimeline({ blocks, settings, bpm, durationMs, mediaMs, introMs = 0, parts, barMs }: TimelineInput): Timeline {
  const tempo = settings.useBpm && bpm && bpm > 0 ? bpm : null
  // Without a tempo every line weighs the same, as lines × repeats.
  const weigh = (line: ChartLine) => (tempo ? lineBars(line) : 1)
  const keys = partKeys(blocks)
  const shaped = blocks.map((block, index) => {
    const lines = blockLines(block, blocks)
    const weights = lines.length ? lines.map(weigh) : [tempo ? 2 : 1]
    const pass = weights.reduce((sum, value) => sum + value, 0)
    const repeat = Math.max(1, block.repeat)
    const mark = settings.pace === 'duration' ? parts?.[keys[index]!] : undefined
    return { block, lines, weights, pass, repeat, units: pass * repeat, mark: mark && mark > 0 ? mark : null }
  })
  const units = shaped.reduce((sum, item) => sum + item.units, 0)
  const measuredMs = shaped.reduce((sum, item) => sum + (item.mark ?? 0), 0)
  const measuredUnits = shaped.reduce((sum, item) => sum + (item.mark ? item.units : 0), 0)
  const restUnits = units - measuredUnits

  const raw = mediaMs && mediaMs > 0 ? mediaMs : durationMs && durationMs > 0 ? durationMs : null
  const length = raw != null && raw - introMs > 1000 ? raw - introMs : null
  let basis: TimelineBasis | null = null
  let unitMs = 0
  if (settings.pace === 'duration') {
    if (measuredUnits > 0 && restUnits === 0) {
      basis = 'marks'
      unitMs = measuredMs / measuredUnits
    } else if (length && length - measuredMs > restUnits * 500) {
      basis = measuredUnits > 0 ? 'marks' : mediaMs && mediaMs > 0 ? 'media' : 'duration'
      unitMs = (length - measuredMs) / restUnits
    } else if (measuredUnits > 0) {
      // The parts already measured set the pace for the rest.
      basis = 'marks'
      unitMs = measuredMs / measuredUnits
    }
  }
  if (!basis) {
    basis = tempo ? 'bpm' : 'estimate'
    unitMs = tempo ? (BEATS_PER_BAR * 60_000) / tempo : (FALLBACK_BARS_PER_LINE * BEATS_PER_BAR * 60_000) / FALLBACK_BPM
  }
  const useMarks = basis === 'marks'

  let cursor = 0
  const timed = shaped.map(({ block, lines, weights, pass, repeat, units: blockUnits, mark }) => {
    const total = useMarks && mark ? mark : blockUnits * unitMs
    const passMs = total / repeat
    const lineUnitMs = passMs / pass
    let offset = 0
    let timedLines: TimedLine[] = lines.map((line, lineIndex) => {
      const span = (weights[lineIndex] ?? 1) * lineUnitMs
      const entry = { lineIndex, start: offset, end: offset + span, chords: line.chords.length }
      offset += span
      return entry
    })
    if (barMs && barMs > 0 && settings.pace === 'duration') timedLines = snapToBars(timedLines, passMs, barMs)
    const start = cursor
    cursor += total
    return {
      id: block.id,
      label: block.label,
      start,
      end: cursor,
      repeat,
      passMs,
      measured: Boolean(useMarks && mark),
      lines: timedLines,
    }
  })

  return {
    blocks: timed,
    totalMs: cursor,
    basis,
    bpm: tempo,
    unitMs: units > 0 ? cursor / units : unitMs,
    weighs: tempo ? 'bars' : 'lines',
    measured: timed.filter((block) => block.measured).length,
  }
}

/**
 * Moves each line's start and end to a whole bar of this pass, so the highlight changes on
 * the bar line instead of between beats. A pass too short for a bar per line stays as is.
 */
function snapToBars(lines: TimedLine[], passMs: number, barMs: number): TimedLine[] {
  const bars = Math.round(passMs / barMs)
  if (lines.length < 1 || bars < lines.length || Math.abs(passMs - bars * barMs) > barMs * 0.6) return lines
  // The part's own bar length: passMs is a whole number of bars, but maybe not exactly barMs each.
  const unit = passMs / bars
  const cuts: number[] = []
  lines.forEach((line, index) => {
    const left = lines.length - index - 1
    const wanted = index === lines.length - 1 ? bars : Math.round((line.end / passMs) * bars)
    cuts.push(Math.min(bars - left, Math.max((cuts[index - 1] ?? 0) + 1, wanted)))
  })
  return lines.map((line, index) => ({ ...line, start: (cuts[index - 1] ?? 0) * unit, end: cuts[index]! * unit }))
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

/** A moment the band changes: each part, and each pass of a repeated part. */
export type Cue = { at: number; blockIndex: number; label: string; pass: number; repeat: number }

export function cuePoints(timeline: Timeline): Cue[] {
  return timeline.blocks.flatMap((block, blockIndex) =>
    Array.from({ length: block.repeat }, (_, index) => ({
      at: block.start + index * block.passMs,
      blockIndex,
      label: block.label,
      pass: index + 1,
      repeat: block.repeat,
    })),
  )
}

/** Last cue at or before `ms`; -1 during the intro countdown. */
export function cueIndexAt(cues: Cue[], ms: number): number {
  let found = -1
  for (let index = 0; index < cues.length; index++) {
    if (cues[index]!.at <= ms) found = index
    else break
  }
  return found
}

/** The tempo the timeline implies, when lines are weighed in bars. */
export function impliedBpm(timeline: Timeline): number | null {
  if (timeline.weighs !== 'bars' || timeline.unitMs <= 0) return null
  return Math.round((BEATS_PER_BAR * 60_000) / timeline.unitMs)
}

export function formatClock(ms: number): string {
  const sign = ms < 0 ? '\u2212' : ''
  const total = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`
}

/** `0:04,5`: intro lengths to the tenth of a second; negative when the recording runs ahead. */
export function formatLead(ms: number): string {
  const sign = ms < 0 ? '\u2212' : ''
  const tenths = Math.round(Math.abs(ms) / 100)
  const seconds = Math.floor(tenths / 10)
  return `${sign}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')},${tenths % 10}`
}

/** Calibration for the audio that is playing; null when it was measured on another recording. */
/** What identifies a recording: the video id, or an MP3's path without the site address it is served from. */
export function trackSource(src: string): string {
  return src.replace(/^https?:\/\/[^/]+(?=\/api\/audio\/)/i, '')
}

export function trackFor(
  playback: SongPlayback | undefined,
  kind: 'youtube' | 'mp3',
  media: SongMediaSources,
): PlaybackTrack | null {
  const track = playback?.[kind]
  const src = kind === 'youtube' ? media.youtubeId : media.audioUrl
  return track && src && trackSource(track.src) === trackSource(src) ? track : null
}

/** Silent playback borrows the lengths measured on YouTube, then on the MP3. */
export function referenceTrack(
  playback: SongPlayback | undefined,
  audio: PlaybackAudio,
  media: SongMediaSources,
): PlaybackTrack | null {
  if (audio === 'youtube') return trackFor(playback, 'youtube', media)
  if (audio === 'mp3') return trackFor(playback, 'mp3', media)
  return trackFor(playback, 'youtube', media) ?? trackFor(playback, 'mp3', media)
}

/** Part lengths from the media times tapped at each part start, and at the end. */
export function marksToParts(
  keys: string[],
  starts: (number | null)[],
  endMs: number | null,
): { introMs: number | null; parts: Record<string, number> } {
  const parts: Record<string, number> = {}
  keys.forEach((key, index) => {
    const at = starts[index]
    const next = index + 1 < keys.length ? starts[index + 1] : endMs
    if (at != null && next != null && next - at > 0) parts[key] = Math.round(next - at)
  })
  const first = starts[0]
  return { introMs: first == null ? null : Math.round(first), parts }
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

export type MediaOption = {
  key: string
  label: string
  url: string
  youtubeId: string | null
  audioUrl: string | null
  bpm: number | null
  durationMs: number | null
  selected: boolean
}

export type SongMediaSources = {
  youtubeId: string | null
  audioUrl: string | null
  bpm: number | null
  durationMs: number | null
  options: MediaOption[]
  /** Active option key (selected or picked). */
  activeKey: string | null
}

function optionFor(
  entry: SongSource,
  index: number,
  selectedIndex: number,
  top: { audioUrl: string; bpm: number | null; durationMs: number | null },
): MediaOption {
  const selected = index === selectedIndex
  const id = youtubeVideoId(entry.url)
  const ownAudio = selected ? top.audioUrl : entry.audioUrl?.trim() || ''
  const bpm = selected ? top.bpm : entry.bpm ?? top.bpm
  const durationMs = selected ? top.durationMs : entry.durationMs ?? top.durationMs
  return {
    key: id || entry.url,
    label: entry.label.trim() || `YouTube ${index + 1}`,
    url: entry.url,
    youtubeId: id,
    audioUrl: ownAudio ? resolveAudioUrl(ownAudio, apiRoot()) : null,
    bpm: bpm && bpm > 0 ? bpm : null,
    durationMs: durationMs && durationMs > 0 ? durationMs : null,
    selected,
  }
}

export function songMediaSources(
  song: Pick<Song, 'sources' | 'audioUrl' | 'bpm' | 'durationMs'>,
  pickUrl?: string | null,
): SongMediaSources {
  const sources = song.sources ?? []
  const selectedIndex = selectedYoutubeIndex(sources)
  const top = {
    audioUrl: song.audioUrl?.trim() || '',
    bpm: song.bpm && song.bpm > 0 ? song.bpm : null,
    durationMs: song.durationMs && song.durationMs > 0 ? song.durationMs : null,
  }
  const options = sources
    .map((entry, index) =>
      isYoutubeEntry(entry) ? optionFor(entry, index, selectedIndex, top) : null,
    )
    .filter((item): item is MediaOption => Boolean(item))

  let active = options.find((item) => item.selected) ?? options[0] ?? null
  if (pickUrl?.trim()) {
    const picked = options.find(
      (item) => item.url === pickUrl || item.youtubeId === youtubeVideoId(pickUrl),
    )
    if (picked) active = picked
  }

  if (active) {
    return {
      youtubeId: active.youtubeId,
      audioUrl: active.audioUrl,
      bpm: active.bpm,
      durationMs: active.durationMs,
      options,
      activeKey: active.key,
    }
  }

  const youtube = findYoutubeSource(sources)
  const raw = top.audioUrl
  return {
    youtubeId: youtube ? youtubeVideoId(youtube.url) : null,
    audioUrl: raw ? resolveAudioUrl(raw, apiRoot()) : null,
    bpm: top.bpm,
    durationMs: top.durationMs,
    options,
    activeKey: null,
  }
}

/** The audio that will actually play: falls back to silence when the song lacks the chosen source. */
export function effectiveAudio(choice: PlaybackAudio, media: SongMediaSources): PlaybackAudio {
  if (choice === 'youtube' && media.youtubeId) return 'youtube'
  if (choice === 'mp3' && media.audioUrl) return 'mp3'
  return 'off'
}
