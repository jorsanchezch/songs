/**
 * Copies YouTube, BPM, and length from the catalog chart files into an existing sqlite
 * database without touching the rest of each chart, so per-instrument edits survive.
 * Seeding only inserts new songs, so media added to the files later needs this.
 *
 *   npx tsx scripts/media-sync.ts [--dry-run]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCatalogFiles } from '../server/catalog.ts'
import { applyChartMedia, chartHasYoutube } from '../server/chartMedia.ts'
import { chartMeta } from '../server/meta.ts'
import { ensureSchema } from '../server/seed.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const file = process.env.SONGBOOK_SQLITE?.trim() || path.join(root, 'data', 'songbook.sqlite')
const sql = openSqlite(file)
await ensureSchema(sql)

const YOUTUBE = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/

/** The file's YouTube entry for playback: the one labelled YouTube, else the first YouTube link. */
function fileYoutube(text: string): string | null {
  const labelled = text.split('\n').find((line) => /\|\s*youtube\s*\}?\s*$/i.test(line) && YOUTUBE.test(line))
  return (labelled ?? text).match(YOUTUBE)?.[0] ?? null
}

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
      youtubeUrl: youtubeUrl && !chartHasYoutube(text) ? youtubeUrl : undefined,
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
}
console.log(`${changed} songs ${dryRun ? 'to update' : 'updated'}`)
