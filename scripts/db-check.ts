import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from '../server/app.ts'
import { readCatalogFiles } from '../server/catalog.ts'
import { seedCatalog } from '../server/seed.ts'
import type { Sql } from '../server/sql.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function call(sql: Sql, token: string, method: string, pathname: string, body?: unknown) {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  const response = await handleApi(
    sql,
    new Request(`http://songbook.local${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
  const text = await response.text()
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  return { status: response.status, data }
}

/** Test-only password; real passwords live only in the database. */
const TEST_PASSWORD = 'prueba-1234'

function usernameFor(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
}

/** Signs a person in by name, creating a viewer account first when there is none (the owner gets its test password). */
async function account(db: Sql, name: string) {
  const { hashPassword } = await import('../server/password.ts')
  const hash = await hashPassword(TEST_PASSWORD)
  if (name === 'Jorge Sanchez') {
    await db.run(`UPDATE users SET password_hash = ? WHERE id = 'jorge' AND password_hash IS NULL`, [hash])
    return signIn(db, 'jsanchezch', TEST_PASSWORD)
  }
  const username = usernameFor(name)
  const row = await db.get<{ id: string }>(`SELECT id FROM users WHERE name = ? COLLATE NOCASE`, [name])
  if (!row) {
    await db.run(`INSERT INTO users (id, name, username, role, password_hash) VALUES (?, ?, ?, 'viewer', ?)`, [
      username.replace(/\./g, '-'),
      name,
      username,
      hash,
    ])
  }
  const existing = await db.get<{ username: string }>(`SELECT username FROM users WHERE name = ? COLLATE NOCASE`, [name])
  return signIn(db, existing!.username, TEST_PASSWORD)
}

async function signIn(sql: Sql, username: string, password: string) {
  const response = await call(sql, '', 'POST', '/api/session', { username, password })
  assert(response.status === 200, `sign in ${username} ${response.status} ${JSON.stringify(response.data)}`)
  const token = response.data.token
  const user = response.data.user as { id: string; role: string; username: string; name: string; hasPassword: boolean }
  assert(typeof token === 'string', 'token')
  return { token, user }
}

async function addPerson(
  sql: Sql,
  ownerToken: string,
  body: { name: string; username: string; role?: string; password?: string },
) {
  return call(sql, ownerToken, 'POST', '/api/admin/users', {
    role: 'viewer',
    password: 'clave',
    ...body,
  })
}

async function openAs(
  sql: Sql,
  ownerToken: string,
  body: { name: string; username: string; role?: string; password?: string },
) {
  const password = body.password ?? 'clave'
  const made = await addPerson(sql, ownerToken, { ...body, password })
  assert(made.status === 200, `create ${body.username} ${made.status} ${JSON.stringify(made.data)}`)
  return signIn(sql, body.username, password)
}

const sql = openSqlite(':memory:')
const files = await readCatalogFiles(root)
assert(files.length >= 30, `catalog files ${files.length}`)
await seedCatalog(sql, files)

const owner = await account(sql, 'Jorge Sanchez')
assert(owner.user.role === 'owner', 'jorge is owner')
assert(owner.user.username === 'jsanchezch' && owner.user.name === 'Jorge Sanchez', 'jorge account fields')
assert(owner.user.hasPassword === true, 'jorge has a password')

const listed = await call(sql, owner.token, 'GET', '/api/songs?instrument=guitar')
assert(listed.status === 200, 'list')
const songs = listed.data.songs as { id: string; origin: string; sourceText: string }[]
assert(songs.length >= 30, `listed ${songs.length}`)
const catalog = songs.find((song) => song.origin === 'catalog')
assert(catalog, 'catalog song')
const original = catalog.sourceText

const edited = `${original.trimEnd()}\n{comment: solo guitar}\n`
const put = await call(sql, owner.token, 'PUT', `/api/songs/${encodeURIComponent(catalog.id)}`, {
  sourceText: edited,
  instrument: 'guitar',
  revision: 1,
  partRevision: 1,
})
assert(put.status === 200, `owner edit ${put.status} ${JSON.stringify(put.data)}`)

const bass = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(catalog.id)}?instrument=bass`)
const bassSong = bass.data.song as { sourceText: string }
assert(bass.status === 200, 'bass get')
assert(bassSong.sourceText === original, 'bass stays on the original chart')
const guitar = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(catalog.id)}?instrument=guitar`)
const guitarSong = guitar.data.song as { sourceText: string; diverged: boolean }
assert(guitarSong.sourceText.includes('solo guitar'), 'guitar kept the edit')
assert(guitarSong.diverged === true, 'catalog edit is marked diverged')
const electric = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(catalog.id)}?instrument=electric_guitar`)
const electricSong = electric.data.song as { sourceText: string; instrument: string }
assert(electric.status === 200, 'electric guitar get')
assert(electricSong.instrument === 'electric_guitar', 'electric guitar id')
assert(electricSong.sourceText === original, 'electric guitar starts from the acoustic chart and keeps its own notes')
const openedDefault = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(catalog.id)}`)
assert(
  (openedDefault.data.song as { instrument: string }).instrument === 'electric_guitar',
  'opening without an instrument uses electric guitar',
)

const ana = await openAs(sql, owner.token, { name: 'Ana Ruiz', username: 'ana' })
assert(ana.user.role === 'viewer', 'ana is a viewer')
const denied = await call(sql, ana.token, 'PUT', `/api/songs/${encodeURIComponent(catalog.id)}`, {
  sourceText: `${original}\n{comment: ana}\n`,
  instrument: 'guitar',
})
assert(denied.status === 403, `viewer catalog edit ${denied.status}`)

const copied = await call(sql, ana.token, 'POST', `/api/songs/${encodeURIComponent(catalog.id)}/copy`)
assert(copied.status === 201, `copy ${copied.status} ${JSON.stringify(copied.data)}`)
const copy = copied.data.song as { id: string; origin: string; editable: boolean; ownerId: string; sourceText: string }
assert(copy.origin === 'copy' && copy.editable && copy.ownerId === ana.user.id, 'copy belongs to ana')
const copyGuitar = copy.sourceText

const bassEdit = `${copyGuitar.trimEnd()}\n{comment: solo bajo}\n`
const anaBass = await call(sql, ana.token, 'PUT', `/api/songs/${encodeURIComponent(copy.id)}`, {
  sourceText: bassEdit,
  instrument: 'bass',
  revision: 1,
  partRevision: 1,
})
assert(anaBass.status === 200, `ana bass ${anaBass.status} ${JSON.stringify(anaBass.data)}`)
const copyBass = await call(sql, ana.token, 'GET', `/api/songs/${encodeURIComponent(copy.id)}?instrument=bass`)
const copyGuitarNow = await call(sql, ana.token, 'GET', `/api/songs/${encodeURIComponent(copy.id)}?instrument=guitar`)
assert((copyBass.data.song as { sourceText: string }).sourceText.includes('solo bajo'), 'bass copy changed')
assert((copyGuitarNow.data.song as { sourceText: string }).sourceText === copyGuitar, 'guitar copy unchanged')

const catalogAfter = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(catalog.id)}?instrument=bass`)
assert((catalogAfter.data.song as { sourceText: string }).sourceText === original, 'catalog bass untouched by the copy')

