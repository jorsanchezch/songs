import {
  audioStoreReady,
  contentTypeForKey,
  extensionForType,
  getAudioObject,
  MAX_AUDIO_BYTES,
  putAudioObject,
} from './audioStorage.ts'
import { applyChartMedia, chartHasYoutube, copyChartMedia, shareChartMeta } from './chartMedia.ts'
import { findPublicChart } from './chartSearch.ts'
import { DEFAULT_INSTRUMENT, INSTRUMENTS, isInstrument, type InstrumentId } from './instruments.ts'
import { shareLyrics } from './lyrics.ts'
import { mediaBackfillStatus, runMediaBackfill, type MediaBackfillEnv } from './mediaBackfill.ts'
import { chartMeta } from './meta.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { songPlayback } from './playback.ts'
import { enrichYoutubeVideo, findYoutubeMedia, youtubeVideoIdFromUrl, type YoutubeHit } from './youtubeMedia.ts'
import { OWNER_ID } from './schema.ts'
import type { Sql } from './sql.ts'
import {
  extractAudioBlockedReport,
  extractYoutubeLinkAudio,
  runYoutubeAudioExtract,
  songsMissingAudio,
  ytDlpAvailable,
} from './youtubeExtract.ts'

export type ApiEnv = MediaBackfillEnv & {
  /** Node/sqlite only — enables Admin Extraer MP3 via yt-dlp. Never set on the Worker. */
  ALLOW_YT_EXTRACT?: boolean
  /** Tests: never search YouTube when a song is created or looked up. */
  OFFLINE?: boolean
}

type Role = 'owner' | 'admin' | 'viewer'
type Origin = 'catalog' | 'local' | 'copy'

type User = { id: string; name: string; username: string; role: Role; has_password: number }

const USERNAME_OK = /^[A-Za-z0-9._-]{2,40}$/

type SongRecord = {
  id: string
  title: string
  artist: string
  composer: string
  key_name: string
  source: string
  bpm: number | null
  duration_ms: number | null
  audio_url: string
  playback: string | null
  origin: Origin
  catalog_id: string | null
  owner_id: string
  creator_id: string | null
  creator_name: string | null
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

export async function handleApi(sql: Sql, request: Request, env: ApiEnv = {}): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  try {
    // Public audio playback — <audio> cannot send Authorization.
    const audioGet = pathname.match(/^\/api\/audio\/(.+)$/)
    if (audioGet && request.method === 'GET') {
      return serveAudio(env, decodeURIComponent(audioGet[1] ?? ''))
    }

    if (pathname === '/api/session' && request.method === 'POST') return sessionCreate(sql, request)
    const user = await userFrom(sql, request)
    if (!user) return json({ error: 'Entra con tu usuario y contraseña para usar Songbook.' }, 401)
    if (pathname === '/api/session' && request.method === 'GET') return json({ user: publicUser(user) })
    if (pathname === '/api/session' && request.method === 'DELETE') return sessionDelete(sql, request)
    if (pathname === '/api/users' && request.method === 'GET') return listUsers(sql)
    if (pathname === '/api/search-charts' && request.method === 'GET') return searchCharts(url)
    if (pathname === '/api/audio' && request.method === 'POST') return uploadAudio(sql, user, request, env)
    if (pathname === '/api/audio/extract' && request.method === 'POST') {
      return extractLinkAudio(sql, user, request, env)
    }
    if (pathname === '/api/songs' && request.method === 'GET') return listSongs(sql, user, url)
    if (pathname === '/api/songs' && request.method === 'POST') return createSong(sql, user, request, env)
    if (pathname === '/api/media/lookup' && request.method === 'GET') return mediaLookup(user, url, env)
    if (pathname === '/api/youtube/info' && request.method === 'GET') return youtubeInfo(user, url, env)
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
    if (pathname === '/api/admin/media-backfill' && request.method === 'GET') {
      return adminMediaBackfillGet(sql, user, env)
    }
    if (pathname === '/api/admin/media-backfill' && request.method === 'POST') {
      return adminMediaBackfillPost(sql, user, request, env)
    }
    if (pathname === '/api/admin/audio-extract' && request.method === 'GET') {
      return adminAudioExtractGet(sql, user, env)
    }
    if (pathname === '/api/admin/audio-extract' && request.method === 'POST') {
      return adminAudioExtractPost(sql, user, request, env)
    }
    const adminUserPath = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (adminUserPath) {
      const id = decodeURIComponent(adminUserPath[1] ?? '')
      if (request.method === 'PUT') return adminUpdateUser(sql, user, id, request)
      if (request.method === 'DELETE') return adminRemoveUser(sql, user, id)
    }
    const userDraftPath = pathname.match(/^\/api\/songs\/([^/]+)\/drafts\/([^/]+)$/)
    if (userDraftPath && request.method === 'DELETE') {
      return removeUserDraft(
        sql,
        user,
        decodeURIComponent(userDraftPath[1] ?? ''),
        decodeURIComponent(userDraftPath[2] ?? ''),
      )
    }
    const songPath = pathname.match(/^\/api\/songs\/([^/]+)(?:\/(copy|share|restore|media|playback|draft|drafts))?$/)
    if (songPath) {
      const id = decodeURIComponent(songPath[1] ?? '')
      const action = songPath[2]
      if (request.method === 'PUT' && action === 'draft') return saveDraft(sql, user, id, request)
      if (request.method === 'DELETE' && action === 'draft') return discardDraft(sql, user, id, url)
      if (request.method === 'GET' && action === 'drafts') return listSongDrafts(sql, user, id)
      if (request.method === 'GET' && !action) return getSong(sql, user, id, url)
      if (request.method === 'PUT' && !action) return updateSong(sql, user, id, request)
      if (request.method === 'DELETE' && !action) return removeSong(sql, user, id)
      if (request.method === 'POST' && action === 'copy') return copySong(sql, user, id)
      if (request.method === 'POST' && action === 'share') return shareSong(sql, user, id, request)
      if (request.method === 'POST' && action === 'restore') return restoreSong(sql, user, id)
      if (request.method === 'PUT' && action === 'playback') return savePlayback(sql, user, id, request)
      if (request.method === 'PUT' && action === 'media') return patchSongMedia(sql, user, id, request)
    }
    return json({ error: 'No está esa ruta.' }, 404)
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof RevisionConflict) return json({ error: error.message }, 409)
    const message = error instanceof Error ? error.message : 'Error del servidor'
    return json({ error: message }, 500)
  }
}

