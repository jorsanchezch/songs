import { findPublicChart } from './chartSearch.ts'
import { DEFAULT_INSTRUMENT, INSTRUMENTS, isInstrument, type InstrumentId } from './instruments.ts'
import { shareLyrics } from './lyrics.ts'
import { chartMeta } from './meta.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { OWNER_ID } from './schema.ts'
import type { Sql } from './sql.ts'

type Role = 'owner' | 'admin' | 'viewer'
type Origin = 'catalog' | 'local' | 'copy'

type User = { id: string; name: string; role: Role; has_password: number }

type SongRecord = {
  id: string
  title: string
  artist: string
  composer: string
  key_name: string
  source: string
  origin: Origin
  catalog_id: string | null
  owner_id: string
  shared: number
  hidden: number
  catalog_source: string
  owner_name: string
  source_text: string
  share_ids: string | null
  diverged: number
  revision: number
  part_revision: number
}

const CONFLICT = 'Otra persona guardó esta canción. Recarga para no perder su cambio.'
const IMPORT_KEY = 'local_import'

class RevisionConflict extends Error {
  constructor() {
    super(CONFLICT)
  }
}

const ID_OK = /^[A-Za-z0-9_-]{1,80}$/

export async function handleApi(sql: Sql, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  try {
    if (pathname === '/api/session' && request.method === 'POST') return sessionCreate(sql, request)
    const user = await userFrom(sql, request)
    if (!user) return json({ error: 'Entra con tu nombre para usar Songbook.' }, 401)
    if (pathname === '/api/session' && request.method === 'GET') return json({ user: publicUser(user) })
    if (pathname === '/api/session' && request.method === 'DELETE') return sessionDelete(sql, request)
    if (pathname === '/api/users' && request.method === 'GET') return listUsers(sql)
    if (pathname === '/api/search-charts' && request.method === 'GET') return searchCharts(url)
    if (pathname === '/api/songs' && request.method === 'GET') return listSongs(sql, user, url)
    if (pathname === '/api/songs' && request.method === 'POST') return createSong(sql, user, request)
    if (pathname === '/api/catalog' && request.method === 'POST') return upsertCatalog(sql, user, request)
    if (pathname === '/api/songs/reveal' && request.method === 'POST') return revealSongs(sql, user)
    if (pathname === '/api/setlists' && request.method === 'GET') return listSetlists(sql)
    if (pathname === '/api/setlists' && request.method === 'PUT') return saveSetlists(sql, user, request)
    if (pathname === '/api/import-local' && request.method === 'POST') return importLocal(sql, user, request)
    if (pathname === '/api/prefs' && request.method === 'GET') return getPrefs(sql, user)
    if (pathname === '/api/prefs' && request.method === 'PUT') return putPrefs(sql, user, request)
    if (pathname === '/api/profile/password' && request.method === 'PUT') return setOwnPassword(sql, user, request)
    if (pathname === '/api/admin' && request.method === 'GET') return adminOverview(sql, user)
    if (pathname === '/api/admin/users' && request.method === 'POST') return adminCreateUser(sql, user, request)
    const adminUserPath = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (adminUserPath) {
      const id = decodeURIComponent(adminUserPath[1] ?? '')
      if (request.method === 'PUT') return adminUpdateUser(sql, user, id, request)
      if (request.method === 'DELETE') return adminRemoveUser(sql, user, id)
    }
    const songPath = pathname.match(/^\/api\/songs\/([^/]+)(?:\/(copy|share|restore))?$/)
    if (songPath) {
      const id = decodeURIComponent(songPath[1] ?? '')
      const action = songPath[2]
      if (request.method === 'GET' && !action) return getSong(sql, user, id, url)
      if (request.method === 'PUT' && !action) return updateSong(sql, user, id, request)
      if (request.method === 'DELETE' && !action) return removeSong(sql, user, id)
      if (request.method === 'POST' && action === 'copy') return copySong(sql, user, id)
      if (request.method === 'POST' && action === 'share') return shareSong(sql, user, id, request)
      if (request.method === 'POST' && action === 'restore') return restoreSong(sql, user, id)
    }
    return json({ error: 'No está esa ruta.' }, 404)
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof RevisionConflict) return json({ error: error.message }, 409)
    const message = error instanceof Error ? error.message : 'Error del servidor'
    return json({ error: message }, 500)
  }
}

