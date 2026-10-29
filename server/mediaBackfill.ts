import { applyChartMedia, chartHasYoutube } from './chartMedia.ts'
import { chartMeta } from './meta.ts'
import type { Sql } from './sql.ts'
import { findYoutubeMedia, type YoutubeLookupEnv } from './youtubeMedia.ts'

export type MediaBackfillEnv = YoutubeLookupEnv & {
  AUDIO_BUCKET?: unknown
}

export type MediaBackfillOptions = {
  limit?: number
  dryRun?: boolean
  extractAudio?: boolean
}

export type MediaBackfillSongResult = {
  id: string
  title: string
  status: 'updated' | 'skipped' | 'queued' | 'error'
  reason?: string
  youtubeUrl?: string
  durationMs?: number | null
  bpm?: number | null
  audio?: 'unchanged' | 'skipped_no_r2' | 'skipped_no_extractor' | 'kept'
  via?: string
}

export type MediaBackfillReport = {
  apiKeyPresent: boolean
  r2Configured: boolean
  dryRun: boolean
  searchQuota: { day: string; used: number; limit: number; remaining: number }
  missingBefore: number
  updated: number
  skipped: number
  queued: number
  errors: number
  queueSize: number
  results: MediaBackfillSongResult[]
  note?: string
}

const QUOTA_KEY = 'youtube_search_quota'
const QUEUE_KEY = 'media_backfill_queue'
export const DAILY_SEARCH_LIMIT = 100

type SongRow = {
  id: string
  title: string
  artist: string
  origin: string
  catalog_source: string
  bpm: number | null
  duration_ms: number | null
  audio_url: string
  source_text: string
}

export function r2Configured(env: MediaBackfillEnv): boolean {
  return env.AUDIO_BUCKET != null
}

export async function mediaBackfillStatus(sql: Sql, env: MediaBackfillEnv): Promise<MediaBackfillReport> {
  const missing = await songsMissingYoutube(sql)
  const quota = await readQuota(sql)
  const queue = await readQueue(sql)
  return {
    apiKeyPresent: Boolean(env.YOUTUBE_API_KEY?.trim()),
    r2Configured: r2Configured(env),
    dryRun: true,
    searchQuota: {
      day: quota.day,
      used: quota.used,
      limit: DAILY_SEARCH_LIMIT,
      remaining: Math.max(0, DAILY_SEARCH_LIMIT - quota.used),
    },
    missingBefore: missing.length,
    updated: 0,
    skipped: 0,
    queued: queue.length,
    errors: 0,
    queueSize: queue.length,
    results: [],
    note: env.YOUTUBE_API_KEY?.trim()
      ? undefined
      : 'Falta el secreto YOUTUBE_API_KEY en el Worker. Sin clave se usa búsqueda pública best-effort (sin duración ISO ni cupo oficial).',
  }
}

