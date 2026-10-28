import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatChord, transposeKeyName } from '../src/lib/chords.ts'
import { blocksFor, partKind } from '../src/lib/display.ts'
import { diagramFor, shapesFor } from '../src/lib/guitar.ts'
import { chartToCho, chartToSongMd, isBlockedPage, isPlainChordLine, songToMarkdown, wrapPlainChordLine } from '../src/lib/importChart.ts'
import { shareLyrics } from '../server/lyrics.ts'
import { nextServiceDate, planEvergreenAdd, serviceListName } from '../src/lib/setlists.ts'
import { can, currentUser, roleLabel } from '../src/lib/access.ts'
import { parseChart } from '../src/lib/parseChart.ts'
import { distinctMarks, songIconIndex, songMarkTone, SONG_ICON_SHAPES, SONG_MARK_HUES } from '../src/lib/songMark.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parentCharts = path.resolve(root, '..')
const bundledCharts = path.join(root, 'public', 'songs', 'charts')
const charts = (await readdir(parentCharts).catch(() => [] as string[])).some((name) =>
  /\.(cho|chopro)$/i.test(name),
)
  ? parentCharts
  : bundledCharts

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const hosanna = parseChart(
  await readFile(path.join(charts, 'Hosanna - Hillsong en Español.cho'), 'utf8'),
  'Hosanna - Hillsong en Español.cho',
)
assert(hosanna.title === 'Hosanna', 'hosanna title')
assert(hosanna.key === 'E', 'hosanna key')
assert(hosanna.sections.length >= 5, 'hosanna sections')
assert(
  hosanna.sections.some((section) => section.lines.some((line) => line.lyric?.includes('Hosan'))),
  'hosanna lyric',
)

assert(formatChord('E/G#', 'E', 0, 'degrees') === '1/3', 'degree slash')
assert(formatChord('C#m7(11)', 'E', 0, 'degrees') === '6m11', 'degree extension')
assert(formatChord('G#4', 'E', 0, 'degrees') === '3sus4', 'degree sus')
assert(formatChord('E7M(9)', 'E', 0, 'degrees') === '1maj9', 'degree maj9')
assert(formatChord('Bb', 'F', 0, 'degrees') === '4', 'degree Bb in F')
assert(formatChord('C9', 'G', 0, 'degrees') === '4(9)', 'degree plain number')
assert(formatChord('E', 'E', 2, 'letters') === 'F#', 'transpose E up 2')
assert(transposeKeyName('E', 2) === 'F#', 'key E up 2')
assert(transposeKeyName('F', -1) === 'E', 'key F down 1')
assert(formatChord('E/G#', 'E', 2, 'degrees') === '1/3', 'degrees stay when transposed')
assert(formatChord('D5', 'D', 0, 'both') === '1(D5)', 'both shows degree(chord)')
assert(formatChord('G', 'D', 0, 'both') === '4(G)', 'both fourth')
assert(formatChord('E/G#', 'E', 0, 'both') === '1/3(E/G#)', 'both slash')
assert(formatChord('C#m7(11)', 'E', 0, 'both') === '6(C#m7(11))', 'both keeps the chord quality')
assert(formatChord('C9', 'G', 0, 'both') === '4(C9)', 'both leaves a numbered quality on the chord')
assert(formatChord('E', 'E', 2, 'both') === '1(F#)', 'both keeps the degree and transposes the chord')
assert(formatChord('E/G#', 'E', 2, 'both') === '1/3(F#/A#)', 'both slash transposes only the chord')

const santo = parseChart(
  await readFile(path.join(charts, 'Santo Por Siempre.chopro'), 'utf8'),
  'Santo Por Siempre.chopro',
)
const verse = santo.sections.find((section) => section.label === 'Verse 1')
assert(verse, 'santo verse')
assert(
  verse!.notes.some((note) => note.type === 'arrange' && note.text.includes('Guitar')),
  'guitar out is an arrangement note on the verse',
)
assert(
  santo.sections.some((section) =>
    section.lines.some((line) =>
      line.chords.some((chord) => chord.notes.some((note) => note.type === 'how')),
    ),
  ),
  'descending arpeggio is a how-to note',
)

const welcome = parseChart(
  await readFile(path.join(charts, 'Bienvenido Espíritu Santo.chopro'), 'utf8'),
  'Bienvenido.chopro',
)
const verso = welcome.sections.find((section) => section.label === 'VERSO')
assert(verso?.repeat === 2, `verso repeat, got ${verso?.repeat}`)

const markdown = parseChart(
  await readFile(path.join(root, 'content/_plantilla.song.md'), 'utf8'),
  'content/_plantilla.song.md',
)
assert(markdown.versions.length === 2, 'markdown versions')
assert(markdown.sources.length >= 1, 'plantilla sources list')
assert(markdown.sources[0]?.url.includes('youtube.com'), 'plantilla youtube source')