const luis = await openAs(sql, owner.token, { name: 'Luis Mora', username: 'luis' })
const hiddenCopy = await call(sql, luis.token, 'GET', `/api/songs/${encodeURIComponent(copy.id)}?instrument=guitar`)
assert(hiddenCopy.status === 404, 'private copy is hidden from another viewer')
const shared = await call(sql, ana.token, 'POST', `/api/songs/${encodeURIComponent(copy.id)}/share`, { shared: true })
assert(shared.status === 200, 'share')
const opened = await call(sql, luis.token, 'GET', `/api/songs/${encodeURIComponent(copy.id)}?instrument=guitar`)
assert(opened.status === 200, 'shared copy is visible')
const luisCatalog = await call(sql, luis.token, 'PUT', `/api/songs/${encodeURIComponent(catalog.id)}`, {
  sourceText: original,
  instrument: 'piano',
})
assert(luisCatalog.status === 403, 'shared user still cannot edit the catalog')

const lists = await call(sql, ana.token, 'GET', '/api/setlists')
const setlists = lists.data.setlists as { evergreen?: { weekday: number } }[]
assert(setlists.some((list) => list.evergreen?.weekday === 3), 'wednesday service')
assert(setlists.some((list) => list.evergreen?.weekday === 6), 'saturday service')
assert(setlists.some((list) => list.evergreen?.weekday === 0), 'sunday service')
const viewerLists = await call(sql, ana.token, 'PUT', '/api/setlists', { days: [0], setlists: [] })
assert(viewerLists.status === 403, 'viewer cannot replace setlists')

const parts = await sql.all<{ n: number }>(
  `SELECT COUNT(*) AS n FROM instrument_parts WHERE song_id = ?`,
  [catalog.id],
)
assert(Number(parts[0]?.n) === 5, `five instruments, got ${parts[0]?.n}`)

const anaList = await call(sql, ana.token, 'GET', '/api/songs?instrument=guitar')
const anaCatalog = (anaList.data.songs as { id: string; hasCopy: boolean }[]).find((song) => song.id === catalog.id)
assert(anaCatalog?.hasCopy === true, 'the library marks a catalog song when this person has a copy')
const ownerList = await call(sql, owner.token, 'GET', '/api/songs?instrument=guitar')
const ownerCatalog = (ownerList.data.songs as { id: string; hasCopy: boolean }[]).find((song) => song.id === catalog.id)
assert(ownerCatalog?.hasCopy === false, 'the owner does not get Ana’s badge')