export async function runMediaBackfill(
  sql: Sql,
  env: MediaBackfillEnv,
  options: MediaBackfillOptions = {},
): Promise<MediaBackfillReport> {
  const limit = clampLimit(options.limit)
  const dryRun = options.dryRun === true
  const extractAudio = options.extractAudio !== false
  const apiKeyPresent = Boolean(env.YOUTUBE_API_KEY?.trim())
  const hasR2 = r2Configured(env)
  const quota = await readQuota(sql)
  const remaining = apiKeyPresent ? Math.max(0, DAILY_SEARCH_LIMIT - quota.used) : limit
  const budget = Math.min(limit, remaining)

  const missing = await songsMissingYoutube(sql)
  const queue = await readQueue(sql)
  const ordered = orderCandidates(missing, queue)

  const toProcess = ordered.slice(0, budget)
  const toQueue = ordered.slice(budget).map((song) => song.id)

  const results: MediaBackfillSongResult[] = []
  let updated = 0
  let skipped = 0
  let errors = 0
  let searchesUsed = 0
  let consecutiveMisses = 0
  const deferred: string[] = []

  for (let index = 0; index < toProcess.length; index += 1) {
    const song = toProcess[index]!
    try {
      const result = await fillOne(sql, env, song, { dryRun, extractAudio, hasR2, apiKeyPresent })
      results.push(result)
      if (result.status === 'updated') {
        updated += 1
        consecutiveMisses = 0
      } else if (result.status === 'error') {
        errors += 1
        consecutiveMisses = 0
      } else {
        skipped += 1
        if (!apiKeyPresent && result.reason?.includes('Sin resultado')) consecutiveMisses += 1
        else consecutiveMisses = 0
      }
      if (result.via === 'youtube_api') searchesUsed += 1
      // Public scrape often throttles; park the rest in the queue for a later run.
      if (!apiKeyPresent && consecutiveMisses >= 3) {
        for (const rest of toProcess.slice(index + 1)) deferred.push(rest.id)
        break
      }
    } catch (error) {
      errors += 1
      consecutiveMisses = 0
      results.push({
        id: song.id,
        title: song.title,
        status: 'error',
        reason: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  const finalQueue = [...deferred, ...toQueue.filter((id) => !deferred.includes(id))]

  if (!dryRun) {
    if (apiKeyPresent && searchesUsed > 0) {
      await writeQuota(sql, { day: quota.day, used: quota.used + searchesUsed })
    }
    await writeQueue(sql, finalQueue)
  }

  const nextQuota = await readQuota(sql)
  return {
    apiKeyPresent,
    r2Configured: hasR2,
    dryRun,
    searchQuota: {
      day: nextQuota.day,
      used: dryRun ? quota.used : nextQuota.used,
      limit: DAILY_SEARCH_LIMIT,
      remaining: Math.max(0, DAILY_SEARCH_LIMIT - (dryRun ? quota.used : nextQuota.used)),
    },
    missingBefore: missing.length,
    updated,
    skipped,
    queued: dryRun ? toQueue.length + deferred.length : finalQueue.length,
    errors,
    queueSize: dryRun ? toQueue.length + deferred.length : finalQueue.length,
    results,
    note: noteFor(apiKeyPresent, hasR2, remaining, ordered.length, budget, deferred.length),
  }
}

async function fillOne(
  sql: Sql,
  env: MediaBackfillEnv,
  song: SongRow,
  opts: { dryRun: boolean; extractAudio: boolean; hasR2: boolean; apiKeyPresent: boolean },
): Promise<MediaBackfillSongResult> {
  if (chartHasYoutube(song.source_text) || chartHasYoutube(song.catalog_source)) {
    return { id: song.id, title: song.title, status: 'skipped', reason: 'Ya tiene YouTube en el chart.' }
  }

  const hit = await findYoutubeMedia(song.title, song.artist, env)
  if (!hit) {
    return {
      id: song.id,
      title: song.title,
      status: 'skipped',
      reason: opts.apiKeyPresent
        ? 'Sin resultado en YouTube.'
        : 'Sin resultado (no hay YOUTUBE_API_KEY; la búsqueda pública no encontró video).',
    }
  }

  const bpm = song.bpm != null && Number(song.bpm) > 0 ? Number(song.bpm) : hit.bpm
  const durationMs =
    song.duration_ms != null && Number(song.duration_ms) > 0 ? Number(song.duration_ms) : hit.durationMs
  let audio: MediaBackfillSongResult['audio'] = 'unchanged'
  let audioUrl = song.audio_url?.trim() ?? ''
  if (!audioUrl && opts.extractAudio) {
    if (!opts.hasR2) audio = 'skipped_no_r2'
    else audio = 'skipped_no_extractor'
  } else if (audioUrl) {
    audio = 'kept'
  }

  if (opts.dryRun) {
    return {
      id: song.id,
      title: song.title,
      status: 'updated',
      reason: 'dry-run',
      youtubeUrl: hit.url,
      durationMs,
      bpm,
      audio,
      via: hit.via,
    }
  }

  const patch = {
    youtubeUrl: hit.url,
    bpm: bpm ?? null,
    durationMs: durationMs ?? null,
    audioUrl: audioUrl || null,
  }

  const parts = await sql.all<{ instrument: string; source_text: string; revision: number }>(
    `SELECT instrument, source_text, revision FROM instrument_parts WHERE song_id = ?`,
    [song.id],
  )
  if (!parts.length) {
    return { id: song.id, title: song.title, status: 'error', reason: 'Sin instrument_parts.' }
  }

  const now = new Date().toISOString()
  let guitarText = song.source_text
  await sql.transaction(async (tx) => {
    for (const part of parts) {
      const nextText = applyChartMedia(part.source_text, patch)
      if (part.instrument === 'guitar') guitarText = nextText
      await tx.run(
        `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ?`,
        [nextText, song.id, part.instrument],
      )
    }
    const meta = chartMeta(guitarText, song.id)
    const catalogSource =
      song.origin === 'catalog' ? applyChartMedia(song.catalog_source || song.source_text, patch) : song.catalog_source
    await tx.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, bpm = ?, duration_ms = ?, audio_url = ?, catalog_source = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [
        meta.title || song.title,
        meta.artist || song.artist,
        meta.composer,
        meta.key,
        meta.source,
        meta.lyrics,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        catalogSource,
        now,
        song.id,
      ],
    )
  })

  return {
    id: song.id,
    title: song.title,
    status: 'updated',
    youtubeUrl: hit.url,
    durationMs: metaDuration(durationMs),
    bpm: bpm ?? null,
    audio,
    via: hit.via,
  }
}

function metaDuration(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value)
}

async function songsMissingYoutube(sql: Sql): Promise<SongRow[]> {
  const rows = await sql.all<SongRow>(
    `SELECT s.id, s.title, s.artist, s.origin, s.catalog_source, s.bpm, s.duration_ms, s.audio_url,
            COALESCE(p.source_text, s.catalog_source, '') AS source_text
     FROM songs s
     LEFT JOIN instrument_parts p ON p.song_id = s.id AND p.instrument = 'guitar'
     WHERE s.hidden = 0
     ORDER BY s.title COLLATE NOCASE`,
  )
  return rows.filter((row) => !chartHasYoutube(row.source_text) && !chartHasYoutube(row.catalog_source ?? ''))
}

function orderCandidates(missing: SongRow[], queue: string[]): SongRow[] {
  const byId = new Map(missing.map((song) => [song.id, song]))
  const ordered: SongRow[] = []
  const seen = new Set<string>()
  for (const id of queue) {
    const song = byId.get(id)
    if (!song || seen.has(id)) continue
    ordered.push(song)
    seen.add(id)
  }
  for (const song of missing) {
    if (seen.has(song.id)) continue
    ordered.push(song)
    seen.add(song.id)
  }
  return ordered
}

function clampLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 20
  return Math.max(1, Math.min(100, Math.round(raw)))
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readQuota(sql: Sql): Promise<{ day: string; used: number }> {
  const day = todayUtc()
  const row = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [QUOTA_KEY])
  if (!row?.value) return { day, used: 0 }
  try {
    const parsed = JSON.parse(row.value) as { day?: string; used?: number }
    if (parsed.day !== day) return { day, used: 0 }
    return { day, used: Math.max(0, Number(parsed.used) || 0) }
  } catch {
    return { day, used: 0 }
  }
}

async function writeQuota(sql: Sql, quota: { day: string; used: number }): Promise<void> {
  await sql.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [QUOTA_KEY, JSON.stringify(quota)],
  )
}