async function sessionCreate(sql: Sql, request: Request): Promise<Response> {
  const body = await readJson<{ name?: string; password?: string }>(request)
  const name = body.name?.trim() ?? ''
  if (!name || name.length > 80) return json({ error: 'Escribe un nombre.' }, 400)
  const row = await sql.get<{ id: string; name: string; role: Role; password_hash: string | null }>(
    `SELECT id, name, role, password_hash FROM users WHERE name = ? COLLATE NOCASE`,
    [name],
  )
  let user: { id: string; name: string; role: Role; has_password: number }
  if (!row) {
    const id = await freshUserId(sql, name)
    // A new name stays without a password until that person sets one.
    await sql.run(`INSERT INTO users (id, name, role) VALUES (?, ?, 'viewer')`, [id, name])
    user = { id, name, role: 'viewer', has_password: 0 }
  } else {
    if (row.password_hash) {
      const password = typeof body.password === 'string' ? body.password.trim() : ''
      if (!password) return json({ error: 'Esta cuenta tiene contraseña. Escríbela para entrar.' }, 401)
      if (!(await verifyPassword(password, row.password_hash))) {
        return json({ error: 'La contraseña no es correcta.' }, 401)
      }
    }
    user = { id: row.id, name: row.name, role: row.role, has_password: row.password_hash ? 1 : 0 }
  }
  const token = crypto.randomUUID()
  await sql.run(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`, [
    token,
    user.id,
    new Date().toISOString(),
  ])
  return json({ token, user: publicUser(user) })
}

async function sessionDelete(sql: Sql, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token) await sql.run(`DELETE FROM sessions WHERE token = ?`, [token])
  return json({ ok: true })
}

async function listUsers(sql: Sql): Promise<Response> {
  const users = await sql.all<User>(`${userColumns()} ORDER BY name COLLATE NOCASE`)
  return json({ users: users.map(publicUser) })
}

async function listSongs(sql: Sql, user: User, url: URL): Promise<Response> {
  const instrument = instrumentFrom(url)
  const total = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs`)
  const hidden = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM songs WHERE hidden = 1 AND origin = 'catalog'`,
  )
  const copies = await copyCatalogIds(sql, user.id)
  const rows = await sql.all<SongRecord>(songSelect(`WHERE s.hidden = 0`), [instrument])
  const songs = rows
    .filter((row) => canSee(user, row))
    .map((row) => toDto(user, row, instrument, copies.has(row.id)))
  return json({
    songs,
    hiddenCount: isStaff(user) ? (hidden?.n ?? 0) : 0,
    needsSeed: (total?.n ?? 0) === 0,
    instrument,
  })
}

async function getSong(sql: Sql, user: User, id: string, url: URL): Promise<Response> {
  const instrument = instrumentFrom(url)
  const row = await oneSong(sql, id, instrument)
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  const copies = await copyCatalogIds(sql, user.id)
  return json({ song: toDto(user, row, instrument, copies.has(row.id)) })
}

async function createSong(sql: Sql, user: User, request: Request): Promise<Response> {
  const body = await readJson<{ sourceText?: string; id?: string }>(request)
  const sourceText = body.sourceText ?? ''
  if (!sourceText.trim()) return json({ error: 'La canción está vacía.' }, 400)
  const id = body.id?.trim() || `local-${user.id}-${Date.now()}`
  if (!ID_OK.test(id)) return json({ error: 'Ese identificador no sirve.' }, 400)
  const exists = await sql.get(`SELECT id FROM songs WHERE id = ?`, [id])
  if (exists) return json({ error: 'Ya existe una canción con ese id.' }, 409)
  const meta = chartMeta(sourceText, id)
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO songs (
        id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
        owner_id, shared, hidden, catalog_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'local', NULL, ?, 0, 0, ?, ?, ?)`,
      [id, meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics, user.id, sourceText, now, now],
    )
    for (const instrument of INSTRUMENTS) {
      await tx.run(
        `INSERT INTO instrument_parts (song_id, instrument, source_text) VALUES (?, ?, ?)`,
        [id, instrument, sourceText],
      )
    }
  })
  const row = await oneSong(sql, id, 'guitar')
  if (!row) return json({ error: 'No pude crear la canción.' }, 500)
  return json({ song: toDto(user, row, 'guitar', false) }, 201)
}

async function upsertCatalog(sql: Sql, user: User, request: Request): Promise<Response> {
  if (user.role !== 'owner') return json({ error: 'Solo el dueño actualiza el catálogo.' }, 403)
  const body = await readJson<{ songs?: { id?: string; sourceText?: string }[] }>(request)
  const songs = Array.isArray(body.songs) ? body.songs : []
  if (!songs.length) return json({ error: 'No hay canciones.' }, 400)
  const now = new Date().toISOString()
  const ids: string[] = []
  await sql.transaction(async (tx) => {
    for (const song of songs) {
      const sourceText = song.sourceText ?? ''
      const id = (song.id ?? '').trim()
      if (!usableId(id) || !sourceText.trim()) continue
      await writeCatalogChart(tx, user.id, id, sourceText, now)
      ids.push(id)
    }
  })
  return json({ ok: true, ids })
}