const LOGIN_TRIES = 5
const LOGIN_LOCK_MS = 15 * 60_000

async function sessionCreate(sql: Sql, request: Request): Promise<Response> {
  const body = await readJson<{ username?: string; password?: string }>(request)
  const username = normalizeUsername(body.username)
  if (!username) return json({ error: 'Escribe tu usuario.' }, 400)
  if (!USERNAME_OK.test(username)) return json({ error: 'Ese usuario no es válido.' }, 400)
  const password = typeof body.password === 'string' ? body.password.trim() : ''
  if (!password) return json({ error: 'Escribe tu contraseña.' }, 401)
  // Short passwords are guessable; a few wrong tries lock that username for a while.
  const since = new Date(Date.now() - LOGIN_LOCK_MS).toISOString()
  await sql.run(`DELETE FROM login_failures WHERE at < ?`, [since])
  const failures = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM login_failures WHERE username = ?`, [username])
  if (Number(failures?.n ?? 0) >= LOGIN_TRIES) {
    return json({ error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' }, 429)
  }
  const refuse = async () => {
    await sql.run(`INSERT INTO login_failures (username, at) VALUES (?, ?)`, [username, new Date().toISOString()])
    return json({ error: 'Usuario o contraseña incorrectos.' }, 401)
  }
  const row = await sql.get<{
    id: string
    name: string
    username: string
    role: Role
    password_hash: string | null
  }>(
    `SELECT id, name, username, role, password_hash FROM users WHERE username = ? COLLATE NOCASE`,
    [username],
  )
  if (!row || !row.password_hash) return refuse()
  if (!(await verifyPassword(password, row.password_hash))) return refuse()
  await sql.run(`DELETE FROM login_failures WHERE username = ?`, [username])
  const user: User = {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    has_password: 1,
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
  const drafts = await ownDrafts(sql, user.id, instrument)
  const counts = await draftUserCounts(sql, user)
  const rows = await sql.all<SongRecord>(songSelect(`WHERE s.hidden = 0`), [instrument])
  const songs = rows
    .filter((row) => canSee(user, row))
    .map((row) =>
      toDto(user, row, instrument, copies.has(row.id), {
        draft: canDraft(user, row) ? drafts.get(row.id) : undefined,
        draftUsers: counts.get(row.id),
      }),
    )
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
  return json({ song: await songDto(sql, user, row, instrument) })
}

/** Media lookup never blocks saving a song for long. */
const LOOKUP_BUDGET_MS = 8000

async function lookupMedia(title: string, artist: string, env: ApiEnv): Promise<YoutubeHit | null> {
  if (!title.trim() || env.OFFLINE) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOOKUP_BUDGET_MS)
  })
  try {
    return await Promise.race([findYoutubeMedia(title, artist, env).catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function mediaLookup(user: User, url: URL, env: ApiEnv): Promise<Response> {
  // Each search spends YouTube quota; only people who can add songs need it.
  if (user.role === 'viewer') return json({ error: 'Solo quien edita canciones busca en YouTube.' }, 403)
  const title = url.searchParams.get('title')?.trim() ?? ''
  const artist = url.searchParams.get('artist')?.trim() ?? ''
  if (!title) return json({ error: 'Falta el título.' }, 400)
  const hit = await lookupMedia(title, artist, env)
  return json({
    media: hit ? { youtubeUrl: hit.url, videoTitle: hit.title, durationMs: hit.durationMs, bpm: hit.bpm } : null,
  })
}

/** A new song without a YouTube link gets the first good match, plus its length when the chart has none. */
async function withFoundMedia(sourceText: string, id: string, env: ApiEnv): Promise<string> {
  if (chartHasYoutube(sourceText)) return sourceText
  const meta = chartMeta(sourceText, id)
  const hit = await lookupMedia(meta.title, meta.artist, env)
  if (!hit) return sourceText
  return applyChartMedia(sourceText, {
    addYoutubeUrl: hit.url,
    durationMs: meta.durationMs ?? hit.durationMs ?? undefined,
    bpm: meta.bpm ?? hit.bpm ?? undefined,
  })
}

async function createSong(sql: Sql, user: User, request: Request, env: ApiEnv): Promise<Response> {
  const body = await readJson<{ sourceText?: string; id?: string }>(request)
  if (!body.sourceText?.trim()) return json({ error: 'La canción está vacía.' }, 400)
  const id = body.id?.trim() || `local-${user.id}-${Date.now()}`
  if (!ID_OK.test(id)) return json({ error: 'Ese identificador no sirve.' }, 400)
  const exists = await sql.get(`SELECT id FROM songs WHERE id = ?`, [id])
  if (exists) return json({ error: 'Ya existe una canción con ese id.' }, 409)
  const sourceText = await withFoundMedia(body.sourceText, id, env)
  const meta = chartMeta(sourceText, id)
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO songs (
        id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
        owner_id, creator_id, shared, hidden, catalog_source, bpm, duration_ms, audio_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'local', NULL, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        meta.title,
        meta.artist,
        meta.composer,
        meta.key,
        meta.source,
        meta.lyrics,
        user.id,
        user.id,
        sourceText,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        now,
        now,
      ],
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
      const shared = writeAll ? sourceText : shareLyrics(part.source_text, sourceText)
      const nextText = writeAll ? shared : copyChartMedia(shared, sourceText)
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
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, bpm = ?, duration_ms = ?, audio_url = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`,
      [
        meta.title,
        meta.artist,
        meta.composer,
        key,
        meta.source,
        meta.lyrics,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        now,
        id,
        body.revision,
      ],
    )
    if (savedSong.changes !== 1) throw new RevisionConflict()
  })
  const next = await oneSong(sql, id, instrument)
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  return json({ song: await songDto(sql, user, next, instrument), parts: await partDump(sql, id) })
}

