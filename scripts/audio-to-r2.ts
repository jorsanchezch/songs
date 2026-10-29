/**
 * Sends the MP3s in data/audio to the production R2 bucket and points each song's
 * audio_url at them (column and chart text, every instrument).
 * The bytes only ever go to R2, never to D1.
 *
 *   npx tsx scripts/audio-to-r2.ts            plan only
 *   npx tsx scripts/audio-to-r2.ts --apply    upload and update production
 *
 * Every update checks the revision it read, and a song that already has audio is skipped.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyChartMedia } from '../server/chartMedia.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apply = process.argv.includes('--apply')
const BUCKET = 'songbook-audio'

type LocalSong = { id: string; audio_url: string }
type RemoteSong = { id: string; audio_url: string; revision: number }
type RemotePart = { song_id: string; instrument: string; source_text: string; revision: number }

function wrangler(args: string[]): string {
  const result = spawnSync('npx', ['wrangler', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'wrangler falló')
  return result.stdout
}

function d1Rows<T>(command: string): T[] {
  const out = wrangler(['d1', 'execute', 'songbook', '--remote', '--json', '--command', command])
  return (JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[])[0]?.results ?? []
}

const quote = (value: string | number) => (typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`)
const nfc = (value: string) => value.normalize('NFC')

const local = openSqlite(path.join(root, 'data', 'songbook.sqlite'))
const mine = await local.all<LocalSong>(`SELECT id, audio_url FROM songs WHERE TRIM(COALESCE(audio_url, '')) <> ''`)
const remote = d1Rows<RemoteSong>(`SELECT id, audio_url, revision FROM songs`)
const parts = d1Rows<RemotePart>(`SELECT song_id, instrument, source_text, revision FROM instrument_parts`)

const lines: string[] = []
const uploads: { key: string; file: string }[] = []
const skipped: string[] = []
for (const song of mine) {
  const target = remote.find((row) => nfc(row.id) === nfc(song.id))
  if (!target) {
    skipped.push(`${song.id}: no está en producción`)
    continue
  }
  if (target.audio_url?.trim()) {
    skipped.push(`${song.id}: ya tiene audio`)
    continue
  }
  const key = decodeURIComponent(song.audio_url.replace(/^\/api\/audio\//, ''))
  const file = path.join(root, 'data', 'audio', key)
  if (!existsSync(file)) {
    skipped.push(`${song.id}: falta ${file}`)
    continue
  }
  uploads.push({ key, file })
  for (const part of parts.filter((item) => item.song_id === target.id)) {
    lines.push(
      `UPDATE instrument_parts SET source_text = ${quote(applyChartMedia(part.source_text, { audioUrl: song.audio_url }))}, revision = revision + 1 WHERE song_id = ${quote(target.id)} AND instrument = ${quote(part.instrument)} AND revision = ${part.revision};`,
    )
  }
  lines.push(
    `UPDATE songs SET audio_url = ${quote(song.audio_url)}, updated_at = ${quote(new Date().toISOString())}, revision = revision + 1 WHERE id = ${quote(target.id)} AND revision = ${target.revision};`,
  )
}

console.log(`${uploads.length} canciones por subir; ${skipped.length} omitidas`)
for (const line of skipped) console.log(`  omitida ${line}`)
if (!apply) process.exit(0)

for (const upload of uploads) {
  wrangler(['r2', 'object', 'put', `${BUCKET}/${upload.key}`, `--file=${upload.file}`, '--content-type=audio/mpeg', '--remote'])
  console.log(`subido ${upload.key}`)
}
const sqlFile = path.join(root, 'data', 'audio-to-r2.sql')
writeFileSync(sqlFile, `${lines.join('\n')}\n`)
wrangler(['d1', 'execute', 'songbook', '--remote', `--file=${sqlFile}`, '--yes'])
const after = d1Rows<{ n: number }>(`SELECT COUNT(*) AS n FROM songs WHERE TRIM(COALESCE(audio_url, '')) <> ''`)
console.log(`Producción: ${after[0]?.n ?? 0} canciones con audio.`)
