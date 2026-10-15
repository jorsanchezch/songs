import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatChord, transposeKeyName } from '../src/lib/chords.ts'
import { blocksFor } from '../src/lib/display.ts'
import { diagramFor, shapesFor } from '../src/lib/guitar.ts'
import { chartToCho, chartToSongMd, isBlockedPage, isPlainChordLine, wrapPlainChordLine } from '../src/lib/importChart.ts'
import { parseChart } from '../src/lib/parseChart.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const charts = path.resolve(root, '..')

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
  await readFile(path.join(charts, 'Bienvenido Espíritu Santo.chopro'), 'utf8'),
  'Bienvenido.chopro',
)
const verso = welcome.sections.find((section) => section.label === 'VERSO')
assert(verso?.repeat === 2, `verso repeat, got ${verso?.repeat}`)

const markdown = parseChart(
  await readFile(path.join(root, 'content/_plantilla.song.md'), 'utf8'),
  'content/_plantilla.song.md',
)
assert(markdown.versions.length === 2, 'markdown versions')
const blocks = blocksFor(markdown, markdown.versions[0]?.flow ?? null)
assert(blocks.some((block) => block.repeat >= 2) || markdown.sections.some((section) => section.sameAs), 'same section')
const only = blocksFor(markdown, ['estribillo-2'])
assert(only[0] && only[0].section.lines.length > 0, 'same= copies the chorus')
assert(only[0].repeat === 2, 'repeat badge')
const collapsed = blocksFor(markdown, ['estribillo', 'estribillo-2'])
assert(collapsed.length === 1, 'adjacent chorus collapses')
assert(collapsed[0]?.repeat === 3, 'repeat counts add')

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

[Estribillo]
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
const chorus = imported.sections.find((section) => section.label === 'Estribillo')
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

const songMd = chartToSongMd(cho, imported.source)
assert(songMd.startsWith('---\ntitle: Bienvenido Espíritu Santo'), 'link becomes display markdown')
const fromMd = parseChart(songMd, 'bienvenido.song.md')
assert(fromMd.title === imported.title, 'markdown keeps the title')
assert(fromMd.artist === imported.artist, 'markdown keeps the artist')
assert(fromMd.key === 'C', 'markdown keeps the key')
assert(fromMd.sections.find((section) => section.label === 'Intro')?.lines[0]?.chords[1]?.column === 5, 'markdown keeps chord columns')
assert(fromMd.sections.find((section) => section.label === 'Estribillo')?.lines[0]?.lyric?.includes('Bienvenido'), 'markdown keeps the lyric')

const names = await readdir(charts)
const files = names.filter((name) => /\.(cho|chopro)$/i.test(name))
assert(files.length >= 30, `expected charts, got ${files.length}`)
for (const name of files) {
  const song = parseChart(await readFile(path.join(charts, name), 'utf8'), name)
  const lines = song.sections.reduce((sum, section) => sum + section.lines.length, 0)
  assert(song.title.trim(), `${name} title`)
  assert(lines > 0, `${name} has no lines`)
}

console.log(`Parsed ${files.length} charts`)