async function removeSong(sql: Sql, user: User, id: string): Promise<Response> {
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (!canRemove(user, row)) return json({ error: 'No puedes borrar esta canción.' }, 403)
  // Always hard-delete. Catalog ids go in deleted_songs so a reseed cannot restore them.
  // Never soft-hide from Eliminar — hide is only for one-time local import archival.
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO deleted_songs (id, deleted_at) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id, now],
    )
    await tx.run(`DELETE FROM setlist_items WHERE song_id = ?`, [id])
    await tx.run(`DELETE FROM day_list_history_items WHERE song_id = ?`, [id])
    await tx.run(`DELETE FROM song_drafts WHERE song_id = ?`, [id])
    await tx.run(`DELETE FROM songs WHERE id = ?`, [id])
  })
  return json({ ok: true, hidden: false })
}

/** Calibration is not chart content: it skips the revision so it never conflicts with an edit. */
async function savePlayback(sql: Sql, user: User, id: string, request: Request): Promise<Response> {
  const body = await readJson<{ playback?: unknown }>(request)
  const row = await oneSong(sql, id, 'guitar')
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (!canEdit(user, row)) return json({ error: 'Solo quien edita la canción guarda su reproducción.' }, 403)
  const playback = songPlayback(body.playback)
  await sql.run(`UPDATE songs SET playback = ? WHERE id = ?`, [JSON.stringify(playback), id])
  return json({ playback })
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
        owner_id, creator_id, shared, hidden, catalog_source, bpm, duration_ms, audio_url, playback, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'copy', ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
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
        user.id,
        row.catalog_source,
        row.bpm,
        row.duration_ms,
        row.audio_url ?? '',
        row.playback ?? '{}',
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
  return json({ song: await songDto(sql, user, next, 'guitar') })
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
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, bpm = ?, duration_ms = ?, audio_url = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [
        meta.title,
        meta.artist,
        meta.composer,
        meta.key,
        meta.source,
        meta.lyrics,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        now,
        id,
      ],
    )
  })
  const next = await oneSong(sql, id, 'guitar')
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  return json({ song: await songDto(sql, user, next, 'guitar') })
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
        owner_id, creator_id, shared, hidden, catalog_source, bpm, duration_ms, audio_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'catalog', NULL, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        meta.title,
        meta.artist,
        meta.composer,
        meta.key,
        meta.source,
        meta.lyrics,
        ownerId,
        ownerId,
        sourceText,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        now,
        now,
      ],
    )
  } else if (existing.origin === 'catalog') {
    await sql.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, bpm = ?, duration_ms = ?, audio_url = ?, hidden = 0, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [
        meta.title,
        meta.artist,
        meta.composer,
        meta.key,
        meta.source,
        meta.lyrics,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        now,
        id,
      ],
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
    s.id, s.title, s.artist, s.composer, s.key_name, s.source, s.bpm, s.duration_ms, s.audio_url, s.playback,
    s.origin, s.catalog_id,
    s.owner_id, s.creator_id, s.shared, s.hidden, s.catalog_source, s.revision,
    u.name AS owner_name,
    c.name AS creator_name,
    p.source_text,
    p.revision AS part_revision,
    (SELECT group_concat(sh.user_id) FROM song_shares sh WHERE sh.song_id = s.id) AS share_ids,
    CASE WHEN s.origin = 'catalog' AND EXISTS (
      SELECT 1 FROM instrument_parts d WHERE d.song_id = s.id AND d.source_text != s.catalog_source
    ) THEN 1 ELSE 0 END AS diverged
  FROM songs s
  JOIN users u ON u.id = s.owner_id
  LEFT JOIN users c ON c.id = s.creator_id
  JOIN instrument_parts p ON p.song_id = s.id AND p.instrument = ?
  ${where}`
}

async function oneSong(sql: Sql, id: string, instrument: InstrumentId): Promise<SongRecord | undefined> {
  return sql.get<SongRecord>(songSelect(`WHERE s.id = ?`), [instrument, id])
}

type DtoExtras = { draft?: DraftRow; draftUsers?: number }

function toDto(user: User, row: SongRecord, instrument: InstrumentId, hasCopy: boolean, extras: DtoExtras = {}) {
  const shares = row.share_ids ? row.share_ids.split(',').filter(Boolean) : []
  const draft = extras.draft
  const meta = draft ? chartMeta(draft.source_text, row.id) : null
  return {
    id: row.id,
    title: meta?.title || row.title,
    artist: meta ? meta.artist : row.artist,
    composer: meta ? meta.composer : row.composer,
    key: meta?.key || row.key_name,
    source: meta ? meta.source : row.source,
    sourceText: draft ? draft.source_text : row.source_text,
    bpm: meta ? meta.bpm : row.bpm == null ? null : Number(row.bpm),
    durationMs: meta ? meta.durationMs : row.duration_ms == null ? null : Number(row.duration_ms),
    audioUrl: meta ? meta.audioUrl : (row.audio_url ?? ''),
    playback: songPlayback(parseJson(row.playback ?? '{}')),
    origin: row.origin,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    creatorId: creatorOf(row),
    creatorName: row.creator_name ?? '',
    shared: row.shared === 1,
    catalogId: row.catalog_id,
    editable: canEdit(user, row),
    personal: canDraft(user, row),
    draft: draft
      ? {
          updatedAt: draft.updated_at,
          edited: Number(draft.edited) === 1,
          stale: Number(draft.base_revision) !== Number(row.revision),
        }
      : null,
    draftUsers: isStaff(user) ? (extras.draftUsers ?? 0) : 0,
    removable: canRemove(user, row),
    diverged: row.diverged === 1,
    instrument,
    shares,
    hasCopy: row.origin === 'catalog' && hasCopy,
    revision: Number(row.revision),
    partRevision: Number(row.part_revision),
  }
}

function creatorOf(row: SongRecord): string {
  if (row.creator_id) return row.creator_id
  return row.origin === 'catalog' ? OWNER_ID : row.owner_id
}

type DraftRow = {
  song_id: string
  user_id: string
  instrument: string
  source_text: string
  base_text: string
  base_revision: number
  edited: number
  created_at: string
  updated_at: string
}

async function ownDrafts(sql: Sql, userId: string, instrument: InstrumentId, songId?: string): Promise<Map<string, DraftRow>> {
  const rows = await sql.all<DraftRow>(
    `SELECT * FROM song_drafts WHERE user_id = ? AND instrument = ?${songId ? ' AND song_id = ?' : ''}`,
    songId ? [userId, instrument, songId] : [userId, instrument],
  )
  return new Map(rows.map((row) => [row.song_id, row]))
}

async function draftUserCounts(sql: Sql, user: User, songId?: string): Promise<Map<string, number>> {
  if (!isStaff(user)) return new Map()
  const rows = await sql.all<{ song_id: string; n: number }>(
    `SELECT song_id, COUNT(DISTINCT user_id) AS n FROM song_drafts WHERE edited = 1${songId ? ' AND song_id = ?' : ''} GROUP BY song_id`,
    songId ? [songId] : [],
  )
  return new Map(rows.map((row) => [row.song_id, Number(row.n)]))
}

async function songDto(sql: Sql, user: User, row: SongRecord, instrument: InstrumentId) {
  const copies = await copyCatalogIds(sql, user.id)
  const drafts = await ownDrafts(sql, user.id, instrument, row.id)
  const counts = await draftUserCounts(sql, user, row.id)
  return toDto(user, row, instrument, copies.has(row.id), {
    draft: canDraft(user, row) ? drafts.get(row.id) : undefined,
    draftUsers: counts.get(row.id),
  })
}

/** Every instrument as this person sees it: their personal version where there is one, else the shared part. */
async function effectiveParts(
  sql: Sql,
  user: User,
  id: string,
): Promise<Record<string, { sourceText: string; revision: number; draft?: boolean }>> {
  const parts: Record<string, { sourceText: string; revision: number; draft?: boolean }> = await partDump(sql, id)
  const drafts = await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM song_drafts WHERE song_id = ? AND user_id = ?`,
    [id, user.id],
  )
  for (const draft of drafts) {
    const part = parts[draft.instrument]
    if (part) parts[draft.instrument] = { ...part, sourceText: draft.source_text, draft: true }
  }
  return parts
}