for (const name of ['raise-a-hallelujah', 'living-hope', 'digno-es-el-senor']) {
  const song = parseChart(
    await readFile(path.join(root, `content/${name}.song.md`), 'utf8'),
    `content/${name}.song.md`,
  )
  assert(song.title.trim(), `${name} title`)
  assert(song.key.trim(), `${name} key`)
  assert(song.sources.length >= 1, `${name} sources`)
  assert(song.sources.every((item) => item.url.startsWith('http')), `${name} source urls`)
  assert(song.sections.length >= 2, `${name} sections`)
}
const blocks = blocksFor(markdown, markdown.versions[0]?.flow ?? null)
assert(blocks.some((block) => block.repeat >= 2) || markdown.sections.some((section) => section.sameAs), 'same section')
const only = blocksFor(markdown, ['coro-2'])
assert(only[0] && only[0].section.lines.length > 0, 'same= copies the chorus')
assert(only[0].repeat === 2, 'repeat badge')
const collapsed = blocksFor(markdown, ['coro', 'coro-2'])
assert(collapsed.length === 1, 'adjacent chorus collapses')
assert(collapsed[0]?.repeat === 3, 'repeat counts add')
assert(partKind('Coro') === 'chorus' && partKind('Chorus x2') === 'chorus', 'chorus x2 is the same kind')
assert(partKind('Verso') === 'verse' && partKind('Estrofa 2') === 'verse', 'estrofa folds as a verso')
const chorusPair = parseChart(
  ['---', 'title: T', '---', '', '## Coro {#coro}', '[C]', 'Hola', '', '## Verso {#verso}', '[G]', 'Otra', '', '## Coro x2 {#coro-x2}', '[C]', 'Hola', ''].join('\n'),
  'coro-x2.song.md',
)
const chorusBlocks = blocksFor(chorusPair, null)
assert(chorusBlocks.find((block) => block.label === 'Coro x2')?.duplicateOf === 'Coro', 'chorus x2 collapses with the chorus')
assert(markdown.sections.some((section) => section.label === 'Verso'), 'plantilla says verso')
assert(!markdown.sections.some((section) => /estrofa/i.test(section.label)), 'plantilla has no estrofa label')

const openC = diagramFor('C')
assert(openC?.frets.join(',') === '-1,3,2,0,1,0', 'open C shape')
assert(openC?.startFret === 1, 'open C starts at the nut')
const barreF = diagramFor('F')
assert(barreF?.frets[0] === 1 && barreF.frets[1] === 3, 'F barre')
const slash = diagramFor('E/G#')
assert(slash?.frets[0] === 4 && slash.frets[4] === 0, 'E/G# bass')
const cShapes = shapesFor('C')
assert(cShapes.length >= 3, `C has alternate shapes, got ${cShapes.length}`)
assert(new Set(cShapes.map((shape) => shape.id)).size === cShapes.length, 'C shapes are unique')
const barreC = cShapes.find((shape) => shape.id !== openC?.id)
assert(barreC && diagramFor('C', barreC.id)?.id === barreC.id, 'selected C shape')

assert(wrapPlainChordLine('C    F') === '[C]  [F]', 'UG removes two spaces')
assert(isPlainChordLine('Am  G  F'), 'plain chord line')

const cifra = `<!doctype html><title>Bienvenido Espíritu Santo - Miel San Marcos - Cifra Club</title>
<pre>
[Intro]
<b>C</b>    <b>F</b>
<b>G</b>

[Coro]
<b>C</b>Bienvenido <b>G</b>espíritu
E|---0---|
</pre>
<script>{"tone":"C"}</script>`
const cho = chartToCho(cifra, 'https://www.cifraclub.com/miel-san-marcos/bienvenido-espiritu-santo/')
const imported = parseChart(cho, 'bienvenido.cho')
assert(imported.title === 'Bienvenido Espíritu Santo', `imported title ${imported.title}`)
assert(imported.artist === 'Miel San Marcos', `imported artist ${imported.artist}`)
assert(imported.key === 'C', `imported key ${imported.key}`)
assert(imported.source.includes('cifraclub.com'), 'imported source')
const intro = imported.sections.find((section) => section.label === 'Intro')
assert(intro?.lines[0]?.chords[0]?.raw === 'C', 'intro chord C')
assert(intro?.lines[0]?.chords[1]?.column === 5, `F column ${intro?.lines[0]?.chords[1]?.column}`)
assert(intro?.lines[0]?.lyric == null, 'intro chord line stays instrumental')
const chorus = imported.sections.find((section) => section.label === 'Coro')
assert(chorus?.lines[0]?.lyric?.includes('Bienvenido'), 'inline chords leave the lyric')
assert(chorus?.lines[0]?.chords[1]?.raw === 'G', 'inline G')
assert(
  chorus?.lines.some((line) => line.notes.some((note) => note.text.includes('Tablatura'))) ||
    chorus?.notes.some((note) => note.text.includes('Tablatura')),
  'tab becomes a comment',
)

