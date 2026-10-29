/**
 * YouTube → MP3 extract for Node (local sqlite / CI scripts).
 * Cloudflare Workers cannot run yt-dlp; they return skipped_no_extractor.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { applyChartMedia, chartHasYoutube, selectedYoutubeUrl } from './chartMedia.ts'
import { audioFolder, audioStoreReady, putAudioObject, type AudioStoreEnv } from './audioStorage.ts'
import { chartMeta } from './meta.ts'
import type { Sql } from './sql.ts'

const execFileAsync = promisify(execFile)

export type AudioExtractResult = {
  id: string
  title: string
  status: 'updated' | 'skipped' | 'error'
  reason?: string
  audioUrl?: string
  youtubeUrl?: string
}

export type AudioExtractReport = {
  extractorAvailable: boolean
  r2Configured: boolean
  storeReady: boolean
  dryRun: boolean
  missingAudio: number
  updated: number
  skipped: number
  errors: number
  results: AudioExtractResult[]
  note?: string
  blocked?: boolean
}

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

export async function ytDlpAvailable(): Promise<boolean> {
  try {
    await execFileAsync('yt-dlp', ['--version'], { timeout: 15_000 })
    return true
  } catch {
    try {
      await execFileAsync('python3', ['-m', 'yt_dlp', '--version'], { timeout: 15_000 })
      return true
    } catch {
      return false
    }
  }
}

function ytDlpCmd(): { bin: string; prefix: string[] } {
  return { bin: 'yt-dlp', prefix: [] }
}

export async function songsMissingAudio(sql: Sql): Promise<SongRow[]> {
  const rows = await sql.all<SongRow>(
    `SELECT s.id, s.title, s.artist, s.origin, s.catalog_source, s.bpm, s.duration_ms, s.audio_url,
            COALESCE(p.source_text, s.catalog_source, '') AS source_text
     FROM songs s
     LEFT JOIN instrument_parts p ON p.song_id = s.id AND p.instrument = 'guitar'
     WHERE s.hidden = 0
       AND TRIM(COALESCE(s.audio_url, '')) = ''
     ORDER BY s.title COLLATE NOCASE`,
  )
  return rows.filter(
    (row) => chartHasYoutube(row.source_text) || chartHasYoutube(row.catalog_source ?? ''),
  )
}

export function youtubeUrlFromChart(text: string): string | null {
  const selected = selectedYoutubeUrl(text)
  if (selected) return selected
  const md = text.match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/[^\s"'|]+|youtu\.be\/[^\s"'|]+)/i)
  if (md?.[0]) return md[0].replace(/[),.;]+$/, '')
  const cho = text.match(/\{(?:source|meta):\s*(https?:\/\/[^\s}]*youtu[^\s}]*)\}/i)
  return cho?.[1]?.trim() ?? null
}

/** Extract one YouTube link to MP3 bytes and store under songs/{songId|tmp}/…. */
export async function extractYoutubeLinkAudio(
  env: AudioStoreEnv,
  youtubeUrl: string,
  songId?: string,
): Promise<{ audioUrl: string; key: string }> {
  const bytes = await downloadYoutubeMp3(youtubeUrl)
  const folder = songId?.trim() ? audioFolder(songId) : 'tmp'
  const key = `songs/${folder}/${Date.now()}.mp3`
  return putAudioObject(env, key, bytes, 'audio/mpeg')
}

export async function extractAudioBlockedReport(
  sql: Sql,
  env: AudioStoreEnv,
  reason: string,
): Promise<AudioExtractReport> {
  const missing = await songsMissingAudio(sql)
  return {
    extractorAvailable: false,
    r2Configured: Boolean(env.AUDIO_BUCKET),
    storeReady: audioStoreReady(env),
    dryRun: true,
    missingAudio: missing.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    results: [],
    blocked: true,
    note: reason,
  }
}