/**
 * Saves a personal version for someone who cannot change the shared song. The edited instrument keeps the text;
 * the others take its lyrics and song header (title, links, BPM…), so the person sees one coherent song everywhere.
 */
async function writeDraft(
  sql: Sql,
  user: User,
  row: SongRecord,
  instrument: InstrumentId,
  build: (current: string, part: string) => string,
): Promise<void> {
  const shared = await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM instrument_parts WHERE song_id = ?`,
    [row.id],
  )
  const existing = await sql.all<DraftRow>(`SELECT * FROM song_drafts WHERE song_id = ? AND user_id = ?`, [
    row.id,
    user.id,
  ])
  const now = new Date().toISOString()
  await sql.transaction(async (tx) => {
    for (const part of shared) {
      const previous = existing.find((item) => item.instrument === part.instrument)
      const current = previous?.source_text ?? part.source_text
      const next = build(current, part.instrument)
      const edited = part.instrument === instrument
      if (next === part.source_text) {
        if (previous) {
          await tx.run(`DELETE FROM song_drafts WHERE song_id = ? AND user_id = ? AND instrument = ?`, [
            row.id,
            user.id,
            part.instrument,
          ])
        }
        continue
      }
      if (!edited && next === current) continue
      await tx.run(
        `INSERT INTO song_drafts (song_id, user_id, instrument, source_text, base_text, base_revision, edited, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(song_id, user_id, instrument) DO UPDATE SET
           source_text = excluded.source_text,
           edited = MAX(song_drafts.edited, excluded.edited),
           updated_at = excluded.updated_at`,
        [row.id, user.id, part.instrument, next, part.source_text, Number(row.revision), edited ? 1 : 0, now, now],
      )
    }
  })
}

async function saveDraft(sql: Sql, user: User, id: string, request: Request): Promise<Response> {
  const body = await readJson<{ sourceText?: string; instrument?: string }>(request)
  const sourceText = body.sourceText ?? ''
  if (!sourceText.trim()) return json({ error: 'La canción está vacía.' }, 400)
  const instrument = body.instrument && isInstrument(body.instrument) ? body.instrument : DEFAULT_INSTRUMENT
  const row = await oneSong(sql, id, instrument)
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  if (!canDraft(user, row)) return json({ error: 'Esta canción la guardas directo, sin versión personal.' }, 400)
  await writeDraft(sql, user, row, instrument, (current, part) =>
    part === instrument
      ? sourceText
      : copyChartMedia(shareChartMeta(shareLyrics(current, sourceText), sourceText), sourceText),
  )
  return json({ song: await songDto(sql, user, row, instrument), parts: await effectiveParts(sql, user, id) })
}

async function discardDraft(sql: Sql, user: User, id: string, url: URL): Promise<Response> {
  const instrument = instrumentFrom(url)
  const row = await oneSong(sql, id, instrument)
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  await sql.run(`DELETE FROM song_drafts WHERE song_id = ? AND user_id = ?`, [id, user.id])
  return json({ song: await songDto(sql, user, row, instrument), parts: await partDump(sql, id) })
}

async function listSongDrafts(sql: Sql, user: User, id: string): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  const row = await oneSong(sql, id, DEFAULT_INSTRUMENT)
  if (!row) return json({ error: 'No está esta canción.' }, 404)
  const drafts = await sql.all<DraftRow & { user_name: string; canonical_text: string }>(
    `SELECT d.*, u.name AS user_name, p.source_text AS canonical_text
     FROM song_drafts d
     JOIN users u ON u.id = d.user_id
     JOIN instrument_parts p ON p.song_id = d.song_id AND p.instrument = d.instrument
     WHERE d.song_id = ? AND d.edited = 1
     ORDER BY d.updated_at DESC`,
    [id],
  )
  return json({
    song: {
      id: row.id,
      title: row.title,
      revision: Number(row.revision),
      creatorId: creatorOf(row),
      creatorName: row.creator_name ?? '',
    },
    drafts: drafts.map((draft) => ({
      userId: draft.user_id,
      userName: draft.user_name,
      instrument: draft.instrument,
      sourceText: draft.source_text,
      baseText: draft.base_text,
      canonicalText: draft.canonical_text,
      stale: Number(draft.base_revision) !== Number(row.revision),
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
    })),
  })
}

async function removeUserDraft(sql: Sql, user: User, id: string, userId: string): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  await sql.run(`DELETE FROM song_drafts WHERE song_id = ? AND user_id = ?`, [id, userId])
  return listSongDrafts(sql, user, id)
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

/** Someone who sees a song but cannot change it saves a personal version instead. */
function canDraft(user: User, row: SongRecord): boolean {
  return canSee(user, row) && !canEdit(user, row)
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
    `SELECT u.id, u.name, u.username, u.role, ${hasPasswordSql('u')} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token],
  )
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    hasPassword: Number(user.has_password) === 1,
  }
}