async function updateSong(sql: Sql, user: User, id: string, request: Request): Promise<Response> {
  const body = await readJson<{
    sourceText?: string
    instrument?: string
    allInstruments?: boolean
    revision?: number
    partRevision?: number
  }>(request)
  const sourceText = body.sourceText ?? ''
  if (!sourceText.trim()) return json({ error: 'La canción está vacía.' }, 400)
  const instrument = body.instrument && isInstrument(body.instrument) ? body.instrument : DEFAULT_INSTRUMENT
  const row = await oneSong(sql, id, instrument)
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (!canEdit(user, row)) {
    const message =
      row.origin === 'catalog'
        ? 'El catálogo solo lo cambia el dueño o un admin. Crea tu copia.'
        : 'Esta copia no es tuya.'
    return json({ error: message }, 403)
  }
  if (typeof body.revision !== 'number' || typeof body.partRevision !== 'number') {
    return json({ error: 'Falta la revisión de la canción.' }, 400)
  }
  if (body.revision !== Number(row.revision) || body.partRevision !== Number(row.part_revision)) {
    return json({ error: CONFLICT }, 409)
  }
  const writeAll = body.allInstruments === true
  const now = new Date().toISOString()
  const meta = chartMeta(sourceText, id)
  const key = meta.key || row.key_name
  await sql.transaction(async (tx) => {
    const parts = await tx.all<{ instrument: string; source_text: string; revision: number }>(
      `SELECT instrument, source_text, revision FROM instrument_parts WHERE song_id = ?`,
      [id],
    )
    const current = parts.find((part) => part.instrument === instrument)
    const songRow = await tx.get<{ revision: number }>(`SELECT revision FROM songs WHERE id = ?`, [id])
    if (!current || !songRow || Number(songRow.revision) !== body.revision || Number(current.revision) !== body.partRevision) {
      throw new RevisionConflict()
    }
    for (const part of parts) {
      if (part.instrument === instrument) continue
      const nextText = writeAll ? sourceText : shareLyrics(part.source_text, sourceText)
      if (!writeAll && nextText === part.source_text) continue
      const saved = await tx.run(
        `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ? AND revision = ?`,
        [nextText, id, part.instrument, Number(part.revision)],
      )
      if (saved.changes !== 1) throw new RevisionConflict()
    }
    const savedPart = await tx.run(
      `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ? AND revision = ?`,
      [sourceText, id, instrument, body.partRevision],
    )
    if (savedPart.changes !== 1) throw new RevisionConflict()
    const savedSong = await tx.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`,
      [meta.title, meta.artist, meta.composer, key, meta.source, meta.lyrics, now, id, body.revision],
    )
    if (savedSong.changes !== 1) throw new RevisionConflict()
  })
  const next = await oneSong(sql, id, instrument)
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  const copies = await copyCatalogIds(sql, user.id)
  return json({ song: toDto(user, next, instrument, copies.has(next.id)), parts: await partDump(sql, id) })
}

async function removeSong(sql: Sql, user: User, id: string): Promise<Response> {
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (!canRemove(user, row)) return json({ error: 'No puedes borrar esta canción.' }, 403)
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO deleted_songs (id, deleted_at) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id, now],
    )
    await tx.run(`DELETE FROM setlist_items WHERE song_id = ?`, [id])
    await tx.run(`DELETE FROM songs WHERE id = ?`, [id])
  })
  return json({ ok: true, hidden: false })
}

async function copySong(sql: Sql, user: User, id: string): Promise<Response> {
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  const copyId = `copy-${user.id}-${Date.now()}`
  const now = new Date().toISOString()
  const catalogId = row.catalog_id || row.id
  await sql.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO songs (
        id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
        owner_id, shared, hidden, catalog_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'copy', ?, ?, 0, 0, ?, ?, ?)`,
      [
        copyId,
        row.title,
        row.artist,
        row.composer,
        row.key_name,
        row.source,
        '',
        catalogId,
        user.id,
        row.catalog_source,
        now,
        now,
      ],
    )
    await tx.run(
      `INSERT INTO instrument_parts (song_id, instrument, source_text)
       SELECT ?, instrument, source_text FROM instrument_parts WHERE song_id = ?`,
      [copyId, id],
    )
  })
  const copy = await oneSong(sql, copyId, 'guitar')
  if (!copy) return json({ error: 'No pude crear la copia.' }, 500)
  return json({ song: toDto(user, copy, 'guitar', false) }, 201)
}

async function shareSong(sql: Sql, user: User, id: string, request: Request): Promise<Response> {
  const body = await readJson<{ shared?: boolean; userId?: string; include?: boolean }>(request)
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (row.origin === 'catalog') return json({ error: 'El catálogo ya es de todos y no se comparte como copia.' }, 400)
  if (row.owner_id !== user.id && !isStaff(user)) return json({ error: 'Solo quien tiene la copia puede compartirla.' }, 403)
  if (typeof body.shared === 'boolean') {
    await sql.run(`UPDATE songs SET shared = ?, updated_at = ? WHERE id = ?`, [
      body.shared ? 1 : 0,
      new Date().toISOString(),
      id,
    ])
  }
  if (body.userId) {
    if (body.userId === row.owner_id) return json({ error: 'La copia ya es de esa persona.' }, 400)
    const other = await sql.get(`SELECT id FROM users WHERE id = ?`, [body.userId])
    if (!other) return json({ error: 'No está esa persona.' }, 404)
    if (body.include === false) await sql.run(`DELETE FROM song_shares WHERE song_id = ? AND user_id = ?`, [id, body.userId])
    else await sql.run(`INSERT OR IGNORE INTO song_shares (song_id, user_id) VALUES (?, ?)`, [id, body.userId])
  }
  const next = await oneSong(sql, id, 'guitar')
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  const copies = await copyCatalogIds(sql, user.id)
  return json({ song: toDto(user, next, 'guitar', copies.has(next.id)) })
}

async function restoreSong(sql: Sql, user: User, id: string): Promise<Response> {
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (row.origin !== 'catalog' || !isStaff(user)) {
    return json({ error: 'Solo el dueño o un admin restaura el archivo del catálogo.' }, 403)
  }
  const meta = chartMeta(row.catalog_source, id)
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(`UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ?`, [
      row.catalog_source,
      id,
    ])
    await tx.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics, now, id],
    )
  })
  const next = await oneSong(sql, id, 'guitar')
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  const copies = await copyCatalogIds(sql, user.id)
  return json({ song: toDto(user, next, 'guitar', copies.has(next.id)) })
}

