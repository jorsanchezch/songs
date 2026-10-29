/** Shared parse/serialize for chart source lines (app + Worker/Node). No imports. */

export const YOUTUBE_LABEL = 'YouTube'

export type SourceMedia = {
  audioUrl?: string
  durationMs?: number | null
  bpm?: number | null
}

export type SourceEntry = SourceMedia & {
  url: string
  label: string
  selected?: boolean
}

export type TopMedia = {
  bpm: number | null
  durationMs: number | null
  audioUrl: string
}

const ATTR_TOKEN = /^(selected|audio_url=.+|duration_ms=\d+|bpm=\d+)$/i

export function isYoutubeUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '').toLowerCase()
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be'
    )
  } catch {
    return /youtu\.?be/i.test(trimmed)
  }
}

export function isYoutubeEntry(entry: Pick<SourceEntry, 'url' | 'label'>): boolean {
  return entry.label.trim().toLowerCase() === 'youtube' || isYoutubeUrl(entry.url)
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
    const match = trimmed.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/)
    return match?.[1] ?? null
  }
}

export function sameVideo(a: string, b: string): boolean {
  const left = youtubeVideoId(a)
  const right = youtubeVideoId(b)
  if (left && right) return left === right
  return a.trim() === b.trim()
}

export function findSourceIndex(entries: SourceEntry[], url: string): number {
  const trimmed = url.trim()
  if (!trimmed) return -1
  const byId = youtubeVideoId(trimmed)
  return entries.findIndex((entry) => {
    if (byId) {
      const id = youtubeVideoId(entry.url)
      if (id) return id === byId
    }
    return entry.url.trim() === trimmed
  })
}

/** Selected YouTube = flagged entry, else first YouTube. */
export function selectedYoutubeIndex(entries: SourceEntry[]): number {
  const flagged = entries.findIndex((entry) => entry.selected && isYoutubeEntry(entry))
  if (flagged >= 0) return flagged
  return entries.findIndex((entry) => isYoutubeEntry(entry))
}

export function parseSourceText(raw: string): SourceEntry | null {
  const text = unquote(raw.trim())
  if (!text) return null

  const parts = text.split('|').map((part) => part.trim())
  const url = parts[0] ?? ''
  if (!url) return null
  if (!/^https?:\/\//i.test(url) && !url.includes('.') && !/^[\w-]{11}$/.test(url)) {
    return null
  }

  if (parts.length === 1) {
    return { url, label: defaultSourceLabel(url) }
  }

  const rest = parts.slice(1)
  const last = rest[rest.length - 1] ?? ''
  const attrTokens = last.split(/\s+/).filter(Boolean)
  const allAttrs = attrTokens.length > 0 && attrTokens.every((token) => ATTR_TOKEN.test(token))

  let labelParts = rest
  let attrs: string[] = []
  if (allAttrs) {
    labelParts = rest.slice(0, -1)
    attrs = attrTokens
  }

  const label = labelParts.join(' | ').trim() || defaultSourceLabel(url)
  const entry: SourceEntry = { url, label }
  for (const token of attrs) {
    if (/^selected$/i.test(token)) {
      entry.selected = true
      continue
    }
    const audio = token.match(/^audio_url=(.+)$/i)
    if (audio?.[1]) {
      entry.audioUrl = decodeAttr(audio[1])
      continue
    }
    const duration = token.match(/^duration_ms=(\d+)$/i)
    if (duration?.[1]) {
      entry.durationMs = Number(duration[1])
      continue
    }
    const bpm = token.match(/^bpm=(\d+)$/i)
    if (bpm?.[1]) {
      entry.bpm = Number(bpm[1])
    }
  }
  return entry
}

export function formatSourceText(entry: SourceEntry, opts: { withSelected?: boolean; withMedia?: boolean } = {}): string {
  const label = entry.label.trim()
  const chunks = [entry.url.trim()]
  if (label) chunks.push(label)

  const attrs: string[] = []
  if (opts.withSelected && entry.selected) attrs.push('selected')
  if (opts.withMedia) {
    if (entry.audioUrl?.trim()) attrs.push(`audio_url=${encodeAttr(entry.audioUrl.trim())}`)
    if (entry.durationMs != null && Number.isFinite(entry.durationMs) && entry.durationMs >= 0) {
      attrs.push(`duration_ms=${Math.round(entry.durationMs)}`)
    }
    if (entry.bpm != null && Number.isFinite(entry.bpm) && entry.bpm > 0) {
      attrs.push(`bpm=${Math.round(entry.bpm)}`)
    }
  }
  if (attrs.length) chunks.push(attrs.join(' '))
  return chunks.join(' | ')
}

/**
 * Merge selected line media into unset top fields; strip media from selected line;
 * clear selected from others; mark the selected YouTube.
 */
export function normalizeSourceMedia(entries: SourceEntry[], top: TopMedia): { entries: SourceEntry[]; top: TopMedia } {
  const index = selectedYoutubeIndex(entries)
  const nextTop: TopMedia = {
    bpm: top.bpm,
    durationMs: top.durationMs,
    audioUrl: top.audioUrl?.trim() ?? '',
  }
  const next = entries.map((entry, entryIndex) => {
    const base: SourceEntry = {
      url: entry.url,
      label: entry.label,
      selected: false,
    }
    if (!isYoutubeEntry(entry)) return base
    if (entryIndex === index) {
      if ((nextTop.bpm == null || nextTop.bpm <= 0) && entry.bpm != null && entry.bpm > 0) nextTop.bpm = entry.bpm
      if ((nextTop.durationMs == null || nextTop.durationMs <= 0) && entry.durationMs != null && entry.durationMs > 0) {
        nextTop.durationMs = entry.durationMs
      }
      if (!nextTop.audioUrl && entry.audioUrl?.trim()) nextTop.audioUrl = entry.audioUrl.trim()
      return { ...base, selected: true }
    }
    return {
      ...base,
      audioUrl: entry.audioUrl?.trim() || undefined,
      durationMs: entry.durationMs ?? null,
      bpm: entry.bpm ?? null,
    }
  })
  return { entries: next, top: nextTop }
}