function userColumns(): string {
  return `SELECT id, name, username, role, ${hasPasswordSql()} FROM users`
}

function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseUsername(value: unknown): string | Response {
  const username = normalizeUsername(value)
  if (!username) return json({ error: 'Escribe un usuario.' }, 400)
  if (!USERNAME_OK.test(username)) {
    return json({ error: 'El usuario solo admite letras, números, punto, guion y guion bajo (2–40).' }, 400)
  }
  return username
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
  if (body.password == null || !String(body.password).trim()) {
    return json({ error: 'La contraseña es obligatoria para entrar.' }, 400)
  }
  const next = await storedPassword(body.password)
  if (next instanceof Response) return next
  if (!next) return json({ error: 'La contraseña es obligatoria para entrar.' }, 400)
  await sql.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [next, user.id])
  return json({ user: publicUser({ ...user, has_password: 1 }) })
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
  const draftRows = await sql.all<{ song_id: string; title: string; user_id: string; user_name: string; updated_at: string }>(
    `SELECT d.song_id, s.title, d.user_id, u.name AS user_name, MAX(d.updated_at) AS updated_at
     FROM song_drafts d
     JOIN songs s ON s.id = d.song_id
     JOIN users u ON u.id = d.user_id
     WHERE d.edited = 1
     GROUP BY d.song_id, d.user_id
     ORDER BY s.title COLLATE NOCASE, u.name COLLATE NOCASE`,
  )
  const drafts: { songId: string; title: string; users: { id: string; name: string; updatedAt: string }[] }[] = []
  for (const draft of draftRows) {
    let entry = drafts.find((item) => item.songId === draft.song_id)
    if (!entry) {
      entry = { songId: draft.song_id, title: draft.title, users: [] }
      drafts.push(entry)
    }
    entry.users.push({ id: draft.user_id, name: draft.user_name, updatedAt: draft.updated_at })
  }
  return json({
    drafts,
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
    inventory: {
      users,
      catalogSongs,
      personalCopies,
      sharedCopies,
      createdSongs,
      userVersions: draftRows.length,
      setlists,
      serviceDays,
    },
  })
}

