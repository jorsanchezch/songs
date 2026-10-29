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

/** Display / edit duration as m:ss (or mm:ss). Empty when unset. */
export function formatDurationMmSs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Parse m:ss / mm:ss / h:mm:ss into milliseconds. Empty → null. */
export function parseDurationMmSs(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length === 2 || parts.length === 3) {
    const nums = parts.map((part) => Number(part))
    if (nums.some((value) => !Number.isFinite(value) || value < 0)) return null
    const secondsPart = nums[nums.length - 1]!
    const minutesPart = nums[nums.length - 2]!
    const hoursPart = parts.length === 3 ? nums[0]! : 0
    if (secondsPart >= 60 || (parts.length === 3 && minutesPart >= 60)) return null
    const total = Math.round(hoursPart) * 3600 + Math.round(minutesPart) * 60 + Math.round(secondsPart)
    return total >= 0 ? total * 1000 : null
  }
  // Bare number: treat as total seconds (compat while typing / paste).
  const seconds = parseOptionalInt(trimmed)
  if (seconds == null) return null
  return seconds * 1000
}

/** Resolve stored audio_url (relative /api/audio/… or absolute) for <audio>. */
export function resolveAudioUrl(url: string, apiRoot = ''): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed
  const root = apiRoot.replace(/\/$/, '')
  return `${root}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}