async function revealSongs(sql: Sql, user: User): Promise<Response> {
  if (!isStaff(user)) return json({ error: 'Solo el dueño o un admin muestra las ocultas.' }, 403)
  await sql.run(`UPDATE songs SET hidden = 0 WHERE hidden = 1`)
  return json({ ok: true })
}

type SetlistItem = { songId: string; semitones: number }
type SetlistBody = {
  id?: string
  name?: string
  items?: SetlistItem[]
  evergreen?: { weekday?: number; serviceDate?: string | null }
}
type HistoryBody = {
  weekday?: number
  serviceDate?: string | null
  items?: SetlistItem[]
}

async function listSetlists(sql: Sql): Promise<Response> {
  const days = await sql.all<{ weekday: number }>(`SELECT weekday FROM service_days ORDER BY weekday`)
  const lists = await sql.all<{
    id: string
    name: string
    evergreen_weekday: number | null
    service_date: string | null
  }>(`SELECT id, name, evergreen_weekday, service_date FROM setlists ORDER BY position`)
  const items = await sql.all<{ setlist_id: string; song_id: string; semitones: number; position: number }>(
    `SELECT setlist_id, song_id, semitones, position FROM setlist_items ORDER BY position`,
  )
  return json({
    days: days.map((day) => day.weekday),
    setlists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      items: items
        .filter((item) => item.setlist_id === list.id)
        .map((item) => ({ songId: item.song_id, semitones: item.semitones })),
      ...(list.evergreen_weekday == null
        ? {}
        : { evergreen: { weekday: list.evergreen_weekday, serviceDate: list.service_date } }),
    })),
    history: await readDayListHistory(sql),
  })
}

async function readDayListHistory(sql: Sql) {
  const rows = await sql.all<{ id: string; weekday: number; service_date: string }>(
    `SELECT id, weekday, service_date FROM day_list_history ORDER BY position`,
  )
  const items = await sql.all<{ history_id: string; song_id: string; semitones: number }>(
    `SELECT history_id, song_id, semitones FROM day_list_history_items ORDER BY position`,
  )
  return rows.map((row) => ({
    id: row.id,
    weekday: Number(row.weekday),
    serviceDate: row.service_date,
    items: items
      .filter((item) => item.history_id === row.id)
      .map((item) => ({ songId: item.song_id, semitones: item.semitones })),
  }))
}

async function saveSetlists(sql: Sql, user: User, request: Request): Promise<Response> {
  if (!isStaff(user)) return json({ error: 'Solo el dueño o un admin cambia las listas.' }, 403)
  const body = await readJson<{ days?: number[]; setlists?: SetlistBody[]; history?: HistoryBody[] }>(request)
  const days = normalizeDays(body.days)
  const lists = Array.isArray(body.setlists) ? body.setlists : []
  await sql.transaction(async (tx) => {
    await replaceSetlists(tx, days, lists)
    if (Array.isArray(body.history)) await replaceDayListHistory(tx, body.history)
  })
  return listSetlists(sql)
}

