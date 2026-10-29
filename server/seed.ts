import { INSTRUMENTS } from './instruments.ts'
import { chartMeta } from './meta.ts'
import { hashPassword } from './password.ts'
import { OWNER_ID, OWNER_NAME, OWNER_PASSWORD, OWNER_USERNAME, SCHEMA } from './schema.ts'
import type { CatalogFile } from './catalog.ts'
import type { Sql, SqlValue } from './sql.ts'

const SERVICE_LISTS = [
  { id: 'servicio-3', weekday: 3, name: 'Servicio del próximo miércoles' },
  { id: 'servicio-6', weekday: 6, name: 'Servicio del próximo sábado' },
  { id: 'servicio-0', weekday: 0, name: 'Servicio del próximo domingo' },
]

const PARTS_TABLE = `CREATE TABLE instrument_parts_next (
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL CHECK (instrument IN ('electric_guitar', 'guitar', 'bass', 'drums', 'piano')),
  source_text TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (song_id, instrument)
)`

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql.exec(SCHEMA)
  await addColumn(sql, `ALTER TABLE songs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`)
  await addColumn(sql, `ALTER TABLE instrument_parts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`)
  await addColumn(sql, `ALTER TABLE users ADD COLUMN password_hash TEXT`)
  await addColumn(sql, `ALTER TABLE users ADD COLUMN username TEXT`)
  await allowElectricGuitar(sql)
  await backfillElectricGuitar(sql)
  await ensureOwnerAccount(sql)
  await backfillUsernames(sql)
  try {
    await sql.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`)
  } catch {
    // Older rows may still collide briefly; create/update checks keep new usernames unique.
  }
}

async function ensureOwnerAccount(sql: Sql): Promise<void> {
  await sql.run(
    `INSERT OR IGNORE INTO users (id, name, username, role) VALUES (?, ?, ?, 'owner')`,
    [OWNER_ID, OWNER_NAME, OWNER_USERNAME],
  )
  await sql.run(`UPDATE users SET name = ?, username = ? WHERE id = ?`, [
    OWNER_NAME,
    OWNER_USERNAME,
    OWNER_ID,
  ])
  const row = await sql.get<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    [OWNER_ID],
  )
  if (!row?.password_hash) {
    await sql.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [
      await hashPassword(OWNER_PASSWORD),
      OWNER_ID,
    ])
  }
}

async function backfillUsernames(sql: Sql): Promise<void> {
  const missing = await sql.all<{ id: string }>(
    `SELECT id FROM users WHERE username IS NULL OR TRIM(username) = ''`,
  )
  for (const person of missing) {
    let username = person.id
    let n = 2
    while (
      await sql.get(
        `SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?`,
        [username, person.id],
      )
    ) {
      username = `${person.id}-${n}`
      n += 1
    }
    await sql.run(`UPDATE users SET username = ? WHERE id = ?`, [username, person.id])
  }
}

async function allowElectricGuitar(sql: Sql): Promise<void> {
  const pending = await sql.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'instrument_parts_next'`,
  )
  if (pending) {
    const currentRows = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM instrument_parts`)
    const savedRows = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM instrument_parts_next`)
    if (Number(savedRows?.n ?? 0) > 0 && Number(currentRows?.n ?? 0) === 0) {
      await sql.exec(`DROP TABLE instrument_parts`)
      await sql.exec(`ALTER TABLE instrument_parts_next RENAME TO instrument_parts`)
    } else {
      await sql.exec(`DROP TABLE instrument_parts_next`)
    }
  }
  const row = await sql.get<{ definition: string }>(
    `SELECT sql AS definition FROM sqlite_master WHERE type = 'table' AND name = 'instrument_parts'`,
  )
  if (row?.definition?.includes('electric_guitar')) return
  await sql.transaction(async (tx) => {
    await tx.exec(PARTS_TABLE)
    await tx.exec(
      `INSERT INTO instrument_parts_next (song_id, instrument, source_text, revision)
       SELECT song_id, instrument, source_text, revision FROM instrument_parts`,
    )
    await tx.exec(`DROP TABLE instrument_parts`)
    await tx.exec(`ALTER TABLE instrument_parts_next RENAME TO instrument_parts`)
  })
}

async function backfillElectricGuitar(sql: Sql): Promise<void> {
  await sql.run(
    `INSERT INTO instrument_parts (song_id, instrument, source_text, revision)
     SELECT s.id, 'electric_guitar',
       COALESCE(
         (SELECT g.source_text FROM instrument_parts g WHERE g.song_id = s.id AND g.instrument = 'guitar'),
         s.catalog_source,
         ''
       ),
       1
     FROM songs s
     WHERE NOT EXISTS (
       SELECT 1 FROM instrument_parts e
       WHERE e.song_id = s.id AND e.instrument = 'electric_guitar'
     )`,
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
    const removed = await sql.get(`SELECT id FROM deleted_songs WHERE id = ?`, [file.id])
    if (removed) continue
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
  lines.push(
    `INSERT OR IGNORE INTO users (id, name, username, role) VALUES (${quote(OWNER_ID)}, ${quote(OWNER_NAME)}, ${quote(OWNER_USERNAME)}, 'owner');`,
  )
  for (const file of files) {
    const meta = chartMeta(file.sourceText, file.id)
    lines.push(`INSERT OR IGNORE INTO songs (
      id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
      owner_id, shared, hidden, catalog_source, created_at, updated_at
    ) SELECT
      ${quote(file.id)}, ${quote(meta.title)}, ${quote(meta.artist)}, ${quote(meta.composer)},
      ${quote(meta.key)}, ${quote(meta.source)}, ${quote(meta.lyrics)}, 'catalog', NULL,
      ${quote(OWNER_ID)}, 0, 0, ${quote(file.sourceText)}, ${quote(now)}, ${quote(now)}
    WHERE NOT EXISTS (SELECT 1 FROM deleted_songs WHERE id = ${quote(file.id)});`)
    for (const instrument of INSTRUMENTS) {
      lines.push(
        `INSERT OR IGNORE INTO instrument_parts (song_id, instrument, source_text) SELECT ${quote(file.id)}, ${quote(instrument)}, ${quote(file.sourceText)} WHERE NOT EXISTS (SELECT 1 FROM deleted_songs WHERE id = ${quote(file.id)});`,
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
