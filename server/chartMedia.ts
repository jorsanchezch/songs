/** Read and write YouTube / bpm / duration / audio into chart text (YAML or ChordPro). */

import {
  YOUTUBE_LABEL,
  addYoutubeSource,
  findSourceIndex,
  formatSourceText,
  isYoutubeEntry,
  normalizeSourceMedia,
  parseSourceText,
  selectYoutubeSource,
  selectedYoutubeIndex,
  serializeSources,
  type SourceEntry,
  type TopMedia,
} from '../src/lib/sourceEntry.ts'

export type ChartMediaPatch = {
  /** @deprecated Prefer addYoutubeUrl — kept for older callers; behaves as upsert/replace-first. */
  youtubeUrl?: string | null
  /** Additive: append if new video id; never wipes other sources. */
  addYoutubeUrl?: string | null
  /** Make this URL the selected/primary YouTube (moves top media). */
  selectYoutubeUrl?: string | null
  /** Replace the full sources list (e.g. copyChartMedia). */
  replaceSources?: SourceEntry[] | null
  bpm?: number | null
  durationMs?: number | null
  audioUrl?: string | null
}

export function chartHasYoutube(text: string): boolean {
  return /youtu\.?be/i.test(text)
}

export function selectedYoutubeUrl(text: string): string | null {
  const { entries } = readChartSources(text)
  const index = selectedYoutubeIndex(entries)
  return index >= 0 ? entries[index]!.url : null
}

export function chartYoutubeUrls(text: string): string[] {
  const { entries } = readChartSources(text)
  return entries.filter((entry) => isYoutubeEntry(entry)).map((entry) => entry.url)
}

/** Copy sources + top media from `fromText` onto `targetText` (lyrics/structure kept). */
export function copyChartMedia(targetText: string, fromText: string): string {
  const from = readChartSources(fromText)
  return applyChartMedia(targetText, {
    replaceSources: from.entries,
    bpm: from.top.bpm,
    durationMs: from.top.durationMs,
    audioUrl: from.top.audioUrl || null,
  })
}

export function applyChartMedia(text: string, patch: ChartMediaPatch): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (normalized.trimStart().startsWith('---')) return patchMarkdown(normalized, patch)
  return patchChordPro(normalized, patch)
}

function patchMarkdown(text: string, patch: ChartMediaPatch): string {
  const match = text.match(/^---\n([\s\S]*?)\n---(\n?)/)
  if (!match) return text
  const body = text.slice(match[0].length)
  const front = match[1] ?? ''
  const fields = parseFrontFields(front)
  if (!fields.sources.length && fields.scalars.source?.trim()) {
    fields.sources = [{ url: fields.scalars.source.trim(), label: 'Fuente' }]
  }
  const applied = applyPatchToSources(fields.sources, readTop(fields.scalars), patch)
  fields.sources = applied.entries
  writeTop(fields.scalars, applied.top, patch)

  if (!fields.scalars.source && fields.sources[0]) {
    fields.scalars.source = fields.sources[0].url
  }
  return renderMarkdown(fields, match[2] ?? '\n', body)
}

const SONG_META = ['title', 'artist', 'composer', 'key', 'original_key', 'source', 'bpm', 'duration_ms', 'audio_url']
const SONG_IDENTITY = ['title', 'artist', 'composer', 'key', 'original_key']
const IDENTITY_LINE = new RegExp(`^\\{(${SONG_IDENTITY.join('|')}):`, 'i')

/**
 * Copy title, artist, composer, and keys from one chart onto another, across YAML and ChordPro.
 * Media (sources, BPM, duration, audio) travels with copyChartMedia; parts and other header lines stay.
 */