const other = songs.find((song) => song.origin === 'catalog' && song.id !== catalog.id) as {
  id: string
  sourceText: string
  revision: number
  partRevision: number
}
assert(other, 'second catalog song')
const lyricLine = other.sourceText.split('\n').find((line) => {
  const trimmed = line.trim()
  return Boolean(trimmed) && !trimmed.startsWith('{') && !trimmed.startsWith('#') && !trimmed.includes('[') && !trimmed.startsWith('>')
})
const chord = other.sourceText.match(/\[[^\]]+\]/)?.[0]
assert(lyricLine && chord, 'lyric and chord to split across instruments')
const sharedText = other.sourceText.replace(lyricLine!, 'Letra compartida de prueba').replace(chord!, '[Xy9]')
const lyricPut = await call(sql, owner.token, 'PUT', `/api/songs/${encodeURIComponent(other.id)}`, {
  sourceText: sharedText,
  instrument: 'guitar',
  revision: other.revision ?? 1,
  partRevision: other.partRevision ?? 1,
})
assert(lyricPut.status === 200, `lyric save ${lyricPut.status} ${JSON.stringify(lyricPut.data)}`)
const sharedBass = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(other.id)}?instrument=bass`)
const sharedBassText = (sharedBass.data.song as { sourceText: string }).sourceText
assert(sharedBassText.includes('Letra compartida de prueba'), 'bass received the lyric')
assert(sharedBassText.includes(chord!), 'bass kept its chord')
assert(!sharedBassText.includes('[Xy9]'), 'the guitar chord did not leak onto bass')
const sharedElectric = await call(
  sql,
  owner.token,
  'GET',
  `/api/songs/${encodeURIComponent(other.id)}?instrument=electric_guitar`,
)
const sharedElectricText = (sharedElectric.data.song as { sourceText: string }).sourceText
assert(sharedElectricText.includes('Letra compartida de prueba'), 'electric guitar received the lyric')
assert(sharedElectricText.includes(chord!), 'electric guitar kept its chord')
assert(!sharedElectricText.includes('[Xy9]'), 'the guitar chord did not leak onto electric guitar')
const sharedGuitar = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(other.id)}?instrument=guitar`)
const sharedGuitarText = (sharedGuitar.data.song as { sourceText: string }).sourceText
assert(sharedGuitarText.includes('[Xy9]') && sharedGuitarText.includes('Letra compartida de prueba'), 'guitar kept both edits')
const stale = await call(sql, owner.token, 'PUT', `/api/songs/${encodeURIComponent(other.id)}`, {
  sourceText: `${other.sourceText.trimEnd()}\n{comment: viejo}\n`,
  instrument: 'guitar',
  revision: other.revision ?? 1,
  partRevision: other.partRevision ?? 1,
})
assert(stale.status === 409, `stale revision ${stale.status} ${JSON.stringify(stale.data)}`)
assert(String(stale.data.error).includes('Recarga'), 'conflict explains the reload')
const kept = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(other.id)}?instrument=guitar`)
const keptText = (kept.data.song as { sourceText: string }).sourceText
assert(keptText.includes('[Xy9]') && !keptText.includes('viejo'), 'the stale save did not replace the song')

await checkImport(files)
await checkSeedLists(files)
await checkDayListHistory(files)
await checkPasswords(files)
await checkDeleteSurvivesSeed(files)
await checkDraftsAndCreators(files)
await checkCreatorBackfill(files)

console.log(`SQL ok: ${songs.length} catalog songs, copies and instruments checked`)

async function checkDraftsAndCreators(files: { id: string; sourceText: string }[]) {
  type Dto = {
    id: string
    title: string
    sourceText: string
    creatorId: string
    editable: boolean
    personal: boolean
    draft: { stale: boolean } | null
    draftUsers: number
    revision: number
    partRevision: number
    durationMs: number | null
  }
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await account(db, 'Jorge Sanchez')
  const ana = await account(db, 'Ana Borrador')
  const luis = await account(db, 'Luis Borrador')
  const sample = files.find((file) => file.sourceText.includes('title'))
  assert(sample, 'catalog file with a title')
  const path = `/api/songs/${encodeURIComponent(sample.id)}`

  const seeded = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs WHERE creator_id IS NULL OR creator_id != 'jorge'`)
  assert(Number(seeded?.n) === 0, 'seeded catalog songs belong to jorge')

  const created = await call(db, ana.token, 'POST', '/api/songs', {
    sourceText: '{title: Canción de Ana}\n{bpm: 90}\n{duration_ms: 180000}\n[G]Hola\n',
  })
  assert(created.status === 201, `a viewer creates a song ${created.status}`)
  const own = created.data.song as Dto
  assert(own.creatorId === ana.user.id && own.editable && !own.personal, 'a new song is the viewer’s own')
  const copied = await call(db, ana.token, 'POST', `${path}/copy`)
  assert((copied.data.song as Dto).creatorId === ana.user.id, 'a copy is created by whoever copies')

  const opened = (await call(db, ana.token, 'GET', `${path}?instrument=guitar`)).data.song as Dto
  assert(opened.creatorId === 'jorge' && !opened.editable && opened.personal && !opened.draft, 'catalog opens as personal')
  const original = opened.sourceText
  const edited = original.replace(/\{title:[^}]*\}|^title:.*$/m, (line) =>
    line.startsWith('{') ? '{title: Versión de Ana}' : 'title: Versión de Ana',
  )
  assert(edited !== original, 'the title line changed')
  const hard = await call(db, ana.token, 'PUT', path, {
    sourceText: edited,
    instrument: 'guitar',
    revision: opened.revision,
    partRevision: opened.partRevision,
  })
  assert(hard.status === 403, 'a viewer still cannot hard-save the catalog')
  const saved = await call(db, ana.token, 'PUT', `${path}/draft`, { sourceText: edited, instrument: 'guitar' })
  assert(saved.status === 200, `draft save ${saved.status} ${JSON.stringify(saved.data)}`)
  const mine = saved.data.song as Dto
  assert(mine.title === 'Versión de Ana' && mine.draft && !mine.draft.stale, 'Ana sees her version')

  const canonical = (await call(db, boss.token, 'GET', `${path}?instrument=guitar`)).data.song as Dto
  assert(canonical.sourceText === original, 'the shared song is untouched')
  assert(canonical.draftUsers === 1 && !canonical.draft, 'admin sees one user version, not as their own')
  const other = (await call(db, luis.token, 'GET', `${path}?instrument=guitar`)).data.song as Dto
  assert(other.sourceText === original && !other.draft, 'another viewer sees the shared song')
  const anaList = await call(db, ana.token, 'GET', '/api/songs?instrument=guitar')
  const listed = (anaList.data.songs as Dto[]).find((song) => song.id === sample.id)
  assert(listed?.title === 'Versión de Ana', 'the library shows Ana her version')

  const media = await call(db, ana.token, 'PUT', `${path}/media`, { durationMs: 123_000, instrument: 'bass' })
  assert(media.status === 200, `viewer media patch ${media.status} ${JSON.stringify(media.data)}`)
  assert((media.data.song as Dto).durationMs === 123_000, 'the duration lands in Ana’s version')
  const bassShared = (await call(db, boss.token, 'GET', `${path}?instrument=bass`)).data.song as Dto
  assert(bassShared.durationMs !== 123_000, 'the shared bass part keeps its duration')

  const deniedList = await call(db, ana.token, 'GET', `${path}/drafts`)
  assert(deniedList.status === 403, 'a viewer cannot list user versions')
  const versions = await call(db, boss.token, 'GET', `${path}/drafts`)
  const drafts = versions.data.drafts as { userId: string; instrument: string; sourceText: string; baseText: string }[]
  assert(versions.status === 200 && drafts.length === 2, `two edited instruments ${JSON.stringify(drafts.map((d) => d.instrument))}`)
  const guitarDraft = drafts.find((draft) => draft.instrument === 'guitar')
  assert(guitarDraft?.userId === ana.user.id && guitarDraft.baseText === original, 'the guitar draft keeps its base')
  assert(
    guitarDraft.sourceText.includes('Versión de Ana') && guitarDraft.sourceText.includes('123000'),
    'the guitar draft keeps Ana’s title and the duration she set',
  )
  const overview = await call(db, boss.token, 'GET', '/api/admin')
  const summary = overview.data.drafts as { songId: string; users: { id: string }[] }[]
  assert(summary.some((item) => item.songId === sample.id && item.users[0]?.id === ana.user.id), 'admin overview lists the version')

  const bossSave = await call(db, boss.token, 'PUT', path, {
    sourceText: `${original.trimEnd()}\n{comment: admin}\n`,
    instrument: 'guitar',
    revision: canonical.revision,
    partRevision: canonical.partRevision,
  })
  assert(bossSave.status === 200, 'admin still hard-saves the catalog')
  const stale = (await call(db, ana.token, 'GET', `${path}?instrument=guitar`)).data.song as Dto
  assert(stale.title === 'Versión de Ana' && stale.draft?.stale === true, 'Ana keeps her version and learns it is behind')

  const discarded = await call(db, ana.token, 'DELETE', `${path}/draft?instrument=guitar`)
  assert(discarded.status === 200 && !(discarded.data.song as Dto).draft, 'Ana discards her version')
  const after = (await call(db, boss.token, 'GET', `${path}/drafts`)).data.drafts as unknown[]
  assert(after.length === 0, 'no versions left')

  const electric = (await call(db, luis.token, 'GET', `${path}?instrument=electric_guitar`)).data.song as Dto
  const asMarkdown = `---\ntitle: Versión de Luis\nbpm: 101\n---\n\n${electric.sourceText.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\{(title|artist|composer|key|bpm|duration_ms|source|audio_url):[^}]*\}\s*$/gim, '')}`
  const luisSave = await call(db, luis.token, 'PUT', `${path}/draft`, { sourceText: asMarkdown, instrument: 'electric_guitar' })
  assert(luisSave.status === 200, `electric draft ${luisSave.status} ${JSON.stringify(luisSave.data)}`)
  const luisList = await call(db, luis.token, 'GET', '/api/songs?instrument=guitar')
  const luisSong = (luisList.data.songs as Dto[]).find((song) => song.id === sample.id)
  assert(luisSong?.title === 'Versión de Luis', `the library (acoustic) shows a title edited on electric ${luisSong?.title}`)
  assert(luisSong.draft && luisSong.sourceText.includes('101'), 'the acoustic part carries the BPM too')
  const removed = await call(db, boss.token, 'DELETE', `${path}/drafts/${encodeURIComponent(luis.user.id)}`)
  assert(removed.status === 200 && (removed.data.drafts as unknown[]).length === 0, 'admin discards a user version')
}

