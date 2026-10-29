/**
 * Copies YouTube, BPM, and length from the catalog chart files into an existing database
 * without touching the rest of each chart, so per-instrument edits survive.
 * Seeding only inserts new songs, so media added to the files later needs this.
 *
 *   npx tsx scripts/media-sync.ts [--dry-run]     local sqlite
 *   npx tsx scripts/media-sync.ts --d1            writes data/media-sync-d1.sql for review
 *   npx tsx scripts/media-sync.ts --d1 --apply    also runs it on the remote D1
 *
 * Every write checks the revision it read, so an edit made in between is never overwritten.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCatalogFiles, type CatalogFile } from '../server/catalog.ts'
import { applyChartMedia, chartHasYoutube } from '../server/chartMedia.ts'
import { chartMeta } from '../server/meta.ts'
import { ensureSchema } from '../server/seed.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const d1 = process.argv.includes('--d1') || process.env.SONGBOOK_DB === 'd1'
const dryRun = process.argv.includes('--dry-run')
const apply = process.argv.includes('--apply')

type SongRow = { id: string; catalog_source: string; bpm: number | null; duration_ms: number | null; revision: number }
type PartRow = { song_id: string; instrument: string; source_text: string; revision: number }
type Update = {
  id: string
  revision: number
  bpm: number | null
  durationMs: number | null
  catalogSource: string
  parts: { instrument: string; next: string; revision: number }[]
}

const SONGS = `SELECT id, catalog_source, bpm, duration_ms, revision FROM songs WHERE origin = 'catalog'`
const PARTS = `SELECT p.song_id, p.instrument, p.source_text, p.revision FROM instrument_parts p JOIN songs s ON s.id = p.song_id WHERE s.origin = 'catalog'`
const YOUTUBE = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/

/** The file's YouTube entry for playback: the one labelled YouTube, else the first YouTube link. */
function fileYoutube(text: string): string | null {
  const labelled = text.split('\n').find((line) => /\|\s*youtube\s*\}?\s*$/i.test(line) && YOUTUBE.test(line))
  return (labelled ?? text).match(YOUTUBE)?.[0] ?? null
}

<<<<<<< HEAD
function plan(charts: CatalogFile[], songs: SongRow[], parts: PartRow[]): Update[] {
  const updates: Update[] = []
  for (const chart of charts) {
    // File names and stored ids may spell accents differently (é as one or two code points).
    const song = songs.find((row) => row.id.normalize('NFC') === chart.id.normalize('NFC'))
    if (!song) continue
    const meta = chartMeta(chart.sourceText, chart.id)
    const youtubeUrl = fileYoutube(chart.sourceText)
    const patch = (text: string) =>
      applyChartMedia(text, {
        bpm: meta.bpm ?? undefined,
        durationMs: meta.durationMs ?? undefined,
        // A chart that already links a video keeps it, as the backfill does.
        youtubeUrl: youtubeUrl && !chartHasYoutube(text) ? youtubeUrl : undefined,
      })
    const changed = parts
      .filter((part) => part.song_id === song.id)
      .map((part) => ({ instrument: part.instrument, next: patch(part.source_text), revision: Number(part.revision), old: part.source_text }))
      .filter((part) => part.next !== part.old)
      .map(({ old: _old, ...part }) => part)
    const catalogSource = patch(song.catalog_source)
    // A file without a value never clears one set in the app.
    const bpm = meta.bpm ?? song.bpm
    const durationMs = meta.durationMs ?? song.duration_ms
    const columnsMatch = song.bpm === bpm && song.duration_ms === durationMs
    if (!changed.length && catalogSource === song.catalog_source && columnsMatch) continue
    updates.push({ id: song.id, revision: Number(song.revision), bpm, durationMs, catalogSource, parts: changed })
  }
  return updates
}

function report(updates: Update[], verb: string) {
  for (const item of updates) console.log(`${verb} ${item.id} (${item.parts.length} parts)`)
  console.log(`${updates.length} songs ${verb}`)
}

type Statement = { sql: string; params: (string | number | null)[] }