export function shareChartMeta(targetText: string, savedText: string): string {
  const target = targetText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const song = readIdentity(savedText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))
  if (!song) return targetText
  let next: string
  if (target.startsWith('---\n')) {
    const into = target.match(/^---\n([\s\S]*?)\n---(\n?)/)
    if (!into) return targetText
    const fields = parseFrontFields(into[1] ?? '')
    for (const key of SONG_IDENTITY) {
      if (song[key]) fields.scalars[key] = song[key]
      else delete fields.scalars[key]
    }
    next = renderMarkdown(fields, into[2] ?? '\n', target.slice(into[0].length))
  } else {
    const into = splitChordPro(target)
    const identity = SONG_IDENTITY.flatMap((key) => (song[key] ? [`{${key}: ${song[key]}}`] : []))
    const others = into.meta.filter((line) => !IDENTITY_LINE.test(line.trim()))
    next = [...identity, ...others, ...into.rest].join('\n')
  }
  return next === target ? targetText : next
}

function readIdentity(text: string): Record<string, string> | null {
  const out: Record<string, string> = {}
  if (text.startsWith('---\n')) {
    const match = text.match(/^---\n([\s\S]*?)\n---(\n?)/)
    if (!match) return null
    const { scalars } = parseFrontFields(match[1] ?? '')
    for (const key of SONG_IDENTITY) if (scalars[key]?.trim()) out[key] = scalars[key].trim()
    return out
  }
  for (const line of splitChordPro(text).meta) {
    const match = line.trim().match(/^\{([A-Za-z_]+):\s*([^}]*)\}\s*$/)
    const key = match?.[1]?.toLowerCase()
    if (!key || !SONG_IDENTITY.includes(key)) continue
    const value = unquote(match?.[2] ?? '')
    if (value) out[key] = value
  }
  return out
}

function renderMarkdown(fields: FrontFields, newline: string, body: string): string {
  const order = SONG_META
  const lines: string[] = []
  const seen = new Set<string>()
  for (const key of order) {
    const value = fields.scalars[key]
    if (value == null || !String(value).trim()) continue
    lines.push(`${key}: ${yaml(String(value))}`)
    seen.add(key)
  }
  for (const [key, value] of Object.entries(fields.scalars)) {
    if (seen.has(key) || !String(value).trim()) continue
    lines.push(`${key}: ${yaml(String(value))}`)
  }
  if (fields.sources.length) {
    lines.push('sources:')
    for (const line of serializeSources(fields.sources)) {
      lines.push(`  - ${line}`)
    }
  }
  return `---\n${lines.join('\n')}\n---${newline}${body}`
}

/** Header directives before the first part, and everything from the first part on. */
function splitChordPro(text: string): { meta: string[]; rest: string[] } {
  const lines = text.split('\n')
  let metaEnd = lines.length
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (!trimmed) continue
    if (/^\{start_of_/i.test(trimmed) || /^#/.test(trimmed) || /^\[[^\]]+\]/.test(trimmed)) {
      metaEnd = index
      break
    }
    if (!trimmed.startsWith('{') && !trimmed.startsWith('#')) {
      metaEnd = index
      break
    }
  }
  return { meta: lines.slice(0, metaEnd), rest: lines.slice(metaEnd) }
}

