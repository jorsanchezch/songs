/**
 * Local / CI helper for POST /api/admin/media-backfill against sqlite.
 * Production: use the Admin panel against the Worker (secret YOUTUBE_API_KEY).
 *
 *   YOUTUBE_API_KEY=… npx tsx scripts/media-backfill.ts [--dry-run] [--limit=20]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from '../server/app.ts'
import { readCatalogFiles } from '../server/catalog.ts'
import { seedCatalog } from '../server/seed.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 20

const file = process.env.SONGBOOK_SQLITE?.trim() || path.join(root, 'data', 'songbook.sqlite')
const sql = openSqlite(file)
const files = await readCatalogFiles(root)
await seedCatalog(sql, files)

const session = await handleApi(
  sql,
  new Request('http://songbook.local/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Jorge Sanchez' }),
  }),
)
const sessionJson = (await session.json()) as { token?: string; error?: string }
if (!sessionJson.token) {
  console.error(sessionJson.error ?? 'No pude entrar como Jorge Sanchez')
  process.exit(1)
}

const response = await handleApi(
  sql,
  new Request('http://songbook.local/api/admin/media-backfill', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionJson.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit, dryRun }),
  }),
  {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    AUDIO_BUCKET: process.env.SONGBOOK_AUDIO_BUCKET ? { configured: true } : undefined,
    AUDIO_DIR: process.env.SONGBOOK_AUDIO_DIR,
  },
)
const report = await response.json()
console.log(JSON.stringify(report, null, 2))
if (!response.ok) process.exit(1)
