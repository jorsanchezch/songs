import type { SongSource } from '@/lib/types'

export const YOUTUBE_LABEL = 'YouTube'

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

export function findYoutubeSource(sources: SongSource[]): SongSource | undefined {
  return (
    sources.find((item) => item.label.trim().toLowerCase() === 'youtube') ??
    sources.find((item) => isYoutubeUrl(item.url))
  )
}

export function youtubeUrl(sources: SongSource[]): string {
  return findYoutubeSource(sources)?.url ?? ''
}

/** Upsert or remove the YouTube entry (`label: YouTube`). */
export function withYoutubeUrl(sources: SongSource[], url: string): SongSource[] {
  const trimmed = url.trim()
  const index = sources.findIndex(
    (item) => item.label.trim().toLowerCase() === 'youtube' || isYoutubeUrl(item.url),
  )
  if (!trimmed) {
    if (index < 0) return sources
    return sources.filter((_, entryIndex) => entryIndex !== index)
  }
  const next = { url: trimmed, label: YOUTUBE_LABEL }
  if (index >= 0) {
    return sources.map((item, entryIndex) => (entryIndex === index ? next : item))
  }
  return [...sources, next]
}

export function parseOptionalInt(raw: string | undefined | null): number | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

export function durationSecondsFromMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  return String(Math.round(ms / 1000))
}

export function durationMsFromSeconds(raw: string): number | null {
  const seconds = parseOptionalInt(raw)
  if (seconds == null) return null
  return seconds * 1000
}
