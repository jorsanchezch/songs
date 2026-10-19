import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stamp = new Date().toISOString().slice(0, 10)
const dir = path.join(root, 'data')
mkdirSync(dir, { recursive: true })
const out = path.join(dir, `songbook-backup-${stamp}.sql`)

if (process.env.SONGBOOK_DB === 'd1') {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'export', 'songbook', '--remote', `--output=${out}`],
    { cwd: root, stdio: 'inherit' },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`Exporté D1 en ${out}`)
} else {
  const file = path.join(dir, 'songbook.sqlite')
  let db: DatabaseSync
  try {
    db = new DatabaseSync(file, { readOnly: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No pude abrir la base'
    console.error(`No está data/songbook.sqlite. Arranca la app una vez y vuelve a intentar. ${message}`)
    process.exit(1)
  }
  const tables = [
    'users',
    'songs',
    'instrument_parts',
    'song_shares',
    'sessions',
    'service_days',
    'setlists',
    'setlist_items',
    'app_meta',
    'user_prefs',
  ]
  const lines = ['PRAGMA foreign_keys = OFF;', 'BEGIN;']
  for (const table of tables) {
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as
      | { name: string }
      | undefined
    if (!exists) continue
    const create = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as {
      sql: string
    }
    lines.push(`${create.sql};`)
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    const names = columns.map((column) => column.name)
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    for (const row of rows) {
      const values = names.map((name) => quote(row[name]))
      lines.push(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${values.join(', ')});`)
    }
  }
  lines.push('COMMIT;', '')
  writeFileSync(out, lines.join('\n'))
  db.close()
  console.log(`Exporté SQLite en ${out}`)
}

function quote(value: unknown): string {
  if (value == null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  return `'${String(value).replaceAll("'", "''")}'`
}