async function replaceDayListHistory(sql: Sql, history: HistoryBody[]): Promise<void> {
  await sql.run(`DELETE FROM day_list_history_items`)
  await sql.run(`DELETE FROM day_list_history`)
  const seen = new Set<string>()
  let position = 0
  for (const entry of history) {
    const weekday = entry?.weekday
    const serviceDate = entry?.serviceDate
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
    if (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) continue
    const id = `historial-${weekday}-${serviceDate}`
    if (seen.has(id)) continue
    const stored = (Array.isArray(entry.items) ? entry.items : []).flatMap((item) =>
      item && typeof item.songId === 'string' && item.songId
        ? [{ songId: item.songId, semitones: typeof item.semitones === 'number' ? item.semitones : 0 }]
        : [],
    )
    if (!stored.length) continue
    seen.add(id)
    await sql.run(
      `INSERT INTO day_list_history (id, weekday, service_date, position) VALUES (?, ?, ?, ?)`,
      [id, weekday, serviceDate, position],
    )
    position += 1
    for (let index = 0; index < stored.length; index += 1) {
      const item = stored[index]
      if (!item) continue
      await sql.run(
        `INSERT INTO day_list_history_items (history_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
        [id, index, item.songId, item.semitones],
      )
    }
  }
}

async function replaceSetlists(sql: Sql, days: number[], lists: SetlistBody[]): Promise<void> {
  await sql.run(`DELETE FROM setlist_items`)
  await sql.run(`DELETE FROM setlists`)
  await sql.run(`DELETE FROM service_days`)
  for (const day of days) await sql.run(`INSERT INTO service_days (weekday) VALUES (?)`, [day])
  for (let index = 0; index < lists.length; index += 1) {
    const list = lists[index]
    if (!list?.id || !list.name) continue
    const weekday = list.evergreen?.weekday
    const evergreen = typeof weekday === 'number' && weekday >= 0 && weekday <= 6
    await sql.run(
      `INSERT INTO setlists (id, name, evergreen_weekday, service_date, position) VALUES (?, ?, ?, ?, ?)`,
      [
        list.id,
        list.name,
        evergreen ? weekday : null,
        evergreen && typeof list.evergreen?.serviceDate === 'string' ? list.evergreen.serviceDate : null,
        index,
      ],
    )
    const items = Array.isArray(list.items) ? list.items : []
    for (let position = 0; position < items.length; position += 1) {
      const item = items[position]
      if (!item || typeof item.songId !== 'string') continue
      const semitones = typeof item.semitones === 'number' ? item.semitones : 0
      await sql.run(
        `INSERT INTO setlist_items (setlist_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
        [list.id, position, item.songId, semitones],
      )
    }
  }
}

type ImportBody = {
  overrides?: Record<string, string>
  hidden?: string[]
  created?: Record<string, string>
  hasLists?: boolean
  days?: number[]
  setlists?: SetlistBody[]
  semitones?: unknown
  chordShapes?: unknown
}

async function importLocal(sql: Sql, user: User, request: Request): Promise<Response> {
  if (user.role !== 'owner') return json({ error: 'Solo el dueño importa la biblioteca de este navegador.' }, 403)
  const done = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [IMPORT_KEY])
  if (done) return json({ ok: true, skipped: true })
  const body = await readJson<ImportBody>(request)
  const now = new Date().toISOString()
  let lists: 'imported' | 'kept' = 'kept'
  await sql.transaction(async (tx) => {
    const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {}
    for (const [id, sourceText] of Object.entries(overrides)) {
      if (!usableId(id) || typeof sourceText !== 'string' || !sourceText.trim()) continue
      await writeCatalogChart(tx, user.id, id, sourceText, now)
    }
    const created = body.created && typeof body.created === 'object' ? body.created : {}
    for (const [id, sourceText] of Object.entries(created)) {
      if (!usableId(id) || typeof sourceText !== 'string' || !sourceText.trim()) continue
      await writeCatalogChart(tx, user.id, id, sourceText, now)
    }
    const hidden = Array.isArray(body.hidden) ? body.hidden : []
    for (const id of hidden) {
      if (typeof id !== 'string' || !usableId(id)) continue
      await tx.run(
        `UPDATE songs SET hidden = 1, updated_at = ?, revision = revision + 1 WHERE id = ? AND origin = 'catalog'`,
        [now, id],
      )
    }
    if (body.hasLists && (await listsAreSeed(tx))) {
      await replaceSetlists(tx, normalizeDays(body.days), Array.isArray(body.setlists) ? body.setlists : [])
      lists = 'imported'
    }
    await tx.run(
      `INSERT INTO user_prefs (user_id, semitones, chord_shapes) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET semitones = excluded.semitones, chord_shapes = excluded.chord_shapes`,
      [user.id, JSON.stringify(semitoneMap(body.semitones)), JSON.stringify(shapeMap(body.chordShapes))],
    )
    await tx.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [IMPORT_KEY, now],
    )
  })
  return json({ ok: true, skipped: false, lists })
}

async function writeCatalogChart(sql: Sql, ownerId: string, id: string, sourceText: string, now: string): Promise<void> {
  const removed = await sql.get(`SELECT id FROM deleted_songs WHERE id = ?`, [id])
  if (removed) return
  const meta = chartMeta(sourceText, id)
  const existing = await sql.get<{ origin: Origin }>(`SELECT origin FROM songs WHERE id = ?`, [id])
  if (!existing) {
    await sql.run(
      `INSERT INTO songs (
        id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
        owner_id, shared, hidden, catalog_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'catalog', NULL, ?, 0, 0, ?, ?, ?)`,
      [id, meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics, ownerId, sourceText, now, now],
    )
  } else if (existing.origin === 'catalog') {
    await sql.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, hidden = 0, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics, now, id],
    )
  } else {
    return
  }
  for (const instrument of INSTRUMENTS) {
    await sql.run(
      `INSERT INTO instrument_parts (song_id, instrument, source_text, revision) VALUES (?, ?, ?, 1)
       ON CONFLICT(song_id, instrument) DO UPDATE SET source_text = excluded.source_text, revision = instrument_parts.revision + 1`,
      [id, instrument, sourceText],
    )
  }
}