async function checkCreatorBackfill(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const ana = await account(db, 'Ana Antigua')
  const made = await call(db, ana.token, 'POST', '/api/songs', { sourceText: '{title: Vieja}\n[C]Hola\n' })
  const id = (made.data.song as { id: string }).id
  await db.run(`UPDATE songs SET creator_id = NULL`)
  await seedCatalog(db, files)
  const wrong = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM songs WHERE origin = 'catalog' AND creator_id IS NOT 'jorge'`,
  )
  assert(Number(wrong?.n) === 0, 'backfill gives the catalog to jorge')
  const own = await db.get<{ creator_id: string }>(`SELECT creator_id FROM songs WHERE id = ?`, [id])
  assert(own?.creator_id === ana.user.id, 'backfill keeps a person’s own song with them')
}

async function checkDeleteSurvivesSeed(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await account(db, 'Jorge Sanchez')
  const reader = await openAs(db, boss.token, { name: 'Lector Borrar', username: 'lector-borrar' })
  const sample = files[0]
  assert(sample, 'a catalog file to delete')
  const denied = await call(db, reader.token, 'DELETE', `/api/songs/${encodeURIComponent(sample.id)}`)
  assert(denied.status === 403, 'a reader cannot delete a catalog song')
  assert(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id]), 'the song stays after a refused delete')
  const listed = await call(db, boss.token, 'PUT', '/api/setlists', {
    days: [0],
    setlists: [{ id: 'lista-borrar', name: 'Borrar', items: [{ songId: sample.id, semitones: 0 }] }],
    history: [{ weekday: 0, serviceDate: '2026-10-19', items: [{ songId: sample.id, semitones: 1 }] }],
  })
  assert(listed.status === 200, 'the song can sit on a list and historial')
  const removed = await call(db, boss.token, 'DELETE', `/api/songs/${encodeURIComponent(sample.id)}`)
  assert(removed.status === 200 && removed.data.hidden === false, `delete removes the row ${JSON.stringify(removed.data)}`)
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id])), 'the catalog row is gone')
  assert(await db.get(`SELECT id FROM deleted_songs WHERE id = ?`, [sample.id]), 'the id is remembered')
  const item = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM setlist_items WHERE song_id = ?`, [sample.id])
  assert(Number(item?.n) === 0, 'a deleted song leaves the lists')
  const historyItem = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM day_list_history_items WHERE song_id = ?`,
    [sample.id],
  )
  assert(Number(historyItem?.n) === 0, 'a deleted song leaves historial')
  const parts = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM instrument_parts WHERE song_id = ?`, [sample.id])
  assert(Number(parts?.n) === 0, 'parts go with the song')
  await seedCatalog(db, files)
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id])), 'a reseed does not restore the song')
  const posted = await call(db, boss.token, 'POST', '/api/catalog', {
    songs: [{ id: sample.id, sourceText: sample.sourceText }],
  })
  assert(posted.status === 200, 'catalog post still answers')
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id])), 'a catalog file does not restore the song')
  const missing = await call(db, boss.token, 'GET', `/api/songs/${encodeURIComponent(sample.id)}?instrument=guitar`)
  assert(missing.status === 404, 'the deleted song stays missing')
}