async function adminCreateUser(sql: Sql, actor: User, request: Request): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const body = await readJson<{ name?: string; username?: string; role?: unknown; password?: string }>(request)
  const name = body.name?.trim() ?? ''
  if (!name || name.length > 80) return json({ error: 'Escribe un nombre.' }, 400)
  const username = parseUsername(body.username)
  if (username instanceof Response) return username
  const role = parseRole(body.role)
  if (!role) return json({ error: 'Ese rol no existe.' }, 400)
  if (actor.role !== 'owner' && role === 'owner') return json({ error: 'Un admin no puede nombrar a un dueño.' }, 403)
  const existingName = await sql.get(`SELECT id FROM users WHERE name = ? COLLATE NOCASE`, [name])
  if (existingName) return json({ error: 'Ya hay alguien con ese nombre.' }, 409)
  const existingUser = await sql.get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, [username])
  if (existingUser) return json({ error: 'Ya hay alguien con ese usuario.' }, 409)
  if (typeof body.password !== 'string' || !body.password.trim()) {
    return json({ error: 'Escribe una contraseña.' }, 400)
  }
  const stored = await storedPassword(body.password)
  if (stored instanceof Response) return stored
  if (!stored) return json({ error: 'Escribe una contraseña.' }, 400)
  const id = await freshUserId(sql, name)
  await sql.run(`INSERT INTO users (id, name, username, role, password_hash) VALUES (?, ?, ?, ?, ?)`, [
    id,
    name,
    username,
    role,
    stored,
  ])
  return adminOverview(sql, actor)
}

async function adminUpdateUser(sql: Sql, actor: User, id: string, request: Request): Promise<Response> {
  const denied = staffOnly(actor)
  if (denied) return denied
  const target = await sql.get<{ id: string; role: Role; username: string }>(
    `SELECT id, role, username FROM users WHERE id = ?`,
    [id],
  )
  if (!target) return json({ error: 'No está esa persona.' }, 404)
  const body = await readJson<{ role?: unknown; username?: string; password?: string | null }>(request)
  const touchesRole = Object.prototype.hasOwnProperty.call(body, 'role')
  const touchesUsername = Object.prototype.hasOwnProperty.call(body, 'username')
  const touchesPassword = Object.prototype.hasOwnProperty.call(body, 'password')
  if (!touchesRole && !touchesUsername && !touchesPassword) return json({ error: 'Nada que cambiar.' }, 400)
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

  let username = target.username
  if (touchesUsername) {
    const next = parseUsername(body.username)
    if (next instanceof Response) return next
    const taken = await sql.get(`SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?`, [next, id])
    if (taken) return json({ error: 'Ya hay alguien con ese usuario.' }, 409)
    username = next
  }

  let passwordHash: string | undefined
  if (touchesPassword) {
    if (actor.role !== 'owner' && target.role === 'owner') {
      return json({ error: 'Un admin no puede cambiar la contraseña del dueño.' }, 403)
    }
    if (body.password == null || !String(body.password).trim()) {
      return json({ error: 'La contraseña es obligatoria para entrar.' }, 400)
    }
    const stored = await storedPassword(body.password)
    if (stored instanceof Response) return stored
    if (!stored) return json({ error: 'La contraseña es obligatoria para entrar.' }, 400)
    passwordHash = stored
  }

  if (role !== target.role) await sql.run(`UPDATE users SET role = ? WHERE id = ?`, [role, id])
  if (username !== target.username) await sql.run(`UPDATE users SET username = ? WHERE id = ?`, [username, id])
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
    await tx.run(`UPDATE songs SET creator_id = ? WHERE creator_id = ?`, [keeper.id, id])
    await tx.run(`DELETE FROM song_drafts WHERE user_id = ?`, [id])
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

async function adminMediaBackfillGet(sql: Sql, user: User, env: ApiEnv): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  return json(await mediaBackfillStatus(sql, env))
}