assert(isBlockedPage('<TITLE>Access Denied</TITLE> You don\'t have permission. https://errors.edgesuite.net/18'), 'denied page')
let denied = false
try {
  chartToCho(
    '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>You don\'t have permission to access this server. edgesuite</BODY></HTML>',
    'https://www.cifraclub.com/marcos-brunet/dame-a-cristo/',
  )
} catch {
  denied = true
}
assert(denied, 'access denied is not converted into a chart')

const brokenTags = chartToCho(
  `<title>Glorioso Día (acordes) - Passion - Cifra Club</title><pre data-chord-content="true"><div>[Intro] <b data-chord-name="D5" data-chord-original-trailing="\n\n[First Part]\n\n">D5</b></div><div>        <b data-chord-name="D5" data-chord-original-trailing="\nHola\n">D5</b>\nHola\n</div></pre>`,
  'https://www.cifraclub.com/passion/glorioso-dia/',
)
const broken = parseChart(brokenTags, 'glorioso.cho')
assert(broken.sections[0]?.label === 'Intro', `broken tag intro ${broken.sections[0]?.label}`)
assert(broken.sections[0]?.lines[0]?.chords[0]?.raw === 'D5', 'broken tag keeps D5')
assert(!brokenTags.includes('<b'), 'broken tags are not left in the chart')
assert(broken.sections.some((section) => section.lines.some((line) => line.lyric === 'Hola')), 'broken tag keeps the lyric')

const storedAsCho = parseChart(
  '---\ntitle: Glorioso Día\nartist: Passion\nkey: D\n---\n\n## Intro {#intro}\n[D5]\nMi vergüenza me sepultó\n',
  'local-1792099446450.cho',
)
assert(storedAsCho.title === 'Glorioso Día', `stored title ${storedAsCho.title}`)
assert(storedAsCho.artist === 'Passion', 'stored artist')
assert(!storedAsCho.lyricsText.includes('title:'), 'front matter stays out of the chart')
assert(storedAsCho.sections[0]?.lines[0]?.chords[0]?.raw === 'D5', 'stored markdown keeps the chord')

const friday = new Date(2026, 9, 16)
const saturday = new Date(2026, 9, 17)
const sunday = new Date(2026, 9, 18)
const laterSaturday = new Date(2026, 9, 24)
assert(nextServiceDate(friday, 6) === '2026-10-17', 'next Saturday from Friday is the 17th')
assert(nextServiceDate(saturday, 6) === '2026-10-17', 'Saturday service is that same Saturday')
assert(serviceListName(3) === 'Servicio del próximo miércoles', 'wednesday service name')
assert(serviceListName(0) === 'Servicio del próximo domingo', 'sunday service name')
let planned = planEvergreenAdd({ weekday: 6, serviceDate: null }, [], 'a', friday)
assert(planned.evergreen.serviceDate === '2026-10-17' && planned.items.length === 1, 'first add targets Saturday')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'b', friday)
assert(planned.items.map((item) => item.songId).join() === 'a,b', 'adds keep accumulating before the service')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'c', saturday)
assert(planned.items.length === 3 && planned.evergreen.serviceDate === '2026-10-17', 'adding on the service day keeps the list')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'd', sunday)
assert(planned.items.length === 1 && planned.items[0]?.songId === 'd', 'adding after the service clears the list')
assert(planned.evergreen.serviceDate === '2026-10-24', 'the new service is the following Saturday')
planned = planEvergreenAdd({ weekday: 6, serviceDate: '2026-10-17' }, [{ songId: 'a', semitones: 0 }], 'e', laterSaturday)
assert(planned.items.length === 1 && planned.evergreen.serviceDate === '2026-10-24', 'a later Saturday starts that Saturday')
assert(currentUser.role === 'owner' && roleLabel('owner') === 'Admin' && roleLabel('admin') === 'Ayudante', 'the seeded owner stays the owner')
assert(can(currentUser, 'create') && can(currentUser, 'update') && can(currentUser, 'delete'), 'the owner can change songs and lists')
assert(!can({ ...currentUser, role: 'viewer' }, 'create'), 'a reader cannot create')
assert(!can({ ...currentUser, role: 'viewer' }, 'update'), 'a reader cannot edit')
assert(!can({ ...currentUser, role: 'viewer' }, 'delete'), 'a reader cannot delete')
assert(can({ ...currentUser, role: 'admin' }, 'delete'), 'an admin can delete')