async function listsAreSeed(sql: Sql): Promise<boolean> {
  const days = await sql.all<{ weekday: number }>(`SELECT weekday FROM service_days ORDER BY weekday`)
  const found = days.map((day) => Number(day.weekday))
  if (found.length !== 3 || found[0] !== 0 || found[1] !== 3 || found[2] !== 6) return false
  const lists = await sql.all<{ id: string; evergreen_weekday: number | null; service_date: string | null }>(
    `SELECT id, evergreen_weekday, service_date FROM setlists ORDER BY position`,
  )
  const expected: Array<[string, number]> = [
    ['servicio-3', 3],
    ['servicio-6', 6],
    ['servicio-0', 0],
  ]
  if (lists.length !== expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    const list = lists[index]
    const want = expected[index]
    if (!list || !want) return false
    if (list.id !== want[0] || Number(list.evergreen_weekday) !== want[1] || list.service_date != null) return false
  }
  const items = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM setlist_items`)
  return Number(items?.n ?? 0) === 0
}

async function getPrefs(sql: Sql, user: User): Promise<Response> {
  const row = await sql.get<{ semitones: string; chord_shapes: string }>(
    `SELECT semitones, chord_shapes FROM user_prefs WHERE user_id = ?`,
    [user.id],
  )
  if (!row) return json({ prefs: null })
  return json({
    prefs: {
      semitones: semitoneMap(parseJson(row.semitones)),
      chordShapes: shapeMap(parseJson(row.chord_shapes)),
    },
  })
}

async function putPrefs(sql: Sql, user: User, request: Request): Promise<Response> {
  const body = await readJson<{ semitones?: unknown; chordShapes?: unknown }>(request)
  const semitones = semitoneMap(body.semitones)
  const chordShapes = shapeMap(body.chordShapes)
  await sql.run(
    `INSERT INTO user_prefs (user_id, semitones, chord_shapes) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET semitones = excluded.semitones, chord_shapes = excluded.chord_shapes`,
    [user.id, JSON.stringify(semitones), JSON.stringify(chordShapes)],
  )
  return json({ prefs: { semitones, chordShapes } })
}

function normalizeDays(days: number[] | undefined): number[] {
  return [...new Set((days ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
}

function usableId(id: string): boolean {
  return id.length > 0 && id.length <= 180 && id.trim() === id && !/[\u0000-\u001f]/.test(id)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function semitoneMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item
  }
  return out
}

function shapeMap(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, Record<string, string>> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const shapes: Record<string, string> = {}
    for (const [shape, choice] of Object.entries(item)) {
      if (typeof choice === 'string') shapes[shape] = choice
    }
    out[key] = shapes
  }
  return out
}

async function copyCatalogIds(sql: Sql, userId: string): Promise<Set<string>> {
  const rows = await sql.all<{ catalog_id: string | null }>(
    `SELECT catalog_id FROM songs WHERE origin = 'copy' AND owner_id = ? AND hidden = 0 AND catalog_id IS NOT NULL`,
    [userId],
  )
  return new Set(rows.flatMap((row) => (row.catalog_id ? [row.catalog_id] : [])))
}

async function partDump(sql: Sql, id: string): Promise<Record<string, { sourceText: string; revision: number }>> {
  const rows = await sql.all<{ instrument: string; source_text: string; revision: number }>(
    `SELECT instrument, source_text, revision FROM instrument_parts WHERE song_id = ?`,
    [id],
  )
  const parts: Record<string, { sourceText: string; revision: number }> = {}
  for (const row of rows) parts[row.instrument] = { sourceText: row.source_text, revision: Number(row.revision) }
  return parts
}

function songSelect(where: string): string {
  return `SELECT
    s.id, s.title, s.artist, s.composer, s.key_name, s.source, s.origin, s.catalog_id,
    s.owner_id, s.shared, s.hidden, s.catalog_source, s.revision,
    u.name AS owner_name,
    p.source_text,
    p.revision AS part_revision,
    (SELECT group_concat(sh.user_id) FROM song_shares sh WHERE sh.song_id = s.id) AS share_ids,
    CASE WHEN s.origin = 'catalog' AND EXISTS (
      SELECT 1 FROM instrument_parts d WHERE d.song_id = s.id AND d.source_text != s.catalog_source
    ) THEN 1 ELSE 0 END AS diverged
  FROM songs s
  JOIN users u ON u.id = s.owner_id
  JOIN instrument_parts p ON p.song_id = s.id AND p.instrument = ?
  ${where}`
}

async function oneSong(sql: Sql, id: string, instrument: InstrumentId): Promise<SongRecord | undefined> {
  return sql.get<SongRecord>(songSelect(`WHERE s.id = ?`), [instrument, id])
}

function toDto(user: User, row: SongRecord, instrument: InstrumentId, hasCopy: boolean) {
  const shares = row.share_ids ? row.share_ids.split(',').filter(Boolean) : []
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    composer: row.composer,
    key: row.key_name,
    source: row.source,
    sourceText: row.source_text,
    origin: row.origin,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    shared: row.shared === 1,
    catalogId: row.catalog_id,
    editable: canEdit(user, row),
    removable: canRemove(user, row),
    diverged: row.diverged === 1,
    instrument,
    shares,
    hasCopy: row.origin === 'catalog' && hasCopy,
    revision: Number(row.revision),
    partRevision: Number(row.part_revision),
  }
}

function canSee(user: User, row: SongRecord): boolean {
  if (row.hidden && !isStaff(user)) return false
  if (isStaff(user)) return true
  if (row.origin === 'catalog') return row.hidden !== 1
  if (row.owner_id === user.id) return true
  if (row.shared === 1) return true
  const shares = row.share_ids ? row.share_ids.split(',') : []
  return shares.includes(user.id)
}

function canEdit(user: User, row: SongRecord): boolean {
  if (row.origin === 'catalog') return isStaff(user)
  if (isStaff(user)) return true
  if (row.owner_id === user.id) return true
  if (row.shared === 1) return true
  const shares = row.share_ids ? row.share_ids.split(',') : []
  return shares.includes(user.id)
}

function canRemove(user: User, row: SongRecord): boolean {
  if (row.origin === 'catalog') return isStaff(user)
  return isStaff(user) || row.owner_id === user.id
}

function isStaff(user: User): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

function instrumentFrom(url: URL): InstrumentId {
  const value = url.searchParams.get('instrument')
  if (!value) return DEFAULT_INSTRUMENT
  if (!isInstrument(value)) throw json({ error: 'Ese instrumento no está.' }, 400)
  return value
}

async function userFrom(sql: Sql, request: Request): Promise<User | undefined> {
  const token = bearer(request)
  if (!token) return undefined
  return sql.get<User>(
    `SELECT u.id, u.name, u.role, ${hasPasswordSql('u')} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token],
  )
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function publicUser(user: User) {
  return { id: user.id, name: user.name, role: user.role, hasPassword: Number(user.has_password) === 1 }
}

