/**
 * YouTube → MP3 for songs that have a YouTube source and no audio_url.
 * Requires Node + yt-dlp (+ ffmpeg). Writes to data/audio (sqlite) or uploads via
 * the same putAudioObject path the API uses. Never stores bytes in D1/SQLite rows.
 *
 *   npm run media:extract-audio [-- --dry-run] [-- --limit=10]
 *
 * Cloudflare Workers cannot run this. Admin → Extraer MP3 is blocked on the Worker
 * and points here.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localAudioBucket } from '../server/audioStorage.ts'
import { readCatalogFiles } from '../server/catalog.ts'
import { seedCatalog } from '../server/seed.ts'
import { openSqlite } from '../server/sqlite.ts'
import { runYoutubeAudioExtract } from '../server/youtubeExtract.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 10

const file = process.env.SONGBOOK_SQLITE?.trim() || path.join(root, 'data', 'songbook.sqlite')
const sql = openSqlite(file)
const files = await readCatalogFiles(root)
await seedCatalog(sql, files)

const report = await runYoutubeAudioExtract(
  sql,
  {
    AUDIO_BUCKET: localAudioBucket(root),
    AUDIO_DIR: path.join(root, 'data', 'audio'),
    ALLOW_YT_EXTRACT: true,
  },
  { limit, dryRun },
)

console.log(JSON.stringify(report, null, 2))
if (report.blocked || report.errors > 0) process.exit(report.blocked ? 2 : 1)
