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
assert(Number(parts[0]?.n) === 4, `four instruments, got ${parts[0]?.n}`)

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

console.log(`SQL ok: ${songs.length} catalog songs, copies and instruments checked`)

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
      'propia-importada': '{title: Propia}\n{key: C}\n\n{start_of_verse: Estrofa}\n[C]\nHola\n{end_of_verse}\n',
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