async function readQueue(sql: Sql): Promise<string[]> {
  const row = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [QUEUE_KEY])
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

async function writeQueue(sql: Sql, ids: string[]): Promise<void> {
  await sql.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [QUEUE_KEY, JSON.stringify(ids)],
  )
}

function noteFor(
  apiKeyPresent: boolean,
  hasR2: boolean,
  remaining: number,
  missingCount: number,
  budget: number,
  deferred = 0,
): string | undefined {
  const notes: string[] = []
  if (!apiKeyPresent) {
    notes.push(
      'Sin YOUTUBE_API_KEY: se usa búsqueda pública best-effort. Configura el secreto del Worker para search.list + videos.list (duración).',
    )
    if (deferred > 0) {
      notes.push(`La búsqueda pública se limitó; ${deferred} quedan en cola para otro lote.`)
    }
  } else if (remaining <= 0) {
    notes.push('Cupo diario de search.list agotado (~100/día). El resto queda en cola.')
  } else if (missingCount > budget) {
    notes.push(`Procesadas ${budget} de ${missingCount}; el resto queda en cola por cupo/lote.`)
  }
  if (!hasR2) {
    notes.push('R2 no configurado: no se extrae MP3; usa la ruta de subida/URL en el editor.')
  } else {
    notes.push('R2 está enlazado, pero este Worker no extrae audio de YouTube; deja audio_url vacío para subirlo a mano.')
  }
  return notes.length ? notes.join(' ') : undefined
}