async function adminMediaBackfillPost(
  sql: Sql,
  user: User,
  request: Request,
  env: ApiEnv,
): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  const body = await readJson<{ limit?: number; dryRun?: boolean; extractAudio?: boolean }>(request)
  const report = await runMediaBackfill(sql, env, {
    limit: typeof body.limit === 'number' ? body.limit : undefined,
    dryRun: body.dryRun === true,
    extractAudio: body.extractAudio !== false,
  })
  return json(report)
}

async function adminAudioExtractGet(sql: Sql, user: User, env: ApiEnv): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  const missing = await songsMissingAudio(sql)
  if (!env.ALLOW_YT_EXTRACT) {
    return json(
      await extractAudioBlockedReport(
        sql,
        env,
        'El Worker de Cloudflare no ejecuta yt-dlp. En un entorno Node con yt-dlp: npm run media:extract-audio. O sube el MP3 en el editor (R2 / data/audio).',
      ),
    )
  }
  return json({
    extractorAvailable: true,
    r2Configured: Boolean(env.AUDIO_BUCKET),
    storeReady: audioStoreReady(env),
    dryRun: true,
    missingAudio: missing.length,
    updated: 0,
    skipped: 0,
    errors: 0,
    results: [],
    blocked: false,
    note: 'Listo para extraer en este servidor Node. POST con { limit, dryRun }.',
  })
}

async function adminAudioExtractPost(
  sql: Sql,
  user: User,
  request: Request,
  env: ApiEnv,
): Promise<Response> {
  const denied = staffOnly(user)
  if (denied) return denied
  const body = await readJson<{ limit?: number; dryRun?: boolean }>(request)
  if (!env.ALLOW_YT_EXTRACT) {
    return json(
      await extractAudioBlockedReport(
        sql,
        env,
        'Bloqueado en el Worker: no hay yt-dlp. Corre `npm run media:extract-audio` en local/CI con yt-dlp + almacén (R2 o data/audio), o sube el MP3 en el editor.',
      ),
    )
  }
  const report = await runYoutubeAudioExtract(sql, env, {
    limit: typeof body.limit === 'number' ? body.limit : undefined,
    dryRun: body.dryRun === true,
  })
  return json(report)
}

async function serveAudio(env: ApiEnv, rawKey: string): Promise<Response> {
  const object = await getAudioObject(env, rawKey)
  if (!object) return json({ error: 'No está ese audio.' }, 404)
  return new Response(object.bytes, {
    status: 200,
    headers: {
      'content-type': object.contentType || contentTypeForKey(rawKey),
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  })
}

async function uploadAudio(sql: Sql, user: User, request: Request, env: ApiEnv): Promise<Response> {
  if (!audioStoreReady(env)) {
    return json(
      {
        error:
          'No hay almacén de audio. En Cloudflare enlaza R2 (AUDIO_BUCKET). En local usa data/audio. No se guardan MP3 en D1.',
      },
      503,
    )
  }
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ error: 'Envía el MP3 como multipart/form-data (campo file).' }, 400)
  }
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return json({ error: 'Falta el archivo (file).' }, 400)
  const songIdRaw = String(form.get('songId') ?? '').trim()
  const songId = songIdRaw && ID_OK.test(songIdRaw) ? songIdRaw : `tmp-${user.id}`
  if (songIdRaw) {
    const row = await oneSong(sql, songIdRaw, 'guitar')
    if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return json({ error: `El MP3 supera ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB.` }, 413)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = extensionForType(file.type || 'audio/mpeg', file.name)
  const key = `songs/${songId}/${Date.now()}.${ext}`
  const stored = await putAudioObject(env, key, bytes, file.type || contentTypeForKey(key))
  return json({ audioUrl: stored.audioUrl, key: stored.key })
}

async function youtubeInfo(user: User, url: URL, env: ApiEnv): Promise<Response> {
  if (user.role === 'viewer') return json({ error: 'Solo quien edita canciones consulta YouTube.' }, 403)
  const link = url.searchParams.get('url')?.trim() ?? ''
  const videoId = youtubeVideoIdFromUrl(link)
  if (!videoId) return json({ error: 'No es un enlace de YouTube válido.' }, 400)
  const hit = (await enrichYoutubeVideo(videoId, env)) ?? {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: '',
    durationMs: null,
    bpm: null,
    via: 'chart' as const,
  }
  return json({
    videoId: hit.videoId,
    url: hit.url,
    title: hit.title,
    durationMs: hit.durationMs,
    bpm: hit.bpm,
    via: hit.via,
    apiKeyPresent: Boolean(env.YOUTUBE_API_KEY?.trim()),
    canExtract: Boolean(env.ALLOW_YT_EXTRACT),
  })
}