function userColumns(): string {
  return `SELECT id, name, role, ${hasPasswordSql()} FROM users`
}

function hasPasswordSql(alias = ''): string {
  const column = alias ? `${alias}.password_hash` : 'password_hash'
  return `CASE WHEN ${column} IS NOT NULL AND ${column} != '' THEN 1 ELSE 0 END AS has_password`
}

function staffOnly(user: User): Response | null {
  if (isStaff(user)) return null
  return json({ error: 'Solo el dueño o un admin abre el panel.' }, 403)
}

function parseRole(value: unknown): Role | undefined {
  if (value === 'owner' || value === 'admin' || value === 'viewer') return value
  return undefined
}

async function storedPassword(password: string | null): Promise<string | null | Response> {
  if (password == null) return null
  const trimmed = password.trim()
  if (!trimmed) return null
  if (trimmed.length > 200) return json({ error: 'La contraseña es demasiado larga.' }, 400)
  return hashPassword(trimmed)
}

async function count(sql: Sql, statement: string): Promise<number> {
  const row = await sql.get<{ n: number }>(statement)
  return Number(row?.n ?? 0)
}

function immutableAdmin(id: string): boolean {
  return id === OWNER_ID
}

async function setOwnPassword(sql: Sql, user: User, request: Request): Promise<Response> {
  if (immutableAdmin(user.id)) return json({ error: 'La cuenta de Admin no cambia de contraseña.' }, 403)
  const body = await readJson<{ password?: string | null }>(request)
  if (!Object.prototype.hasOwnProperty.call(body, 'password')) return json({ error: 'Falta la contraseña.' }, 400)
  const next = await storedPassword(body.password ?? null)
  if (next instanceof Response) return next
  await sql.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [next, user.id])
  return json({ user: publicUser({ ...user, has_password: next ? 1 : 0 }) })
}

async function adminOverview(sql: Sql, actor: User): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const me = await sql.get<User>(`${userColumns()} WHERE id = ?`, [actor.id])
  if (!me) return json({ error: 'No está tu cuenta.' }, 401)
  const people = await sql.all<User>(`${userColumns()} ORDER BY name COLLATE NOCASE`)
  const songs = await sql.all<{
    id: string
    title: string
    origin: Origin
    owner_id: string
    shared: number
    listed: number
  }>(
    `SELECT id, title, origin, owner_id, shared,
       CASE WHEN EXISTS (SELECT 1 FROM song_shares sh WHERE sh.song_id = songs.id) THEN 1 ELSE 0 END AS listed
     FROM songs
     ORDER BY title COLLATE NOCASE`,
  )
  const [users, catalogSongs, personalCopies, sharedCopies, createdSongs, setlists, serviceDays] = await Promise.all([
    count(sql, `SELECT COUNT(*) AS n FROM users`),
    count(sql, `SELECT COUNT(*) AS n FROM songs WHERE origin = 'catalog'`),
    count(
      sql,
      `SELECT COUNT(*) AS n FROM songs WHERE origin = 'copy' AND shared = 0 AND NOT EXISTS (SELECT 1 FROM song_shares sh WHERE sh.song_id = songs.id)`,
    ),
    count(
      sql,
      `SELECT COUNT(*) AS n FROM songs WHERE origin = 'copy' AND (shared = 1 OR EXISTS (SELECT 1 FROM song_shares sh WHERE sh.song_id = songs.id))`,
    ),
    count(sql, `SELECT COUNT(*) AS n FROM songs WHERE origin = 'local'`),
    count(sql, `SELECT COUNT(*) AS n FROM setlists`),
    count(sql, `SELECT COUNT(*) AS n FROM service_days`),
  ])
  return json({
    me: publicUser(me),
    users: people.map((person) => {
      const owned = songs.filter((song) => song.owner_id === person.id)
      const brief = (song: (typeof songs)[number]) => ({
        id: song.id,
        title: song.title,
        shared: Number(song.shared) === 1 || Number(song.listed) === 1,
      })
      return {
        ...publicUser(person),
        copies: owned.filter((song) => song.origin === 'copy').map(brief),
        created: owned.filter((song) => song.origin === 'local').map(brief),
        catalogCount: owned.filter((song) => song.origin === 'catalog').length,
      }
    }),
    inventory: { users, catalogSongs, personalCopies, sharedCopies, createdSongs, setlists, serviceDays },
  })
}