function statements(updates: Update[], now: string): Statement[] {
  return updates.flatMap((item) => [
    ...item.parts.map((part) => ({
      sql: `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ? AND revision = ?`,
      params: [part.next, item.id, part.instrument, part.revision],
    })),
    {
      sql: `UPDATE songs SET bpm = ?, duration_ms = ?, catalog_source = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`,
      params: [item.bpm, item.durationMs, item.catalogSource, now, item.id, item.revision],
    },
  ])
}

const quote = (value: string | number | null) =>
  value == null ? 'NULL' : typeof value === 'number' ? String(Math.round(value)) : `'${value.replace(/'/g, "''")}'`

/** The same statements with values inlined, for `wrangler d1 execute --file`. */
function toSql(list: Statement[]): string {
  return list
    .map(({ sql, params }) => {
      let index = 0
      return `${sql.replace(/\?/g, () => quote(params[index++] ?? null))};`
    })
    .join('\n')
}

function wrangler(args: string[]): string {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'songbook', '--remote', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'wrangler falló')
  return result.stdout
}

function d1Rows<T>(command: string): T[] {
  const out = wrangler(['--json', '--command', command])
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[]
  return parsed[0]?.results ?? []
}

const charts = await readCatalogFiles(root)
const now = new Date().toISOString()

if (d1) {
  const updates = plan(charts, d1Rows<SongRow>(SONGS), d1Rows<PartRow>(PARTS))
  const file = path.join(root, 'data', 'media-sync-d1.sql')
  writeFileSync(file, `${toSql(statements(updates, now))}\n`)
  report(updates, apply ? 'updating' : 'to update')
  console.log(`SQL: ${file}`)
  if (apply && updates.length) {
    wrangler([`--file=${file}`, '--yes'])
    const left = plan(charts, d1Rows<SongRow>(SONGS), d1Rows<PartRow>(PARTS))
    console.log(left.length ? `${left.length} songs changed meanwhile; run again.` : 'D1 matches the chart files.')
  }
} else {
  const sql = openSqlite(process.env.SONGBOOK_SQLITE?.trim() || path.join(root, 'data', 'songbook.sqlite'))
  await ensureSchema(sql)
  const updates = plan(charts, await sql.all<SongRow>(SONGS), await sql.all<PartRow>(PARTS))
  report(updates, dryRun ? 'to update' : 'updated')
  if (!dryRun) {
    await sql.transaction(async (tx) => {
      for (const { sql: text, params } of statements(updates, now)) await tx.run(text, params)
    })
  }
=======
let changed = 0
for (const chart of await readCatalogFiles(root)) {
  const song = await sql.get<{ id: string; catalog_source: string; bpm: number | null; duration_ms: number | null }>(
    `SELECT id, catalog_source, bpm, duration_ms FROM songs WHERE id = ? AND origin = 'catalog'`,
    [chart.id],
  )
  if (!song) continue
  const meta = chartMeta(chart.sourceText, chart.id)
  const youtubeUrl = fileYoutube(chart.sourceText)
  const patch = (text: string) =>
    applyChartMedia(text, {
      bpm: meta.bpm ?? undefined,
      durationMs: meta.durationMs ?? undefined,
      // A chart that already links a video keeps it, as the backfill does.
      addYoutubeUrl: youtubeUrl && !chartHasYoutube(text) ? youtubeUrl : undefined,
    })
  const parts = await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM instrument_parts WHERE song_id = ?`,
    [song.id],
  )
  const updates = parts
    .map((part) => ({ ...part, next: patch(part.source_text) }))
    .filter((part) => part.next !== part.source_text)
  const catalogSource = patch(song.catalog_source)
  const columnsMatch = song.bpm === meta.bpm && song.duration_ms === meta.durationMs
  if (!updates.length && catalogSource === song.catalog_source && columnsMatch) continue
  changed += 1
  console.log(`${dryRun ? 'would update' : 'updated'} ${song.id} (${updates.length} parts)`)
  if (dryRun) continue
  await sql.transaction(async (tx) => {
    for (const part of updates) {
      await tx.run(
        `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ?`,
        [part.next, song.id, part.instrument],
      )
    }
    await tx.run(
      `UPDATE songs SET bpm = ?, duration_ms = ?, catalog_source = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [meta.bpm, meta.durationMs, catalogSource, new Date().toISOString(), song.id],
    )
  })
>>>>>>> 2bb9188 (Allow several YouTube links per song with one principal.)
}