async function extractLinkAudio(sql: Sql, user: User, request: Request, env: ApiEnv): Promise<Response> {
  const body = await readJson<{ youtubeUrl?: string; songId?: string }>(request)
  const youtubeUrl = body.youtubeUrl?.trim() ?? ''
  if (!youtubeVideoIdFromUrl(youtubeUrl)) {
    return json({ error: 'No es un enlace de YouTube válido.' }, 400)
  }
  const songIdRaw = body.songId?.trim() ?? ''
  if (songIdRaw) {
    if (!ID_OK.test(songIdRaw)) return json({ error: 'Ese identificador no sirve.' }, 400)
    const row = await oneSong(sql, songIdRaw, 'guitar')
    if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
    if (!canEdit(user, row)) return json({ error: 'No puedes cambiar el audio de esta canción.' }, 403)
  }
  if (!env.ALLOW_YT_EXTRACT) {
    return json(
      {
        blocked: true,
        error:
          'Bloqueado: no hay yt-dlp en este servidor. Corre la extracción en Node con ALLOW_YT_EXTRACT o sube el MP3.',
      },
      501,
    )
  }
  if (!audioStoreReady(env)) {
    return json(
      {
        error:
          'No hay almacén de audio. En Cloudflare enlaza R2 (AUDIO_BUCKET). En local usa data/audio.',
      },
      503,
    )
  }
  try {
    if (!(await ytDlpAvailable())) {
      return json({ blocked: true, error: 'yt-dlp no está instalado en este servidor.' }, 501)
    }
    const stored = await extractYoutubeLinkAudio(env, youtubeUrl, songIdRaw || undefined)
    return json({ audioUrl: stored.audioUrl, key: stored.key })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No pude extraer el audio.' }, 502)
  }
}

async function patchSongMedia(sql: Sql, user: User, id: string, request: Request): Promise<Response> {
  const body = await readJson<{
    durationMs?: number | null
    bpm?: number | null
    audioUrl?: string | null
    selectYoutubeUrl?: string | null
    instrument?: string
  }>(request)
  const instrument = body.instrument && isInstrument(body.instrument) ? body.instrument : DEFAULT_INSTRUMENT
  const row = await oneSong(sql, id, instrument)
  if (!row || !canSee(user, row)) return json({ error: 'No está esta canción.' }, 404)
  const patch = {
    durationMs: body.durationMs !== undefined ? body.durationMs : undefined,
    bpm: body.bpm !== undefined ? body.bpm : undefined,
    audioUrl: body.audioUrl !== undefined ? body.audioUrl : undefined,
    selectYoutubeUrl: body.selectYoutubeUrl !== undefined ? body.selectYoutubeUrl : undefined,
  }
  if (
    patch.durationMs === undefined &&
    patch.bpm === undefined &&
    patch.audioUrl === undefined &&
    patch.selectYoutubeUrl === undefined
  ) {
    return json({ error: 'Nada que actualizar.' }, 400)
  }
  if (canDraft(user, row)) {
    await writeDraft(sql, user, row, instrument, (current) => applyChartMedia(current, patch))
    return json({ song: await songDto(sql, user, row, instrument), parts: await effectiveParts(sql, user, id) })
  }
  if (!canEdit(user, row)) return json({ error: 'Esta copia no es tuya.' }, 403)
  const parts = await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM instrument_parts WHERE song_id = ?`,
    [id],
  )
  if (!parts.length) return json({ error: 'Sin instrument_parts.' }, 500)
  const now = new Date().toISOString()
  let guitarText = row.source_text
  await sql.transaction(async (tx) => {
    for (const part of parts) {
      const nextText = applyChartMedia(part.source_text, patch)
      if (part.instrument === 'guitar') guitarText = nextText
      await tx.run(
        `UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ? AND instrument = ?`,
        [nextText, id, part.instrument],
      )
    }
    const meta = chartMeta(guitarText, id)
    const catalogSource =
      row.origin === 'catalog' ? applyChartMedia(row.catalog_source || row.source_text, patch) : row.catalog_source
    await tx.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?, bpm = ?, duration_ms = ?, audio_url = ?, catalog_source = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [
        meta.title || row.title,
        meta.artist || row.artist,
        meta.composer,
        meta.key || row.key_name,
        meta.source,
        meta.lyrics,
        meta.bpm,
        meta.durationMs,
        meta.audioUrl,
        catalogSource,
        now,
        id,
      ],
    )
  })
  const next = await oneSong(sql, id, instrument)
  if (!next) return json({ error: 'No está esta canción.' }, 404)
  return json({ song: await songDto(sql, user, next, instrument), parts: await partDump(sql, id) })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