const songMd = chartToSongMd(cho, imported.source)
assert(songMd.startsWith('---\ntitle: Bienvenido Espíritu Santo'), 'link becomes display markdown')
const fromMd = parseChart(songMd, 'bienvenido.song.md')
assert(fromMd.title === imported.title, 'markdown keeps the title')
assert(fromMd.artist === imported.artist, 'markdown keeps the artist')
assert(fromMd.key === 'C', 'markdown keeps the key')
assert(fromMd.sections.find((section) => section.label === 'Intro')?.lines[0]?.chords[1]?.column === 5, 'markdown keeps chord columns')
assert(fromMd.sections.find((section) => section.label === 'Coro')?.lines[0]?.lyric?.includes('Bienvenido'), 'markdown keeps the lyric')

assert(songIconIndex('hosanna') === songIconIndex('hosanna'), 'icon is a pure function of the id')
assert(songMarkTone('hosanna').background === songMarkTone('hosanna').background, 'color is a pure function of the id')
assert(songMarkTone('hosanna').background.startsWith('oklch('), 'color is a fixed oklch tone')
assert(SONG_MARK_HUES.length >= 12, 'hue palette is wide')
const toneSamples = new Set<string>()
for (let n = 0; n < 500; n += 1) toneSamples.add(songMarkTone(`tone-${n}`).background)
assert(toneSamples.size >= 16, `song marks use many colors, got ${toneSamples.size}`)
assert([...toneSamples].some((tone) => tone.includes('0.7 ')), 'palette includes a light band')
assert([...toneSamples].some((tone) => tone.includes('0.42 ')), 'palette includes a deep band')
assert(SONG_ICON_SHAPES.length >= 8, 'fixed icon set')
const iconShapes = new Set(SONG_ICON_SHAPES.map((shape) => JSON.stringify(shape)))
assert(iconShapes.size === SONG_ICON_SHAPES.length, 'icons are distinct')
const listIds = Array.from({ length: 60 }, (_, n) => `lista-${n}`)
const listLooks = distinctMarks(listIds)
const shuffledLooks = distinctMarks([...listIds].reverse())
assert(new Set([...listLooks.values()].map((look) => `${look.shape}:${look.tone}`)).size === listIds.length, 'list marks are all distinct')
assert(listIds.every((id) => JSON.stringify(listLooks.get(id)) === JSON.stringify(shuffledLooks.get(id))), 'list marks ignore list order')

const names = await readdir(charts)
const files = names.filter((name) => /\.(cho|chopro)$/i.test(name))
assert(files.length >= 30, `expected charts, got ${files.length}`)
const catalogMarks: { id: string; title: string }[] = []
for (const name of files) {
  const song = parseChart(await readFile(path.join(charts, name), 'utf8'), name)
  const lines = song.sections.reduce((sum, section) => sum + section.lines.length, 0)
  assert(song.title.trim(), `${name} title`)
  assert(lines > 0, `${name} has no lines`)
  catalogMarks.push({ id: name, title: song.title })
}
const catalogTones = new Set(catalogMarks.map((song) => songMarkTone(song.id).background))
assert(catalogTones.size >= 8, `catalog mark colors, got ${catalogTones.size}`)

const hosannaText = await readFile(path.join(charts, 'Hosanna - Hillsong en Español.cho'), 'utf8')
const hosannaSong = parseChart(hosannaText, 'Hosanna.cho')
const targetLine = hosannaSong.sections
  .flatMap((section) => section.lines)
  .find((line) => line.lyric?.includes('Veo al rey'))
const keptChord = targetLine?.chords[0]?.raw
assert(targetLine?.lyric && keptChord, 'hosanna line to share')
targetLine.lyric = 'Letra de prueba unica'
targetLine.chords[0]!.raw = 'Xy9'
hosannaSong.key = 'C'
const merged = shareLyrics(hosannaText, songToMarkdown(hosannaSong))
assert(merged.includes('Letra de prueba unica'), 'shared lyric lands on the other chart')
assert(!merged.includes('Veo al rey de Gloria'), 'the old lyric is replaced')
assert(!merged.includes('[Xy9]'), 'the other chart does not take the chord edit')
assert(merged.includes(`[${keptChord}]`), 'the other chart keeps its chord')
assert(/\{key:\s*C\}/.test(merged), 'key stays the song key')
assert(shareLyrics(hosannaText, hosannaText) === hosannaText, 'identical lyrics do not rewrite the chart')

console.log(`Parsed ${files.length} charts`)