async function checkImport(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await account(db, 'Jorge Sanchez')
  const changed = await call(db, boss.token, 'PUT', '/api/setlists', {
    days: [1],
    setlists: [{ id: 'lista-x', name: 'Ensayo', items: [{ songId: 'a', semitones: 0 }] }],
  })
  assert(changed.status === 200, 'owner can edit lists')
  const sample = files[0]
  const hidden = files[1]
  assert(sample && hidden, 'two catalog files')
  const imported = await call(db, boss.token, 'POST', '/api/import-local', {
    overrides: { [sample.id]: `${sample.sourceText.trimEnd()}\n{comment: importada}\n` },
    hidden: [hidden.id],
    created: {
      'propia-importada': '{title: Propia}\n{key: C}\n\n{start_of_verse: Verso}\n[C]\nHola\n{end_of_verse}\n',
    },
    hasLists: true,
    days: [2],
    setlists: [],
    semitones: { a: 2 },
    chordShapes: { a: { C: 'barre' } },
  })
  assert(imported.status === 200 && imported.data.skipped === false, `import ${JSON.stringify(imported.data)}`)
  assert(imported.data.lists === 'kept', 'edited lists stay')
  const daysNow = await call(db, boss.token, 'GET', '/api/setlists')
  assert((daysNow.data.days as number[]).includes(1), 'service days were not replaced')
  const bass = await call(db, boss.token, 'GET', `/api/songs/${encodeURIComponent(sample.id)}?instrument=bass`)
  assert((bass.data.song as { sourceText: string }).sourceText.includes('importada'), 'override reached every part')
  const createdSong = await call(db, boss.token, 'GET', '/api/songs/propia-importada?instrument=piano')
  assert((createdSong.data.song as { origin: string }).origin === 'catalog', 'a created song joins the catalog')
  const hiddenRow = await db.get<{ hidden: number }>(`SELECT hidden FROM songs WHERE id = ?`, [hidden.id])
  assert(Number(hiddenRow?.hidden) === 1, 'a hidden local song stays archived')
  const prefs = await call(db, boss.token, 'GET', '/api/prefs')
  const stored = prefs.data.prefs as { semitones: { a: number }; chordShapes: { a: { C: string } } }
  assert(stored.semitones.a === 2 && stored.chordShapes.a.C === 'barre', 'owner prefs were stored')
  const again = await call(db, boss.token, 'POST', '/api/import-local', {
    overrides: { [sample.id]: '{title: Otra}\n[C]\nNo\n' },
    hidden: [],
    created: {},
    hasLists: false,
    semitones: { a: 9 },
    chordShapes: {},
  })
  assert(again.data.skipped === true, 'import does not run twice')
  const still = await call(db, boss.token, 'GET', `/api/songs/${encodeURIComponent(sample.id)}?instrument=guitar`)
  assert((still.data.song as { sourceText: string }).sourceText.includes('importada'), 'a second import does not wipe newer charts')
  const prefsStill = await call(db, boss.token, 'GET', '/api/prefs')
  assert((prefsStill.data.prefs as { semitones: { a: number } }).semitones.a === 2, 'a second import does not wipe prefs')
  const reader = await openAs(db, boss.token, { name: 'Ana Ruiz', username: 'ana-import' })
  const denied = await call(db, reader.token, 'POST', '/api/import-local', {})
  assert(denied.status === 403, 'a reader cannot import')
}

async function checkSeedLists(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await account(db, 'Jorge Sanchez')
  const imported = await call(db, boss.token, 'POST', '/api/import-local', {
    overrides: {},
    hidden: [],
    created: {},
    hasLists: true,
    days: [1, 5],
    setlists: [{ id: 'servicio-1', name: 'Lunes', items: [], evergreen: { weekday: 1, serviceDate: null } }],
    semitones: {},
    chordShapes: {},
  })
  assert(imported.data.lists === 'imported', `seed lists ${JSON.stringify(imported.data)}`)
  const lists = await call(db, boss.token, 'GET', '/api/setlists')
  const days = lists.data.days as number[]
  assert(days.includes(1) && days.includes(5) && !days.includes(3), `seed lists replaced ${days.join()}`)
}

async function checkDayListHistory(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await account(db, 'Jorge Sanchez')
  const before = await call(db, boss.token, 'GET', '/api/setlists')
  assert(Array.isArray(before.data.history) && (before.data.history as unknown[]).length === 0, 'history starts empty')
  const saved = await call(db, boss.token, 'PUT', '/api/setlists', {
    days: [6, 0],
    setlists: [
      {
        id: 'servicio-6',
        name: 'Servicio del próximo sábado',
        items: [{ songId: 'nueva', semitones: 0 }],
        evergreen: { weekday: 6, serviceDate: '2026-10-24' },
      },
    ],
    history: [
      {
        weekday: 6,
        serviceDate: '2026-10-17',
        items: [
          { songId: 'a', semitones: 0 },
          { songId: 'b', semitones: 2 },
        ],
      },
      { weekday: 9, serviceDate: '2026-10-18', items: [{ songId: 'no', semitones: 0 }] },
      { weekday: 0, serviceDate: '2026-10-18', items: [] },
      {
        weekday: 0,
        serviceDate: '2026-10-18',
        items: [{ songId: 'c', semitones: -1 }],
      },
    ],
  })
  assert(saved.status === 200, `history save ${saved.status} ${JSON.stringify(saved.data)}`)
  const history = saved.data.history as { id: string; serviceDate: string; items: { songId: string; semitones: number }[] }[]
  assert(history.length === 2, `two closed lists, got ${history.length}`)
  assert(history[0]?.id === 'historial-6-2026-10-17' && history[0].serviceDate === '2026-10-17', 'history keeps that Saturday')
  assert(history[0].items.map((item) => `${item.songId}:${item.semitones}`).join() === 'a:0,b:2', 'history keeps song order')
  assert(history[1]?.serviceDate === '2026-10-18' && history[1].items[0]?.songId === 'c', 'sunday history stays second')
  const loaded = await call(db, boss.token, 'GET', '/api/setlists')
  const again = loaded.data.history as typeof history
  assert(again[0]?.items.map((item) => item.songId).join() === 'a,b', 'history reloads in order')
  const kept = await call(db, boss.token, 'PUT', '/api/setlists', {
    days: [6],
    setlists: [
      {
        id: 'servicio-6',
        name: 'Servicio del próximo sábado',
        items: [],
        evergreen: { weekday: 6, serviceDate: '2026-10-24' },
      },
    ],
  })
  const still = kept.data.history as typeof history
  assert(still.length === 2 && still[0]?.serviceDate === '2026-10-17', 'a save without history leaves the closed lists')
}

