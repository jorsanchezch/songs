import { INSTRUMENTS } from './instruments.ts'
import { chartMeta } from './meta.ts'
import { OWNER_ID, OWNER_NAME, SCHEMA } from './schema.ts'
import type { CatalogFile } from './catalog.ts'
import type { Sql, SqlValue } from './sql.ts'

const SERVICE_LISTS = [
  { id: 'servicio-3', weekday: 3, name: 'Servicio del próximo miércoles' },
  { id: 'servicio-6', weekday: 6, name: 'Servicio del próximo sábado' },
  { id: 'servicio-0', weekday: 0, name: 'Servicio del próximo domingo' },
]

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql.exec(SCHEMA)
  await addColumn(sql, `ALTER TABLE songs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`)
  await addColumn(sql, `ALTER TABLE instrument_parts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`)
  await sql.run(
    `INSERT OR IGNORE INTO users (id, name, role) VALUES (?, ?, 'owner')`,
    [OWNER_ID, OWNER_NAME],
  )
}

async function addColumn(sql: Sql, statement: string): Promise<void> {
  try {
    await sql.run(statement)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column/i.test(message)) return
    throw error
  }
}

export async function seedCatalog(sql: Sql, files: CatalogFile[]): Promise<number> {
  await ensureSchema(sql)
  const now = new Date().toISOString()
  let added = 0
  for (const file of files) {
    const meta = chartMeta(file.sourceText, file.id)
    const inserted = await insertIgnore(sql, `INSERT OR IGNORE INTO songs (
      id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
      owner_id, shared, hidden, catalog_source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'catalog', NULL, ?, 0, 0, ?, ?, ?)`, [
      file.id,
      meta.title,
      meta.artist,
      meta.composer,
      meta.key,
      meta.source,
      meta.lyrics,
      OWNER_ID,
      file.sourceText,
      now,
      now,
    ])
    if (inserted) added += 1
    for (const instrument of INSTRUMENTS) {
      await sql.run(
        `INSERT OR IGNORE INTO instrument_parts (song_id, instrument, source_text) VALUES (?, ?, ?)`,
        [file.id, instrument, file.sourceText],
      )
    }
  }
  await seedServices(sql)
  return added
}

async function seedServices(sql: Sql): Promise<void> {
  const flag = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'services_seeded'`)
  if (flag) return
  let position = 0
  for (const list of SERVICE_LISTS) {
    await sql.run(`INSERT OR IGNORE INTO service_days (weekday) VALUES (?)`, [list.weekday])
    await sql.run(
      `INSERT OR IGNORE INTO setlists (id, name, evergreen_weekday, service_date, position) VALUES (?, ?, ?, NULL, ?)`,
      [list.id, list.name, list.weekday, position],
    )
    position += 1
  }
  await sql.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('services_seeded', '1')`)
}

async function insertIgnore(sql: Sql, statement: string, params: SqlValue[]): Promise<boolean> {
  const before = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs`)
  await sql.run(statement, params)
  const after = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs`)
  return (after?.n ?? 0) > (before?.n ?? 0)
}

export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function renderSeedSql(files: CatalogFile[]): string {
  const now = new Date().toISOString()
  const lines = [SCHEMA.trim(), '']
  lines.push(`INSERT OR IGNORE INTO users (id, name, role) VALUES (${quote(OWNER_ID)}, ${quote(OWNER_NAME)}, 'owner');`)
  for (const file of files) {
    const meta = chartMeta(file.sourceText, file.id)
    lines.push(`INSERT OR IGNORE INTO songs (
      id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
      owner_id, shared, hidden, catalog_source, created_at, updated_at
    ) VALUES (
      ${quote(file.id)}, ${quote(meta.title)}, ${quote(meta.artist)}, ${quote(meta.composer)},
      ${quote(meta.key)}, ${quote(meta.source)}, ${quote(meta.lyrics)}, 'catalog', NULL,
      ${quote(OWNER_ID)}, 0, 0, ${quote(file.sourceText)}, ${quote(now)}, ${quote(now)}
    );`)
    for (const instrument of INSTRUMENTS) {
      lines.push(
        `INSERT OR IGNORE INTO instrument_parts (song_id, instrument, source_text) VALUES (${quote(file.id)}, ${quote(instrument)}, ${quote(file.sourceText)});`,
      )
    }
  }
  SERVICE_LISTS.forEach((list, position) => {
    lines.push(`INSERT OR IGNORE INTO service_days (weekday) VALUES (${list.weekday});`)
    lines.push(
      `INSERT OR IGNORE INTO setlists (id, name, evergreen_weekday, service_date, position) VALUES (${quote(list.id)}, ${quote(list.name)}, ${list.weekday}, NULL, ${position});`,
    )
  })
  lines.push(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('services_seeded', '1');`)
  lines.push('')
  return lines.join('\n')
}