/**
 * Move current top media onto the old selection's line; promote the new selection's
 * line media to top. Clearing MP3 when the new link has none; duration/BPM fall back.
 */
export function selectYoutubeSource(
  entries: SourceEntry[],
  top: TopMedia,
  index: number,
): { entries: SourceEntry[]; top: TopMedia; needsDuration: boolean } {
  if (index < 0 || index >= entries.length || !isYoutubeEntry(entries[index]!)) {
    return { entries, top, needsDuration: false }
  }
  const current = selectedYoutubeIndex(entries)
  if (current === index) {
    const normalized = normalizeSourceMedia(entries, top)
    return { ...normalized, needsDuration: false }
  }

  const next = entries.map((entry) => ({ ...entry }))
  if (current >= 0) {
    const old = next[current]!
    next[current] = {
      ...old,
      selected: false,
      audioUrl: top.audioUrl?.trim() || undefined,
      durationMs: top.durationMs ?? null,
      bpm: top.bpm ?? null,
    }
  }

  const target = next[index]!
  const audioUrl = target.audioUrl?.trim() ?? ''
  const durationMs = target.durationMs ?? top.durationMs
  const bpm = target.bpm ?? top.bpm
  next[index] = {
    url: target.url,
    label: target.label,
    selected: true,
  }

  return {
    entries: next,
    top: { audioUrl, durationMs: durationMs ?? null, bpm: bpm ?? null },
    // True when the new link itself has no duration (top may still fall back until lookup).
    needsDuration: target.durationMs == null || !(target.durationMs > 0),
  }
}

export function removeSourceEntry(
  entries: SourceEntry[],
  top: TopMedia,
  index: number,
): { entries: SourceEntry[]; top: TopMedia } {
  if (index < 0 || index >= entries.length) return { entries, top }
  const removingSelected = selectedYoutubeIndex(entries) === index && isYoutubeEntry(entries[index]!)
  const without = entries.filter((_, entryIndex) => entryIndex !== index)
  if (!removingSelected) return { entries: without, top }

  const nextYt = without.findIndex((entry) => isYoutubeEntry(entry))
  if (nextYt < 0) {
    return {
      entries: without,
      top: { bpm: null, durationMs: null, audioUrl: '' },
    }
  }
  // The removed row was principal: promote the next YouTube's line media to top
  // (selectYoutubeSource would no-op because first-YT already "selects" it).
  const target = without[nextYt]!
  const nextTop: TopMedia = {
    audioUrl: target.audioUrl?.trim() ?? '',
    durationMs: target.durationMs ?? null,
    bpm: target.bpm ?? null,
  }
  const next = without.map((entry, entryIndex) => {
    if (entryIndex !== nextYt) {
      return isYoutubeEntry(entry) ? { ...entry, selected: false } : { url: entry.url, label: entry.label }
    }
    return { url: entry.url, label: entry.label, selected: true }
  })
  return { entries: next, top: nextTop }
}

/** Append a YouTube URL if new. Does not steal selection from an existing YouTube. */
export function addYoutubeSource(
  entries: SourceEntry[],
  top: TopMedia,
  url: string,
  label = YOUTUBE_LABEL,
): { entries: SourceEntry[]; top: TopMedia; added: boolean } {
  const trimmed = url.trim()
  if (!trimmed) return { entries, top, added: false }
  if (findSourceIndex(entries, trimmed) >= 0) return { entries, top, added: false }
  const next = [...entries, { url: trimmed, label: label.trim() || YOUTUBE_LABEL }]
  const ytCount = next.filter((entry) => isYoutubeEntry(entry)).length
  if (ytCount === 1) {
    return { entries: normalizeSourceMedia(next, top).entries, top, added: true }
  }
  return { entries: next, top, added: true }
}

/** Serialize sources for chart text. Selected media stays on top-level fields. */
export function serializeSources(entries: SourceEntry[]): string[] {
  const ytCount = entries.filter((entry) => isYoutubeEntry(entry)).length
  const selected = selectedYoutubeIndex(entries)
  return entries.map((entry, index) => {
    const isSelectedYt = index === selected && isYoutubeEntry(entry)
    return formatSourceText(
      {
        ...entry,
        selected: isSelectedYt,
        audioUrl: isSelectedYt ? undefined : entry.audioUrl,
        durationMs: isSelectedYt ? null : entry.durationMs,
        bpm: isSelectedYt ? null : entry.bpm,
      },
      {
        withSelected: isSelectedYt && ytCount > 1,
        withMedia: isYoutubeEntry(entry) && !isSelectedYt,
      },
    )
  })
}

export function defaultSourceLabel(url: string): string {
  if (/youtu(\.be|be\.com)/i.test(url)) return YOUTUBE_LABEL
  if (/\.pdf($|\?)/i.test(url)) return 'Cifra PDF'
  return 'Fuente'
}

function encodeAttr(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

function decodeAttr(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'))
  } catch {
    return value
  }
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