async function checkPasswords(files: { id: string; sourceText: string }[]) {
  const migrated = openSqlite(':memory:')
  await migrated.exec(
    `CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL)`,
  )
  await seedCatalog(migrated, files)
  const columns = await migrated.all<{ name: string }>(`PRAGMA table_info(users)`)
  assert(columns.some((column) => column.name === 'password_hash'), 'old databases gain password_hash')
  assert(columns.some((column) => column.name === 'username'), 'old databases gain username')
  const migratedOwner = await migrated.get<{ username: string; password_hash: string | null }>(
    `SELECT username, password_hash FROM users WHERE id = 'jorge'`,
  )
  // The password is never in the code: a fresh owner has none until db:set-password writes one.
  assert(migratedOwner?.username === 'jsanchezch' && migratedOwner.password_hash == null, 'migration seeds jorge without a password')

  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const locked = await enter(db, 'jsanchezch', TEST_PASSWORD)
  assert(locked.status === 401, 'an owner without a password cannot enter')
  const { hashPassword } = await import('../server/password.ts')
  await db.run(`UPDATE users SET password_hash = ? WHERE username = 'jsanchezch'`, [await hashPassword(TEST_PASSWORD)])
  const entered = await enter(db, 'jsanchezch', TEST_PASSWORD)
  assert(entered.status === 200, 'jorge enters with username and password')
  const jorge = entered.data.user as {
    id: string
    hasPassword: boolean
    role: string
    username: string
    name: string
  }
  const token = entered.data.token as string
  assert(jorge.role === 'owner' && jorge.hasPassword === true, 'jorge is owner with a password')
  assert(jorge.username === 'jsanchezch' && jorge.name === 'Jorge Sanchez', 'jorge fields')

  const guest = await enter(db, 'cualquiera', 'lo-que-sea')
  assert(guest.status === 401, 'unknown users are refused')
  const nameOnly = await enter(db, 'jsanchezch')
  assert(nameOnly.status === 401, 'password is required')
  const wrongOwner = await enter(db, 'jsanchezch', '0000')
  assert(wrongOwner.status === 401, 'a wrong password is refused')
  for (let tries = 0; tries < 4; tries++) await enter(db, 'jsanchezch', `mal-${tries}`)
  const lockedOut = await enter(db, 'jsanchezch', TEST_PASSWORD)
  assert(lockedOut.status === 429, `five wrong tries lock the username ${lockedOut.status}`)
  await db.run(`DELETE FROM login_failures`)
  const back = await enter(db, 'jsanchezch', TEST_PASSWORD)
  assert(back.status === 200, 'the lock lifts once the window passes')
  const failuresLeft = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM login_failures`)
  assert(Number(failuresLeft?.n) === 0, 'a good login clears the failures')
  const byDisplayName = await call(db, '', 'POST', '/api/session', {
    name: 'Jorge Sanchez',
    password: TEST_PASSWORD,
  })
  assert(byDisplayName.status === 400 || byDisplayName.status === 401, 'display name alone is not a username')

  const nilaMade = await addPerson(db, token, {
    name: 'Nila Prueba',
    username: 'nila',
    password: 'secreto-nila',
  })
  assert(nilaMade.status === 200, `create nila ${nilaMade.status} ${JSON.stringify(nilaMade.data)}`)
  const nilaEnter = await enter(db, 'nila', 'secreto-nila')
  assert(nilaEnter.status === 200, 'nila enters')
  const nila = nilaEnter.data.user as { id: string; role: string; hasPassword: boolean; username: string }
  assert(nila.role === 'viewer' && nila.hasPassword === true && nila.username === 'nila', 'nila account')
  const nilaToken = nilaEnter.data.token as string

  const panel = await call(db, nilaToken, 'GET', '/api/admin')
  assert(panel.status === 403, `viewer admin ${panel.status}`)
  assert(String(panel.data.error).includes('dueño'), 'the refusal names the owner')

  const saved = await call(db, nilaToken, 'PUT', '/api/profile/password', { password: 'otra-nila' })
  assert(saved.status === 200, `set password ${saved.status} ${JSON.stringify(saved.data)}`)
  assert((saved.data.user as { hasPassword: boolean }).hasPassword === true, 'profile reports a password')
  const stored = await db.get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [nila.id])
  assert(stored?.password_hash.startsWith('pbkdf2$'), 'password is stored as a hash')
  assert(!stored.password_hash.includes('otra-nila'), 'the plain password is not stored')
  assert((await enter(db, 'nila', 'secreto-nila')).status === 401, 'the old password stops working')
  assert((await enter(db, 'nila', 'otra-nila')).status === 200, 'the new password enters')
  const cleared = await call(db, nilaToken, 'PUT', '/api/profile/password', { password: null })
  assert(cleared.status === 400, 'password cannot be cleared')

  const stuck = await call(db, token, 'PUT', '/api/admin/users/jorge', { role: 'admin' })
  assert(stuck.status === 403, `admin account stays fixed ${stuck.status} ${JSON.stringify(stuck.data)}`)

  const made = await addPerson(db, token, {
    name: 'Ivo Admin',
    username: 'ivo',
    role: 'admin',
    password: 'ivo-clave',
  })
  assert(made.status === 200, `create admin ${made.status} ${JSON.stringify(made.data.error ?? '')}`)
  const ivo = await enter(db, 'ivo', 'ivo-clave')
  const ivoToken = ivo.data.token as string
  assert((ivo.data.user as { role: string }).role === 'admin', 'ivo is admin')
  const roleBlocked = await call(db, ivoToken, 'PUT', '/api/admin/users/jorge', { role: 'viewer' })
  const passBlocked = await call(db, ivoToken, 'PUT', '/api/admin/users/jorge', { password: 'tomada' })
  const dropBlocked = await call(db, ivoToken, 'DELETE', '/api/admin/users/jorge')
  const crownBlocked = await addPerson(db, ivoToken, {
    name: 'Falso Dueño',
    username: 'falso',
    role: 'owner',
    password: 'falso',
  })
  assert(roleBlocked.status === 403 && passBlocked.status === 403 && dropBlocked.status === 403, 'admin cannot touch the owner')
  assert(crownBlocked.status === 403, 'admin cannot name an owner')
  const jorgeStill = await db.get<{ role: string; username: string; password_hash: string | null }>(
    `SELECT role, username, password_hash FROM users WHERE id = 'jorge'`,
  )
  assert(
    jorgeStill?.role === 'owner' && jorgeStill.username === 'jsanchezch' && jorgeStill.password_hash?.startsWith('pbkdf2$'),
    'jorge stays owner with credentials',
  )

  const luz = await addPerson(db, token, {
    name: 'Luz Lector',
    username: 'luz',
    role: 'viewer',
    password: 'luz-clave',
  })
  assert(luz.status === 200, 'create with password')
  const overview = JSON.stringify(luz.data)
  assert(!overview.includes('pbkdf2') && !overview.includes('luz-clave') && !overview.includes('password_hash'), 'panel hides secrets')
  const people = await call(db, token, 'GET', '/api/users')
  const peopleJson = JSON.stringify(people.data)
  assert(!peopleJson.includes('pbkdf2') && !peopleJson.includes('luz-clave'), 'the people list hides secrets')
  assert((await enter(db, 'luz')).status === 401, 'created password is required')
  assert((await enter(db, 'luz', 'luz-clave')).status === 200, 'created password works')
  const noPass = await addPerson(db, token, { name: 'Sin Clave', username: 'sinclave', password: '' })
  assert(noPass.status === 400, 'create requires a password')

  const catalogBefore = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs WHERE origin = 'catalog'`)
  const songs = await call(db, nilaToken, 'GET', '/api/songs?instrument=guitar')
  const catalog = (songs.data.songs as { id: string; origin: string }[]).find((song) => song.origin === 'catalog')
  assert(catalog, 'catalog song for copies')
  const privateCopy = await call(db, nilaToken, 'POST', `/api/songs/${encodeURIComponent(catalog.id)}/copy`)
  await new Promise((resolve) => setTimeout(resolve, 5))
  const sharedCopy = await call(db, nilaToken, 'POST', `/api/songs/${encodeURIComponent(catalog.id)}/copy`)
  assert(privateCopy.status === 201 && sharedCopy.status === 201, 'nila has two copies')
  const privateId = (privateCopy.data.song as { id: string }).id
  const sharedId = (sharedCopy.data.song as { id: string }).id
  assert(privateId !== sharedId, 'the copies are distinct')
  const shared = await call(db, nilaToken, 'POST', `/api/songs/${encodeURIComponent(sharedId)}/share`, { shared: true })
  assert(shared.status === 200, 'share the second copy')
  const created = await call(db, nilaToken, 'POST', '/api/songs', {
    sourceText: '{title: Propia de Nila}\n\n[C]\nHola\n',
  })
  assert(created.status === 201, `own song ${created.status}`)
  const createdId = (created.data.song as { id: string }).id
  const lists = await call(db, token, 'PUT', '/api/setlists', {
    days: [0],
    setlists: [{ id: 'lista-nila', name: 'Nila', items: [{ songId: privateId, semitones: 0 }] }],
  })
  assert(lists.status === 200, 'private copy can sit on a list')

  const removed = await call(db, token, 'DELETE', `/api/admin/users/${encodeURIComponent(nila.id)}`)
  assert(removed.status === 200, `remove nila ${removed.status} ${JSON.stringify(removed.data.error ?? '')}`)
  const catalogAfter = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM songs WHERE origin = 'catalog'`)
  assert(Number(catalogBefore?.n) === Number(catalogAfter?.n) && Number(catalogAfter?.n) >= 30, 'catalog songs stay')
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [privateId])), 'private copy is deleted')
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [createdId])), 'private song is deleted')
  const kept = await db.get<{ owner_id: string; shared: number }>(`SELECT owner_id, shared FROM songs WHERE id = ?`, [sharedId])
  assert(kept?.owner_id === 'jorge' && Number(kept.shared) === 1, 'shared copy moves to the owner')
  const item = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM setlist_items WHERE song_id = ?`, [privateId])
  assert(Number(item?.n) === 0, 'a deleted copy leaves the lists')
  const opened = await call(db, token, 'GET', `/api/songs/${encodeURIComponent(sharedId)}?instrument=guitar`)
  assert(opened.status === 200, 'the kept copy still opens')

  const ottoMade = await addPerson(db, token, {
    name: 'Otto Duenio',
    username: 'otto',
    role: 'owner',
    password: 'otto-clave',
  })
  assert(ottoMade.status === 200, 'a second owner can be created')
  const demoted = await call(db, token, 'PUT', '/api/admin/users/jorge', { role: 'admin' })
  assert(demoted.status === 403, `owner cannot change the admin role ${demoted.status} ${JSON.stringify(demoted.data)}`)
  const passBlockedOwner = await call(db, token, 'PUT', '/api/admin/users/jorge', { password: 'clave-admin' })
  assert(passBlockedOwner.status === 403, 'owner cannot change the admin password')
  const selfPass = await call(db, token, 'PUT', '/api/profile/password', { password: 'clave-admin' })
  assert(selfPass.status === 403, 'the admin cannot change their own password')
  const dropAdmin = await call(db, token, 'DELETE', '/api/admin/users/jorge')
  assert(dropAdmin.status === 403, 'the admin cannot be deleted')
  const otto = await enter(db, 'otto', 'otto-clave')
  const restored = await call(db, otto.data.token as string, 'PUT', '/api/admin/users/jorge', { role: 'viewer' })
  assert(restored.status === 403, 'another owner cannot change the admin')
  const stillOwner = await call(db, token, 'DELETE', `/api/admin/users/${encodeURIComponent((otto.data.user as { id: string }).id)}`)
  assert(stillOwner.status === 403, 'an owner is not deleted')
  const stepped = await call(db, token, 'PUT', `/api/admin/users/${encodeURIComponent((otto.data.user as { id: string }).id)}`, {
    role: 'viewer',
  })
  assert(stepped.status === 200, 'the extra owner can be demoted')
  const dropped = await call(db, token, 'DELETE', `/api/admin/users/${encodeURIComponent((otto.data.user as { id: string }).id)}`)
  assert(dropped.status === 200, 'a demoted owner can be removed')

  for (const name of ['Ivo Admin', 'Luz Lector']) {
    const row = await db.get<{ id: string }>(`SELECT id FROM users WHERE name = ?`, [name])
    assert(row, name)
    const gone = await call(db, token, 'DELETE', `/api/admin/users/${encodeURIComponent(row.id)}`)
    assert(gone.status === 200, `remove ${name}`)
  }
  const left = await db.all<{ name: string; username: string }>(`SELECT name, username FROM users`)
  assert(left.length === 1 && left[0]?.name === 'Jorge Sanchez', `only jorge remains, got ${left.map((row) => row.name).join(', ')}`)
  assert(left[0]?.username === 'jsanchezch', 'jorge keeps username')
  const finalHash = await db.get<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = 'jorge'`)
  assert(finalHash?.password_hash?.startsWith('pbkdf2$'), 'jorge still has a password')
  assert((await enter(db, 'jsanchezch', TEST_PASSWORD)).status === 200, 'jorge still enters with his password')
}

{
  const { applyChartMedia } = await import('../server/chartMedia.ts')
  const owner = await account(sql, 'Jorge Sanchez')
  // Every catalog chart ships with YouTube now; take it off one so backfill has work.
  const bare = await sql.get<{ id: string; catalog_source: string }>(
    `SELECT id, catalog_source FROM songs WHERE origin = 'catalog' AND hidden = 0 ORDER BY id LIMIT 1`,
  )
  assert(bare, 'a catalog song to strip')
  await sql.run(`UPDATE songs SET catalog_source = ? WHERE id = ?`, [
    applyChartMedia(bare.catalog_source, { youtubeUrl: null }),
    bare.id,
  ])
  for (const part of await sql.all<{ instrument: string; source_text: string }>(
    `SELECT instrument, source_text FROM instrument_parts WHERE song_id = ?`,
    [bare.id],
  )) {
    await sql.run(`UPDATE instrument_parts SET source_text = ? WHERE song_id = ? AND instrument = ?`, [
      applyChartMedia(part.source_text, { youtubeUrl: null }),
      bare.id,
      part.instrument,
    ])
  }
  const status = await call(sql, owner.token, 'GET', '/api/admin/media-backfill')
  assert(status.status === 200, `media backfill status ${status.status}`)
  assert(typeof status.data.missingBefore === 'number' && (status.data.missingBefore as number) > 0, 'songs missing youtube')
  assert(status.data.apiKeyPresent === false, 'no youtube key in test env')
  const viewer = await account(sql, 'Nila Backfill')
  const denied = await call(sql, viewer.token, 'POST', '/api/admin/media-backfill', { dryRun: true, limit: 1 })
  assert(denied.status === 403, 'viewer cannot backfill')

  const sample = await sql.get<{ id: string; source_text: string; catalog_source: string }>(
    `SELECT s.id, p.source_text, s.catalog_source
     FROM songs s
     JOIN instrument_parts p ON p.song_id = s.id AND p.instrument = 'guitar'
     WHERE s.origin = 'catalog' AND p.source_text NOT LIKE '%youtu%'
     LIMIT 1`,
  )
  assert(sample, 'catalog sample without youtube')
  const patched = applyChartMedia(sample.source_text, {
    youtubeUrl: 'https://www.youtube.com/watch?v=backfilltest1',
    bpm: 96,
    durationMs: 201_000,
  })
  await sql.transaction(async (tx) => {
    await tx.run(`UPDATE instrument_parts SET source_text = ?, revision = revision + 1 WHERE song_id = ?`, [
      patched,
      sample.id,
    ])
    await tx.run(
      `UPDATE songs SET bpm = ?, duration_ms = ?, catalog_source = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
      [96, 201_000, applyChartMedia(sample.catalog_source || sample.source_text, {
        youtubeUrl: 'https://www.youtube.com/watch?v=backfilltest1',
        bpm: 96,
        durationMs: 201_000,
      }), new Date().toISOString(), sample.id],
    )
  })
  const got = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(sample.id)}?instrument=guitar`)
  assert(got.status === 200, 'fetch patched song')
  const song = got.data.song as { bpm: number; durationMs: number; sourceText: string }
  assert(song.bpm === 96 && song.durationMs === 201_000, 'dto carries bpm and duration')
  assert(song.sourceText.includes('backfilltest1') && song.sourceText.includes('bpm: 96'), 'chart text carries media for playback')
  const after = await call(sql, owner.token, 'GET', '/api/admin/media-backfill')
  assert(
    (after.data.missingBefore as number) < (status.data.missingBefore as number),
    'missing youtube count drops after chart write',
  )

  const playback = { youtube: { src: 'backfilltest1', introMs: 4000, parts: { verso: 20_000 } } }
  const before = await sql.get<{ revision: number }>(`SELECT revision FROM songs WHERE id = ?`, [sample.id])
  const saved = await call(sql, owner.token, 'PUT', `/api/songs/${encodeURIComponent(sample.id)}/playback`, { playback })
  assert(saved.status === 200, `owner saves playback ${saved.status}`)
  const kept = await sql.get<{ revision: number }>(`SELECT revision FROM songs WHERE id = ?`, [sample.id])
  assert(kept?.revision === before?.revision, 'saving playback leaves the revision alone')
  const reread = await call(sql, owner.token, 'GET', `/api/songs/${encodeURIComponent(sample.id)}?instrument=guitar`)
  assert(JSON.stringify((reread.data.song as { playback: unknown }).playback) === JSON.stringify(playback), 'dto carries playback')
  const blocked = await call(sql, viewer.token, 'PUT', `/api/songs/${encodeURIComponent(sample.id)}/playback`, { playback: {} })
  assert(blocked.status === 403, `viewer cannot save catalog playback ${blocked.status}`)
}

async function enter(sql: Sql, username: string, password?: string) {
  return call(sql, '', 'POST', '/api/session', password ? { username, password } : { username })
}