export async function runYoutubeAudioExtract(
  sql: Sql,
  env: AudioStoreEnv,
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<AudioExtractReport> {
  const limit = Math.max(1, Math.min(50, Math.round(options.limit ?? 10)))
  const dryRun = options.dryRun === true
  const missing = await songsMissingAudio(sql)
  const storeReady = audioStoreReady(env)
  const hasYt = await ytDlpAvailable()

  if (!hasYt) {
    return {
      ...(await extractAudioBlockedReport(
        sql,
        env,
        'No hay yt-dlp en este entorno. Instálalo y corre `npm run media:extract-audio`, o usa la subida MP3 del editor.',
      )),
      missingAudio: missing.length,
      storeReady,
    }
  }
  if (!storeReady) {
    return {
      extractorAvailable: true,
      r2Configured: false,
      storeReady: false,
      dryRun,
      missingAudio: missing.length,
      updated: 0,
      skipped: 0,
      errors: 0,
      results: [],
      blocked: true,
      note: 'Sin almacén de audio (R2 AUDIO_BUCKET o data/audio local). No se puede guardar el MP3.',
    }
  }

  const batch = missing.slice(0, limit)
  const results: AudioExtractResult[] = []
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const song of batch) {
    const youtubeUrl = youtubeUrlFromChart(song.source_text) || youtubeUrlFromChart(song.catalog_source)
    if (!youtubeUrl) {
      skipped += 1
      results.push({ id: song.id, title: song.title, status: 'skipped', reason: 'Sin URL de YouTube en el chart.' })
      continue
    }
    if (dryRun) {
      updated += 1
      results.push({
        id: song.id,
        title: song.title,
        status: 'updated',
        reason: 'dry-run',
        youtubeUrl,
      })
      continue
    }
    try {
      const bytes = await downloadYoutubeMp3(youtubeUrl)
      const key = `songs/${audioFolder(song.id)}/${Date.now()}.mp3`
      const stored = await putAudioObject(env, key, bytes, 'audio/mpeg')
      await writeSongAudio(sql, song, stored.audioUrl)
      updated += 1
      results.push({
        id: song.id,
        title: song.title,
        status: 'updated',
        audioUrl: stored.audioUrl,
        youtubeUrl,
      })
    } catch (error) {
      errors += 1
      results.push({
        id: song.id,
        title: song.title,
        status: 'error',
        reason: error instanceof Error ? error.message : 'Error al extraer',
        youtubeUrl,
      })
    }
  }

  return {
    extractorAvailable: true,
    r2Configured: Boolean(env.AUDIO_BUCKET),
    storeReady: true,
    dryRun,
    missingAudio: missing.length,
    updated,
    skipped,
    errors,
    results,
    note:
      missing.length > batch.length
        ? `Procesadas ${batch.length} de ${missing.length}; vuelve a correr para el resto.`
        : undefined,
  }
}

async function downloadYoutubeMp3(url: string): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), 'songbook-yt-'))
  const outTemplate = path.join(dir, 'audio.%(ext)s')
  const { bin, prefix } = ytDlpCmd()
  try {
    await execFileAsync(
      bin,
      [
        ...prefix,
        '--no-playlist',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '-o',
        outTemplate,
        '--',
        url,
      ],
      { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    )
    const file = path.join(dir, 'audio.mp3')
    const bytes = await readFile(file)
    if (!bytes.byteLength) throw new Error('yt-dlp no produjo audio.')
    return new Uint8Array(bytes)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function writeSongAudio(sql: Sql, song: SongRow, audioUrl: string): Promise<void> {
  const patch = {
    audioUrl,
    bpm: song.bpm != null ? Number(song.bpm) : null,
    durationMs: song.duration_ms != null ? Number(song.duration_ms) : null,
  }
  const parts = await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM instrument_parts WHERE song_id = ?`,
    [song.id],
  )
  if (!parts.length) throw new Error('Sin instrument_parts.')
  const now = new Date().toISOString()
  let guitarText = song.source_text
  await sql.transaction(async (tx) => {
    for (const part of parts) {
      const nextText = applyChartMedia(part.source_text, patch)
      if (part.instrument === 'guitar') guitarText = nextText
      await tx.run(`UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ?`, [
        nextText,
        song.id,
        part.instrument,
      ])
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
        meta.audioUrl || audioUrl,
        catalogSource,
        now,
        song.id,
      ],
    )
  })
}
