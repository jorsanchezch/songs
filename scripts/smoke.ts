import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatChord, transposeKeyName } from '../src/lib/chords.ts'
import { blocksFor } from '../src/lib/display.ts'
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
