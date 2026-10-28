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

async function signIn(sql: Sql, name: string) {
  const response = await call(sql, '', 'POST', '/api/session', { name })
  assert(response.status === 200, `sign in ${name} ${response.status} ${JSON.stringify(response.data)}`)
  const token = response.data.token
  const user = response.data.user as { id: string; role: string }
  assert(typeof token === 'string', 'token')
  return { token, user }
}

const sql = openSqlite(':memory:')
const files = await readCatalogFiles(root)
assert(files.length >= 30, `catalog files ${files.length}`)
await seedCatalog(sql, files)

const owner = await signIn(sql, 'Jorge Sanchez')
assert(owner.user.role === 'owner', 'jorge is owner')

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

const ana = await signIn(sql, 'Ana Ruiz')
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

const luis = await signIn(sql, 'Luis Mora')
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
await checkPasswords(files)
await checkDeleteSurvivesSeed(files)

console.log(`SQL ok: ${songs.length} catalog songs, copies and instruments checked`)

async function checkDeleteSurvivesSeed(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await signIn(db, 'Jorge Sanchez')
  const reader = await signIn(db, 'Lector Borrar')
  const sample = files[0]
  assert(sample, 'a catalog file to delete')
  const denied = await call(db, reader.token, 'DELETE', `/api/songs/${encodeURIComponent(sample.id)}`)
  assert(denied.status === 403, 'a reader cannot delete a catalog song')
  assert(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id]), 'the song stays after a refused delete')
  const listed = await call(db, boss.token, 'PUT', '/api/setlists', {
    days: [0],
    setlists: [{ id: 'lista-borrar', name: 'Borrar', items: [{ songId: sample.id, semitones: 0 }] }],
  })
  assert(listed.status === 200, 'the song can sit on a list')
  const removed = await call(db, boss.token, 'DELETE', `/api/songs/${encodeURIComponent(sample.id)}`)
  assert(removed.status === 200 && removed.data.hidden === false, `delete removes the row ${JSON.stringify(removed.data)}`)
  assert(!(await db.get(`SELECT id FROM songs WHERE id = ?`, [sample.id])), 'the catalog row is gone')
  assert(await db.get(`SELECT id FROM deleted_songs WHERE id = ?`, [sample.id]), 'the id is remembered')
  const item = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM setlist_items WHERE song_id = ?`, [sample.id])
  assert(Number(item?.n) === 0, 'a deleted song leaves the lists')
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
  const boss = await signIn(db, 'Jorge Sanchez')
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
  const reader = await signIn(db, 'Ana Ruiz')
  const denied = await call(db, reader.token, 'POST', '/api/import-local', {})
  assert(denied.status === 403, 'a reader cannot import')
}

async function checkSeedLists(files: { id: string; sourceText: string }[]) {
  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const boss = await signIn(db, 'Jorge Sanchez')
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

async function checkPasswords(files: { id: string; sourceText: string }[]) {
  const migrated = openSqlite(':memory:')
  await migrated.exec(
    `CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL)`,
  )
  await seedCatalog(migrated, files)
  const columns = await migrated.all<{ name: string }>(`PRAGMA table_info(users)`)
  assert(columns.some((column) => column.name === 'password_hash'), 'old databases gain password_hash')

  const db = openSqlite(':memory:')
  await seedCatalog(db, files)
  const entered = await enter(db, 'Jorge Sanchez')
  assert(entered.status === 200, 'jorge still enters by name')
  const jorge = entered.data.user as { id: string; hasPassword: boolean; role: string }
  const token = entered.data.token as string
  assert(jorge.role === 'owner' && jorge.hasPassword === false, 'jorge has no password')

  const alone = await enter(db, 'Nila Prueba', 'se-ignora')
  assert(alone.status === 200, 'a new name still enters')
  const nila = alone.data.user as { id: string; role: string; hasPassword: boolean }
  assert(nila.role === 'viewer' && nila.hasPassword === false, 'signup ignores a password and stays a viewer')
  const nilaToken = alone.data.token as string
  const again = await enter(db, 'Nila Prueba')
  assert(again.status === 200, 'the new account still enters by name')

  const panel = await call(db, nilaToken, 'GET', '/api/admin')
  assert(panel.status === 403, `viewer admin ${panel.status}`)
  assert(String(panel.data.error).includes('dueño'), 'the refusal names the owner')

  const saved = await call(db, nilaToken, 'PUT', '/api/profile/password', { password: 'secreto-nila' })
  assert(saved.status === 200, `set password ${saved.status} ${JSON.stringify(saved.data)}`)
  assert((saved.data.user as { hasPassword: boolean }).hasPassword === true, 'profile reports a password')
  const stored = await db.get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [nila.id])
  assert(stored?.password_hash.startsWith('pbkdf2$'), 'password is stored as a hash')
  assert(!stored.password_hash.includes('secreto-nila'), 'the plain password is not stored')

  const missing = await enter(db, 'Nila Prueba')
  assert(missing.status === 401 && String(missing.data.error).includes('contraseña'), 'name alone is refused')
  const wrong = await enter(db, 'Nila Prueba', 'no-es')
  assert(wrong.status === 401 && String(wrong.data.error).includes('no es correcta'), 'a wrong password is refused')
  const right = await enter(db, 'Nila Prueba', 'secreto-nila')
  assert(right.status === 200, 'the password enters')
  const cleared = await call(db, right.data.token as string, 'PUT', '/api/profile/password', { password: null })
  assert(cleared.status === 200 && (cleared.data.user as { hasPassword: boolean }).hasPassword === false, 'clear password')
  assert((await enter(db, 'Nila Prueba')).status === 200, 'name alone works after clearing')

  const stuck = await call(db, token, 'PUT', '/api/admin/users/jorge', { role: 'admin' })
  assert(stuck.status === 403, `admin account stays fixed ${stuck.status} ${JSON.stringify(stuck.data)}`)

  const made = await call(db, token, 'POST', '/api/admin/users', { name: 'Ivo Admin', role: 'admin' })
  assert(made.status === 200, `create admin ${made.status} ${JSON.stringify(made.data.error ?? '')}`)
  const ivo = await enter(db, 'Ivo Admin')
  const ivoToken = ivo.data.token as string
  assert((ivo.data.user as { role: string }).role === 'admin', 'ivo is admin')
  const roleBlocked = await call(db, ivoToken, 'PUT', '/api/admin/users/jorge', { role: 'viewer' })
  const passBlocked = await call(db, ivoToken, 'PUT', '/api/admin/users/jorge', { password: 'tomada' })
  const dropBlocked = await call(db, ivoToken, 'DELETE', '/api/admin/users/jorge')
  const crownBlocked = await call(db, ivoToken, 'POST', '/api/admin/users', { name: 'Falso Dueño', role: 'owner' })
  assert(roleBlocked.status === 403 && passBlocked.status === 403 && dropBlocked.status === 403, 'admin cannot touch the owner')
  assert(crownBlocked.status === 403, 'admin cannot name an owner')
  const jorgeStill = await db.get<{ role: string; password_hash: string | null }>(
    `SELECT role, password_hash FROM users WHERE id = 'jorge'`,
  )
  assert(jorgeStill?.role === 'owner' && !jorgeStill.password_hash, 'jorge stays owner without a password')

  const luz = await call(db, token, 'POST', '/api/admin/users', {
    name: 'Luz Lector',
    role: 'viewer',
    password: 'luz-clave',
  })
  assert(luz.status === 200, 'create with password')
  const overview = JSON.stringify(luz.data)
  assert(!overview.includes('pbkdf2') && !overview.includes('luz-clave') && !overview.includes('password_hash'), 'panel hides secrets')
  const people = await call(db, token, 'GET', '/api/users')
  const peopleJson = JSON.stringify(people.data)
  assert(!peopleJson.includes('pbkdf2') && !peopleJson.includes('luz-clave'), 'the people list hides secrets')
  assert((await enter(db, 'Luz Lector')).status === 401, 'created password is required')
  assert((await enter(db, 'Luz Lector', 'luz-clave')).status === 200, 'created password works')

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

  const ottoMade = await call(db, token, 'POST', '/api/admin/users', { name: 'Otto Duenio', role: 'owner' })
  assert(ottoMade.status === 200, 'a second owner can be created')
  const demoted = await call(db, token, 'PUT', '/api/admin/users/jorge', { role: 'admin' })
  assert(demoted.status === 403, `owner cannot change the admin role ${demoted.status} ${JSON.stringify(demoted.data)}`)
  const passBlockedOwner = await call(db, token, 'PUT', '/api/admin/users/jorge', { password: 'clave-admin' })
  assert(passBlockedOwner.status === 403, 'owner cannot change the admin password')
  const selfPass = await call(db, token, 'PUT', '/api/profile/password', { password: 'clave-admin' })
  assert(selfPass.status === 403, 'the admin cannot change their own password')
  const dropAdmin = await call(db, token, 'DELETE', '/api/admin/users/jorge')
  assert(dropAdmin.status === 403, 'the admin cannot be deleted')
  const otto = await enter(db, 'Otto Duenio')
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
  const left = await db.all<{ name: string }>(`SELECT name FROM users`)
  assert(left.length === 1 && left[0]?.name === 'Jorge Sanchez', `only jorge remains, got ${left.map((row) => row.name).join(', ')}`)
  const finalHash = await db.get<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = 'jorge'`)
  assert(!finalHash?.password_hash, 'jorge still has no password')
}

async function enter(sql: Sql, name: string, password?: string) {
  return call(sql, '', 'POST', '/api/session', password ? { name, password } : { name })
}