function patchChordPro(text: string, patch: ChartMediaPatch): string {
  const { meta, rest } = splitChordPro(text)
  const nextMeta = [...meta]

  const setDirective = (name: string, value: string | null) => {
    const pattern = new RegExp(`^\\{${name}:\\s*[^}]*\\}\\s*$`, 'i')
    const index = nextMeta.findIndex((line) => pattern.test(line.trim()))
    if (value == null || !value.trim()) {
      if (index >= 0) nextMeta.splice(index, 1)
      return
    }
    const line = `{${name}: ${value.trim()}}`
    if (index >= 0) nextMeta[index] = line
    else insertMeta(nextMeta, line, name)
  }

  const sourcePattern = /^\{source:\s*([^}]*)\}\s*$/i
  const sourceIndexes: number[] = []
  const entries: SourceEntry[] = []
  for (let index = 0; index < nextMeta.length; index += 1) {
    const match = (nextMeta[index] ?? '').trim().match(sourcePattern)
    if (!match) continue
    const parsed = parseSourceText(match[1] ?? '')
    if (!parsed) continue
    sourceIndexes.push(index)
    entries.push(parsed)
  }

  const scalars: Record<string, string> = {}
  for (const line of nextMeta) {
    const match = (line ?? '').trim().match(/^\{([A-Za-z_]+):\s*([^}]*)\}\s*$/)
    if (!match?.[1]) continue
    const name = match[1].toLowerCase()
    if (name === 'source') continue
    scalars[name] = (match[2] ?? '').trim()
  }

  const applied = applyPatchToSources(entries, readTop(scalars), patch)
  writeTop(scalars, applied.top, patch)

  if (patch.bpm !== undefined || patch.durationMs !== undefined || patch.audioUrl !== undefined || patch.replaceSources || patch.addYoutubeUrl !== undefined || patch.selectYoutubeUrl !== undefined || patch.youtubeUrl !== undefined) {
    setDirective('bpm', scalars.bpm?.trim() ? scalars.bpm : null)
    setDirective('duration_ms', scalars.duration_ms?.trim() ? scalars.duration_ms : null)
    setDirective('audio_url', scalars.audio_url?.trim() ? scalars.audio_url : null)
  }

  if (
    patch.youtubeUrl !== undefined ||
    patch.addYoutubeUrl !== undefined ||
    patch.selectYoutubeUrl !== undefined ||
    patch.replaceSources !== undefined
  ) {
    for (const index of [...sourceIndexes].reverse()) nextMeta.splice(index, 1)
    const serialized = serializeSources(applied.entries)
    let insertAt = nextMeta.length
    for (let index = nextMeta.length - 1; index >= 0; index -= 1) {
      const match = (nextMeta[index] ?? '').trim().match(/^\{([A-Za-z_]+):/)
      if (!match?.[1]) continue
      const name = match[1].toLowerCase()
      if (['title', 'artist', 'composer', 'key', 'original_key', 'source', 'bpm', 'duration_ms', 'audio_url'].includes(name)) {
        insertAt = index + 1
        break
      }
    }
    for (let offset = 0; offset < serialized.length; offset += 1) {
      nextMeta.splice(insertAt + offset, 0, `{source: ${serialized[offset]}}`)
    }
  }

  while (nextMeta.length && !(nextMeta[nextMeta.length - 1] ?? '').trim()) nextMeta.pop()
  const spacer = rest.length && (rest[0] ?? '').trim() ? [''] : []
  return [...nextMeta, ...spacer, ...rest].join('\n')
}

function applyPatchToSources(
  sources: SourceEntry[],
  top: TopMedia,
  patch: ChartMediaPatch,
): { entries: SourceEntry[]; top: TopMedia } {
  let entries = sources.map((entry) => ({ ...entry }))
  let nextTop = { ...top }

  if (patch.replaceSources) {
    entries = patch.replaceSources.map((entry) => ({ ...entry }))
  }

  // Legacy upsert: replace first YouTube or remove all YouTube when null.
  if (patch.youtubeUrl !== undefined && patch.addYoutubeUrl === undefined && patch.replaceSources === undefined) {
    const trimmed = patch.youtubeUrl?.trim() ?? ''
    if (!trimmed) {
      entries = entries.filter((entry) => !isYoutubeEntry(entry))
      nextTop = { bpm: nextTop.bpm, durationMs: nextTop.durationMs, audioUrl: nextTop.audioUrl }
    } else {
      const index = entries.findIndex((entry) => isYoutubeEntry(entry))
      const next = { url: trimmed, label: YOUTUBE_LABEL }
      if (index >= 0) entries = entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...next } : entry))
      else entries = [...entries, next]
    }
  }

  if (patch.addYoutubeUrl !== undefined && patch.addYoutubeUrl?.trim()) {
    const added = addYoutubeSource(entries, nextTop, patch.addYoutubeUrl)
    entries = added.entries
    nextTop = added.top
  }

  if (patch.selectYoutubeUrl?.trim()) {
    const index = findSourceIndex(entries, patch.selectYoutubeUrl)
    if (index >= 0) {
      const selected = selectYoutubeSource(entries, nextTop, index)
      entries = selected.entries
      nextTop = selected.top
    }
  }

  if (patch.bpm !== undefined) nextTop.bpm = patch.bpm
  if (patch.durationMs !== undefined) nextTop.durationMs = patch.durationMs
  if (patch.audioUrl !== undefined) nextTop.audioUrl = patch.audioUrl?.trim() ?? ''

  return normalizeSourceMedia(entries, nextTop)
}