async function adminCreateUser(sql: Sql, actor: User, request: Request): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const body = await readJson<{ name?: string; role?: unknown; password?: string }>(request)
  const name = body.name?.trim() ?? ''
  if (!name || name.length > 80) return json({ error: 'Escribe un nombre.' }, 400)
  const role = parseRole(body.role)
  if (!role) return json({ error: 'Ese rol no existe.' }, 400)
  if (actor.role !== 'owner' && role === 'owner') return json({ error: 'Un admin no puede nombrar a un dueño.' }, 403)
  const existing = await sql.get(`SELECT id FROM users WHERE name = ? COLLATE NOCASE`, [name])
  if (existing) return json({ error: 'Ya hay alguien con ese nombre.' }, 409)
  let passwordHash: string | null = null
  if (typeof body.password === 'string' && body.password.trim()) {
    const stored = await storedPassword(body.password)
    if (stored instanceof Response) return stored
    passwordHash = stored
  }
  const id = await freshUserId(sql, name)
  await sql.run(`INSERT INTO users (id, name, role, password_hash) VALUES (?, ?, ?, ?)`, [id, name, role, passwordHash])
  return adminOverview(sql, actor)
}

async function adminUpdateUser(sql: Sql, actor: User, id: string, request: Request): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const target = await sql.get<{ id: string; role: Role }>(`SELECT id, role FROM users WHERE id = ?`, [id])
  if (!target) return json({ error: 'No está esa persona.' }, 404)
  const body = await readJson<{ role?: unknown; password?: string | null }>(request)
  const touchesRole = Object.prototype.hasOwnProperty.call(body, 'role')
  const touchesPassword = Object.prototype.hasOwnProperty.call(body, 'password')
  if (!touchesRole && !touchesPassword) return json({ error: 'Nada que cambiar.' }, 400)
  if (immutableAdmin(id)) return json({ error: 'La cuenta de Admin no se cambia.' }, 403)

  let role = target.role
  if (touchesRole) {
    const next = parseRole(body.role)
    if (!next) return json({ error: 'Ese rol no existe.' }, 400)
    if (actor.role !== 'owner' && target.role === 'owner' && next !== target.role) {
      return json({ error: 'Un admin no puede cambiar el rol del dueño.' }, 403)
    }
    if (actor.role !== 'owner' && next === 'owner' && target.role !== 'owner') {
      return json({ error: 'Un admin no puede nombrar a un dueño.' }, 403)
    }
    if (target.role === 'owner' && next !== 'owner') {
      const owners = await count(sql, `SELECT COUNT(*) AS n FROM users WHERE role = 'owner'`)
      if (owners <= 1) return json({ error: 'Tiene que quedar al menos un dueño.' }, 400)
    }
    role = next
  }

  let passwordHash: string | null | undefined
  if (touchesPassword) {
    if (actor.role !== 'owner' && target.role === 'owner') {
      return json({ error: 'Un admin no puede cambiar la contraseña del dueño.' }, 403)
    }
    const stored = await storedPassword(body.password ?? null)
    if (stored instanceof Response) return stored
    passwordHash = stored
  }

  if (role !== target.role) await sql.run(`UPDATE users SET role = ? WHERE id = ?`, [role, id])
  if (passwordHash !== undefined) await sql.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id])
  return adminOverview(sql, actor)
}

async function adminRemoveUser(sql: Sql, actor: User, id: string): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const target = await sql.get<{ id: string; role: Role }>(`SELECT id, role FROM users WHERE id = ?`, [id])
  if (!target) return json({ error: 'No está esa persona.' }, 404)
  if (immutableAdmin(id)) return json({ error: 'La cuenta de Admin no se quita.' }, 403)
  if (target.role === 'owner') return json({ error: 'No se puede quitar a un dueño.' }, 403)
  const keeper = await sql.get<{ id: string }>(
    `SELECT id FROM users WHERE role = 'owner' ORDER BY CASE WHEN id = 'jorge' THEN 0 ELSE 1 END, name COLLATE NOCASE LIMIT 1`,
  )
  if (!keeper || keeper.id === id) return json({ error: 'No hay un dueño para conservar el catálogo.' }, 409)
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(
      `DELETE FROM setlist_items WHERE song_id IN (
        SELECT id FROM songs
        WHERE owner_id = ?
          AND origin != 'catalog'
          AND shared = 0
          AND NOT EXISTS (SELECT 1 FROM song_shares sh WHERE sh.song_id = songs.id)
      )`,
      [id],
    )
    await tx.run(
      `DELETE FROM songs
       WHERE owner_id = ?
         AND origin != 'catalog'
         AND shared = 0
         AND NOT EXISTS (SELECT 1 FROM song_shares sh WHERE sh.song_id = songs.id)`,
      [id],
    )
    await tx.run(`UPDATE songs SET owner_id = ?, updated_at = ? WHERE owner_id = ?`, [keeper.id, now, id])
    await tx.run(`DELETE FROM users WHERE id = ?`, [id])
  })
  return adminOverview(sql, actor)
}

async function freshUserId(sql: Sql, name: string): Promise<string> {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'persona'
  let id = base
  let n = 2
  while (await sql.get(`SELECT id FROM users WHERE id = ?`, [id])) {
    id = `${base}-${n}`
    n += 1
  }
  return id
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text()
  if (!text.trim()) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw json({ error: 'No pude leer el JSON.' }, 400)
  }
}

async function searchCharts(url: URL): Promise<Response> {
  const query = url.searchParams.get('q')?.trim() ?? ''
  if (!query || query.length > 180) return json({ error: 'Escribe el nombre de la canción.' }, 400)
  try {
    const hit = await findPublicChart(query)
    if (!hit) return json({ found: false })
    return json({ found: true, title: hit.title, url: hit.url })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'No pude buscar en la web. Pega un enlace.'
    return json({ error: message }, 502)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