function readTop(scalars: Record<string, string>): TopMedia {
  return {
    bpm: optionalInt(scalars.bpm),
    durationMs: optionalInt(scalars.duration_ms),
    audioUrl: (scalars.audio_url ?? '').trim(),
  }
}

function writeTop(scalars: Record<string, string>, top: TopMedia, patch: ChartMediaPatch) {
  const touchBpm = patch.bpm !== undefined || patch.selectYoutubeUrl !== undefined || patch.replaceSources !== undefined
  const touchDuration =
    patch.durationMs !== undefined || patch.selectYoutubeUrl !== undefined || patch.replaceSources !== undefined
  const touchAudio =
    patch.audioUrl !== undefined || patch.selectYoutubeUrl !== undefined || patch.replaceSources !== undefined

  if (touchBpm) {
    if (top.bpm == null || !(top.bpm > 0)) delete scalars.bpm
    else scalars.bpm = String(Math.round(top.bpm))
  }
  if (touchDuration) {
    if (top.durationMs == null || !(top.durationMs > 0)) delete scalars.duration_ms
    else scalars.duration_ms = String(Math.round(top.durationMs))
  }
  if (touchAudio) {
    if (!top.audioUrl.trim()) delete scalars.audio_url
    else scalars.audio_url = top.audioUrl.trim()
  }
}

function readChartSources(text: string): { entries: SourceEntry[]; top: TopMedia } {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (normalized.trimStart().startsWith('---')) {
    const match = normalized.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return { entries: [], top: { bpm: null, durationMs: null, audioUrl: '' } }
    const fields = parseFrontFields(match[1] ?? '')
    return normalizeSourceMedia(fields.sources, readTop(fields.scalars))
  }
  const entries: SourceEntry[] = []
  const scalars: Record<string, string> = {}
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    const source = trimmed.match(/^\{source:\s*([^}]*)\}\s*$/i)
    if (source) {
      const parsed = parseSourceText(source[1] ?? '')
      if (parsed) entries.push(parsed)
      continue
    }
    const meta = trimmed.match(/^\{([A-Za-z_]+):\s*([^}]*)\}\s*$/)
    if (meta?.[1]) scalars[meta[1].toLowerCase()] = (meta[2] ?? '').trim()
  }
  return normalizeSourceMedia(entries, readTop(scalars))
}

function insertMeta(meta: string[], line: string, name: string) {
  const priority = ['title', 'artist', 'composer', 'key', 'original_key', 'source', 'bpm', 'duration_ms', 'audio_url']
  const rank = priority.indexOf(name)
  let insertAt = meta.length
  for (let index = meta.length - 1; index >= 0; index -= 1) {
    const match = (meta[index] ?? '').trim().match(/^\{([A-Za-z_]+):/)
    if (!match?.[1]) continue
    const other = priority.indexOf(match[1].toLowerCase())
    if (other >= 0 && (rank < 0 || other <= rank)) {
      insertAt = index + 1
      break
    }
  }
  meta.splice(insertAt, 0, line)
}

type FrontFields = {
  scalars: Record<string, string>
  sources: SourceEntry[]
}

function parseFrontFields(front: string): FrontFields {
  const scalars: Record<string, string> = {}
  const sources: SourceEntry[] = []
  let inSources = false
  for (const line of front.split('\n')) {
    if (/^sources:\s*$/i.test(line.trim())) {
      inSources = true
      continue
    }
    if (inSources) {
      const item = line.match(/^\s*-\s+(.+)$/)
      if (item) {
        const parsed = parseSourceText(item[1] ?? '')
        if (parsed) sources.push(parsed)
        continue
      }
      if (/^\s/.test(line) && line.trim()) continue
      inSources = false
    }
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (!match?.[1]) continue
    scalars[match[1].toLowerCase()] = unquote(match[2] ?? '')
  }
  return { scalars, sources }
}

function optionalInt(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function yaml(value: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || /^\s|\s$/.test(value) || value === '') {
    return JSON.stringify(value)
  }
  return value
}

// Re-export for callers that format a single line.
export { formatSourceText, YOUTUBE_LABEL }
