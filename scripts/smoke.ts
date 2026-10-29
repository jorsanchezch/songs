import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatChord, transposeChordSymbol, transposeKeyName } from '../src/lib/chords.ts'
import { applyEditingKey, applyOriginalKey, foldComposerIntoArtist, normalizeKeyText } from '../src/lib/draftSong.ts'
import { keyChoices } from '../src/lib/theory.ts'
import { blocksFor, headerChips, headerChipText, partKind } from '../src/lib/display.ts'
import {
  sliceChipLabel,
  sliceLetter,
  sliceStartLines,
  usableJumpHeight,
} from '../src/lib/viewportJumps.ts'
import { diagramFor, shapesFor } from '../src/lib/guitar.ts'
import { chartToCho, chartToSongMd, isBlockedPage, isPlainChordLine, songToMarkdown, wrapPlainChordLine } from '../src/lib/importChart.ts'
import { shareLyrics } from '../server/lyrics.ts'
import { copyChartMedia, shareChartMeta } from '../server/chartMedia.ts'
import {
  closeRotatedDayList,
  dayListIsDue,
  nextServiceDate,
  planEvergreenAdd,
  rememberClosedDayList,
  serviceListName,
} from '../src/lib/setlists.ts'
import { can, currentUser, roleLabel } from '../src/lib/access.ts'
import { parseChart } from '../src/lib/parseChart.ts'
import { lineDiff, songFieldChanges } from '../src/lib/songVersionDiff.ts'
import {
  buildTimeline,
  cueIndexAt,
  cuePoints,
  effectiveAudio,
  formatClock,
  formatLead,
  impliedBpm,
  locate,
  marksToParts,
  parsePlaybackSettings,
  partKeys,
  referenceTrack,
  songMediaSources,
  startOffset,
  youtubeVideoId,
} from '../src/lib/playback.ts'
import { songPlayback } from '../server/playback.ts'
import { sectionDegrees, sectionProgressions } from '../src/lib/sectionProgression.ts'
import { diatonicChords, keyName, parseStudyKey, pianoVoicings, signature } from '../src/lib/theory.ts'
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
assert(formatChord('E/G#', 'E', 0, 'letters', true) === 'E', 'guitar slash hides the bass and keeps the letter')
assert(formatChord('E/G#', 'E', 0, 'degrees', true) === '1', 'guitar slash in degrees drops the bass degree')
assert(formatChord('C/E', 'C', 0, 'letters', true) === 'C', 'C/E keeps the letter')
assert(formatChord('C/E', 'C', 0, 'both', true) === '1(C)', 'C/E drops the slash and keeps degree and letter')
assert(formatChord('C#m7/B', 'A', 0, 'letters', true) === 'C#m7', 'C#m7/B keeps the letter chord')
assert(formatChord('C#m7/B', 'A', 0, 'degrees', true) === '3m7', 'slash keeps the chord quality')
assert(formatChord('D/F#', 'A', 0, 'letters', true) === 'D', 'D/F# keeps D')
assert(formatChord('D/F#', 'A', 0, 'degrees', true) === '4', 'D/F# in degrees is 4, not 4/6')
assert(formatChord('G', 'C', 0, 'letters', true) === 'G', 'plain chords ignore the slash switch')
assert(formatChord('E/G#', 'E', 0, 'letters') === 'E/G#', 'letters keep the slash when the switch is off')
assert(formatChord('E/G#', 'E', 2, 'letters') === 'F#/A#', 'transposed slash returns when the switch is off')
assert(formatChord('E/G#', 'E', 2, 'letters', true) === 'F#', 'hidden slash still transposes the letter chord')
assert(transposeChordSymbol('E/G#', 2, false) === 'F#/A#', 'transpose slash')
assert(transposeChordSymbol('C#m7', 2, false) === 'D#m7', 'transpose keeps quality')
assert(transposeChordSymbol('Bb', 0) === 'Bb', 'zero transpose keeps the spelling')
assert(normalizeKeyText('c#') === 'C#' && normalizeKeyText('am') === 'Am', 'key text keeps minor m')
const choices = keyChoices()
assert(choices.includes('A') && choices.includes('F#m') && choices.indexOf('C') < choices.indexOf('Am'), 'key list is majors then minors')
const keySample = parseChart(
  ['---', 'title: Prueba', 'key: C', '---', '', '## Verso {#verso}', '', '[C] [E/G#]', 'Hola', ''].join('\n'),
  'prueba.song.md',
)
assert(applyEditingKey(keySample, 'c') === keySample, 'same editing key does not transpose')
const movedKey = applyEditingKey(keySample, 'D')
assert(movedKey.key === 'D' && movedKey.originalKey === 'C', 'editing key freezes the original')
assert(movedKey.sections[0]?.lines[0]?.chords[0]?.raw === 'D', 'root moves with the editing key')
assert(movedKey.sections[0]?.lines[0]?.chords[1]?.raw === 'F#/A#', 'slash moves with the editing key')
const sharpKey = applyEditingKey(keySample, 'C#')
assert(sharpKey.key === 'C#' && sharpKey.sections[0]?.lines[0]?.chords[0]?.raw === 'C#', 'written sharps stay sharp')
const flatKey = applyEditingKey(keySample, 'Db')
assert(flatKey.key === 'Db' && flatKey.sections[0]?.lines[0]?.chords[0]?.raw === 'Db', 'written flats stay flat')
const restoredKey = applyEditingKey(movedKey, 'C')
assert(restoredKey.key === 'C' && !restoredKey.originalKey, 'returning to the original clears it')
assert(restoredKey.sections[0]?.lines[0]?.chords[0]?.raw === 'C', 'chord returns with the original key')
const markedKey = applyOriginalKey(keySample, 'G')
assert(markedKey.originalKey === 'G' && markedKey.sections[0]?.lines[0]?.chords[0]?.raw === 'C', 'original key does not transpose')
assert(songToMarkdown(markedKey).includes('original_key: G'), 'writes original_key')
const roundKey = parseChart(songToMarkdown(markedKey), 'prueba.song.md')
assert(roundKey.key === 'C' && roundKey.originalKey === 'G', 'reads original_key')
assert(!songToMarkdown(applyOriginalKey(markedKey, 'C')).includes('original_key'), 'drops original_key when it matches')
const mediaSong = {
  ...keySample,
  bpm: 72,
  durationMs: 245000,
  audioUrl: 'https://example.com/cancion.mp3',
  sources: [{ url: 'https://www.youtube.com/watch?v=abc123', label: 'YouTube' }],
  source: 'https://www.youtube.com/watch?v=abc123',
}
const mediaMd = songToMarkdown(mediaSong)
assert(mediaMd.includes('bpm: 72'), 'writes bpm')
assert(mediaMd.includes('duration_ms: 245000'), 'writes duration_ms')
assert(mediaMd.includes('audio_url:') && mediaMd.includes('example.com/cancion.mp3'), 'writes audio_url')
assert(mediaMd.includes('YouTube'), 'writes YouTube source label')
const roundMedia = parseChart(mediaMd, 'media.song.md')
assert(roundMedia.bpm === 72 && roundMedia.durationMs === 245000, 'reads bpm and duration_ms')
assert(roundMedia.audioUrl === 'https://example.com/cancion.mp3', 'reads audio_url')
assert(
  roundMedia.sources.some((item) => item.label === 'YouTube' && item.url.includes('youtube.com')),
  'reads YouTube source',
)
const { formatDurationMmSs, parseDurationMmSs, resolveAudioUrl } = await import('../src/lib/songMedia.ts')
assert(formatDurationMmSs(245_000) === '4:05', 'formats duration as m:ss')
assert(parseDurationMmSs('4:05') === 245_000, 'parses m:ss')
assert(parseDurationMmSs('1:02:03') === 3_723_000, 'parses h:mm:ss')
assert(parseDurationMmSs('') == null, 'empty duration is null')
assert(resolveAudioUrl('/api/audio/songs/a/1.mp3', 'https://api.example') === 'https://api.example/api/audio/songs/a/1.mp3', 'resolves relative audio')
assert(resolveAudioUrl('https://cdn.example/a.mp3') === 'https://cdn.example/a.mp3', 'keeps absolute audio')

const { applyChartMedia, chartHasYoutube } = await import('../server/chartMedia.ts')
const { parseIsoDurationMs, bpmFromText, searchLanguage, youtubeWatchUrl } = await import('../server/youtubeMedia.ts')
assert(parseIsoDurationMs('PT3M25S') === 205_000, 'ISO duration minutes+seconds')
assert(parseIsoDurationMs('PT1H2S') === 3_602_000, 'ISO duration hour')
assert(bpmFromText('Live worship 72 BPM in G') === 72, 'bpm from blurb')
assert(searchLanguage('Al Que Está Sentado', 'Marcos Brunet').relevanceLanguage === 'es', 'spanish bias')
assert(searchLanguage('Living Hope', 'Phil Wickham').relevanceLanguage === 'en', 'english bias')
assert(youtubeWatchUrl('dQw4w9WgXcQ').includes('dQw4w9WgXcQ'), 'watch url')
const choBase = `{title: Prueba}
{artist: Demo}
{key: C}
{source: https://www.cifraclub.com/demo/prueba/}

{start_of_verse}
[C]hola
{end_of_verse}
`
assert(!chartHasYoutube(choBase), 'cho without youtube')
const choPatched = applyChartMedia(choBase, {
  youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  bpm: 88,
  durationMs: 210_000,
})
assert(chartHasYoutube(choPatched), 'cho with youtube')
assert(choPatched.includes('{bpm: 88}'), 'cho bpm tag')
assert(choPatched.includes('{duration_ms: 210000}'), 'cho duration tag')
assert(choPatched.includes('YouTube'), 'cho youtube label')
const choParsed = parseChart(choPatched, 'prueba.cho')
assert(choParsed.bpm === 88 && choParsed.durationMs === 210_000, 'parseChart reads patched cho media')
assert(
  choParsed.sources.some((item) => item.label === 'YouTube' && item.url.includes('abcdefghijk')),
  'parseChart keeps youtube source on cho',
)
const mdPatched = applyChartMedia(
  `---
title: Demo
artist: Alguien
source: https://example.com/cifra
---

## Verse {#v}
[C]hola
`,
  { youtubeUrl: 'https://youtu.be/xyzxyzxyzxy', durationMs: 90_000, audioUrl: 'https://cdn.example/a.mp3' },
)
const mdParsed = parseChart(mdPatched, 'demo.song.md')
assert(mdParsed.durationMs === 90_000 && mdParsed.audioUrl.includes('cdn.example'), 'patched md media')
assert(mdParsed.sources.some((item) => item.label === 'YouTube'), 'patched md youtube source')
assert(mdParsed.source.includes('example.com/cifra'), 'keeps chord source as primary')

const {
  parseSourceText,
  formatSourceText,
  selectYoutubeSource,
  addYoutubeSource,
  removeSourceEntry,
  serializeSources,
  selectedYoutubeIndex,
} = await import('../src/lib/sourceEntry.ts')
const { songMediaSources } = await import('../src/lib/playback.ts')
const attr = parseSourceText(
  'https://youtu.be/bbbbbbbbbbb | En vivo | selected audio_url=%2Fapi%2Faudio%2Fx.mp3 duration_ms=200000 bpm=70',
)
assert(attr?.selected && attr.bpm === 70 && attr.durationMs === 200_000, 'parses source attrs')
assert(
  formatSourceText(
    { url: 'https://youtu.be/bbbbbbbbbbb', label: 'En vivo', selected: true, audioUrl: '/api/audio/x.mp3', durationMs: 200_000, bpm: 70 },
    { withSelected: true, withMedia: true },
  ).includes('selected') && formatSourceText(
    { url: 'https://youtu.be/bbbbbbbbbbb', label: 'En vivo', selected: true, audioUrl: '/api/audio/x.mp3', durationMs: 200_000, bpm: 70 },
    { withSelected: true, withMedia: true },
  ).includes('duration_ms=200000'),
  'formats source attrs',
)
const multiMd = `---
title: Multi
artist: Demo
bpm: 72
duration_ms: 245000
audio_url: /api/audio/songs/x/1.mp3
sources:
  - https://www.youtube.com/watch?v=aaaaaaaaaaa | YouTube | selected
  - https://youtu.be/bbbbbbbbbbb | En vivo | audio_url=%2Fapi%2Faudio%2Fsongs%2Fx%2F2.mp3 duration_ms=200000 bpm=70
  - https://www.cifraclub.com/demo/
---

## Verse {#v}
[C]hola
`
const multiSong = parseChart(multiMd, 'multi.song.md')
assert(multiSong.sources.filter((item) => /youtu/.test(item.url)).length === 2, 'keeps two youtube sources')
assert(multiSong.bpm === 72 && multiSong.durationMs === 245_000, 'selected media stays on top fields')
assert(multiSong.audioUrl.includes('/api/audio/songs/x/1.mp3'), 'selected mp3 on top')
assert(multiSong.sources.some((item) => item.selected && item.url.includes('aaaaaaaaaaa')), 'marks selected youtube')
assert(
  multiSong.sources.some((item) => item.url.includes('bbbbbbbbbbb') && item.durationMs === 200_000 && item.bpm === 70),
  'non-selected keeps line media',
)
const roundTrip = songToMarkdown(multiSong)
assert(roundTrip.includes('selected'), 'round-trip writes selected when multiple youtube')
assert(!/aaaaaaaaaaa[^\n]*duration_ms=/.test(roundTrip), 'selected line has no media attrs')
assert(/bbbbbbbbbbb[^\n]*duration_ms=200000/.test(roundTrip), 'other youtube keeps duration_ms')

const swapped = selectYoutubeSource(
  multiSong.sources,
  { bpm: multiSong.bpm ?? null, durationMs: multiSong.durationMs ?? null, audioUrl: multiSong.audioUrl ?? '' },
  multiSong.sources.findIndex((item) => item.url.includes('bbbbbbbbbbb')),
)
assert(swapped.top.audioUrl.includes('/api/audio/songs/x/2.mp3'), 'select promotes other mp3')
assert(swapped.top.bpm === 70 && swapped.top.durationMs === 200_000, 'select promotes line media')
assert(
  swapped.entries.some((item) => item.url.includes('aaaaaaaaaaa') && item.durationMs === 245_000),
  'old selection keeps previous top media on its line',
)
const withBare = addYoutubeSource(swapped.entries, swapped.top, 'https://www.youtube.com/watch?v=eeeeeeeeeee')
const bareSelect = selectYoutubeSource(
  withBare.entries,
  withBare.top,
  withBare.entries.findIndex((item) => item.url.includes('eeeeeeeeeee')),
)
assert(bareSelect.top.audioUrl === '' && bareSelect.needsDuration, 'bare select clears mp3 and needs duration')
assert(bareSelect.top.durationMs === 200_000, 'duration falls back to previous top while looking up')

const removed = removeSourceEntry(multiSong.sources, {
  bpm: multiSong.bpm ?? null,
  durationMs: multiSong.durationMs ?? null,
  audioUrl: multiSong.audioUrl ?? '',
}, selectedYoutubeIndex(multiSong.sources))
assert(removed.entries.some((item) => item.url.includes('bbbbbbbbbbb')), 'remove keeps other youtube')
assert(removed.top.audioUrl.includes('/2.mp3'), 'remove reselects next youtube media')

const added = addYoutubeSource(multiSong.sources, {
  bpm: multiSong.bpm ?? null,
  durationMs: multiSong.durationMs ?? null,
  audioUrl: multiSong.audioUrl ?? '',
}, 'https://www.youtube.com/watch?v=ccccccccccc')
assert(added.entries.filter((item) => /youtu/.test(item.url)).length === 3, 'addYoutube appends')
assert(added.entries.find((item) => item.selected)?.url.includes('aaaaaaaaaaa'), 'add does not steal selection')
const again = addYoutubeSource(added.entries, added.top, 'https://youtu.be/aaaaaaaaaaa')
assert(again.added === false, 'addYoutube dedupes by video id')

const mediaOpts = songMediaSources(multiSong, 'https://youtu.be/bbbbbbbbbbb')
assert(mediaOpts.options.length === 2, 'playback lists youtube options')
assert(mediaOpts.youtubeId === 'bbbbbbbbbbb', 'pick drives youtube id')
assert(mediaOpts.audioUrl?.includes('/2.mp3'), 'pick drives mp3')

const serverAdd = applyChartMedia(multiMd, { addYoutubeUrl: 'https://www.youtube.com/watch?v=ddddddddddd' })
const serverAddSong = parseChart(serverAdd, 'multi.song.md')
assert(serverAddSong.sources.filter((item) => /youtu/.test(item.url)).length === 3, 'server addYoutubeUrl keeps others')
assert(serverAddSong.sources.find((item) => item.selected)?.url.includes('aaaaaaaaaaa'), 'server add keeps selected')
const serverSelect = applyChartMedia(multiMd, { selectYoutubeUrl: 'https://youtu.be/bbbbbbbbbbb' })
const serverSelectSong = parseChart(serverSelect, 'multi.song.md')
assert(serverSelectSong.audioUrl.includes('/2.mp3'), 'server selectYoutubeUrl swaps audio')
assert(serverSelectSong.bpm === 70, 'server selectYoutubeUrl swaps bpm')

const choMulti = applyChartMedia(
  `{title: Multi}
{artist: Demo}
{bpm: 72}
{duration_ms: 245000}
{source: https://www.youtube.com/watch?v=aaaaaaaaaaa | YouTube}
{source: https://youtu.be/bbbbbbbbbbb | En vivo}

{start_of_verse}
[C]hola
{end_of_verse}
`,
  { selectYoutubeUrl: 'https://youtu.be/bbbbbbbbbbb', bpm: 70, durationMs: 200_000 },
)
assert(choMulti.includes('selected'), 'cho multi writes selected')
assert(choMulti.includes('{bpm: 70}'), 'cho select updates bpm')
void serializeSources

const prefixCredit = foldComposerIntoArtist({ ...keySample, artist: 'Marcela Gándara', composer: 'Marcela Gándara / Vino Nuevo' })
assert(prefixCredit.artist === 'Marcela Gándara / Vino Nuevo' && prefixCredit.composer === '', 'composer that extends the artist replaces it')
const joinedCredit = foldComposerIntoArtist({ ...keySample, artist: 'Marcos Brunet', composer: 'Abbie Gamboa' })
assert(joinedCredit.artist === 'Marcos Brunet · Abbie Gamboa' && joinedCredit.composer === '', 'distinct composer joins the artist')
const sameCredit = foldComposerIntoArtist({ ...keySample, artist: 'Passion', composer: 'Passion' })
assert(sameCredit.artist === 'Passion' && sameCredit.composer === '', 'same composer does not repeat')
assert(!songToMarkdown(joinedCredit).includes('composer:'), 'folded credit writes only artist')

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
const digno = parseChart(
  await readFile(path.join(root, 'content/digno-es-el-senor.song.md'), 'utf8'),
  'content/digno-es-el-senor.song.md',
)
const vino = parseChart(
  await readFile(path.join(root, 'content/digno-es-el-senor-vino-nuevo.song.md'), 'utf8'),
  'content/digno-es-el-senor-vino-nuevo.song.md',
)
const chordSet = (song: { sections: { lines: { chords: { raw: string }[] }[] }[] }) =>
  song.sections.flatMap((section) => section.lines.flatMap((line) => line.chords.map((chord) => chord.raw))).join(' ')
assert(vino.title === 'Digno es el Señor', 'vino nuevo title')
assert(vino.key === 'A', 'vino nuevo key')
assert(vino.source.includes('lacuerda.net'), 'vino nuevo source')
assert(chordSet(vino).includes('D/E') && !chordSet(vino).includes('C#m7'), 'vino nuevo keeps the La Cuerda chords')
assert(chordSet(digno).includes('C#m7') && digno.source.includes('youtube.com'), 'existing digno chart stays')
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
const chorusBlocks = blocksFor(chorusPair, null, 'collapse')
assert(chorusBlocks.find((block) => block.label === 'Coro x2')?.duplicateOf === 'Coro', 'chorus x2 collapses with the chorus')
assert(blocksFor(chorusPair, null, 'chordsOnly').find((block) => block.label === 'Coro x2')?.duplicateOf === 'Coro', 'chords-only collapse still folds identical parts')
assert(!blocksFor(chorusPair, null, 'full').some((block) => block.duplicateOf), 'completo leaves repeated parts open')
assert(!blocksFor(chorusPair, null, 'openChords').some((block) => block.duplicateOf), 'completo sin letra leaves parts open')
const openHeader = headerChips(blocksFor(chorusPair, null, 'full'), false)
assert(openHeader.length === 3, 'full header lists every part')
assert(headerChipText(openHeader[2]!) === 'Coro x2', 'x2 stays written on its own chip')
const compactHeader = headerChips(chorusBlocks, true)
assert(compactHeader.map((chip) => headerChipText(chip)).join(' | ') === 'Coro ×2 · 2 | Verso', 'concise header folds the chorus and keeps x2')
assert(compactHeader[0]?.ids.length === 2, 'folded chorus still covers both parts')
const repeatedChorus = parseChart(
  ['---', 'title: T', '---', '', '## Coro {#coro}', '[C]', 'Hola', '', '## Verso {#verso}', '[G]', 'Otra', '', '## Coro {#otra same=coro repeat=2}'].join('\n'),
  'repeat-coro.song.md',
)
assert(
  headerChipText(headerChips(blocksFor(repeatedChorus, null, 'collapse'), true)[0]!) === 'Coro ×2 · 2',
  'a repeated chorus keeps the count on the folded chip',
)
const unlike = parseChart(
  ['---', 'title: T', '---', '', '## Coro {#a}', '[C]', 'Hola', '', '## Coro {#b}', '[G]', 'Otra', ''].join('\n'),
  'unlike-coro.song.md',
)
assert(headerChips(blocksFor(unlike, null, 'collapse'), true).length === 2, 'different choruses stay apart')
assert(headerChips(blocksFor(unlike, null, 'byChords'), true).length === 2, 'different chords stay apart in chord collapse')
const sameMusic = parseChart(
  ['---', 'title: T', '---', '', '## Coro {#a}', '[C]', 'Hola', '', '## Verso {#b}', '[C]', 'Hola amigo', ''].join('\n'),
  'same-music.song.md',
)
const musicBlocks = blocksFor(sameMusic, null, 'byChords')
assert(musicBlocks.find((block) => block.label === 'Verso')?.duplicateOf === 'Coro', 'chord collapse ignores a small lyric change')
assert(musicBlocks.find((block) => block.label === 'Verso')?.duplicateOfId === musicBlocks[0]?.id, 'chord collapse points at the earlier part')
assert(!blocksFor(sameMusic, null, 'collapse').some((block) => block.duplicateOf), 'colapsar keeps different lyrics apart')
const longer = parseChart(
  ['---', 'title: T', '---', '', '## Coro {#a}', '[C]', 'Hola', '', '## Verso {#b}', '[C]', 'Hola', '[G]', 'amigo', ''].join('\n'),
  'longer.song.md',
)
assert(!blocksFor(longer, null, 'byChords').some((block) => block.duplicateOf), 'a different line count stays open')
assert(markdown.sections.some((section) => section.label === 'Verso'), 'plantilla says verso')
assert(!markdown.sections.some((section) => /estrofa/i.test(section.label)), 'plantilla has no estrofa label')

assert(usableJumpHeight(800, 120, 96, 24) === 800 - 120 - 96 - 24, 'usable jump height subtracts chrome')
assert(usableJumpHeight(100, 80, 80) === 48, 'usable jump height has a floor')
assert(sliceStartLines([40, 40, 40], 200).join(',') === '0', 'short parts stay one jump')
assert(sliceStartLines([100, 100, 100, 100], 150).join(',') === '0,2', 'tall parts split into equal viewport targets')
assert(sliceStartLines([80, 80, 80, 40], 150).join(',') === '0,2', 'last jump may be short')
assert(sliceChipLabel('Verso 1', 0, 2) === 'Verso 1a' && sliceChipLabel('Verso 1', 1, 2) === 'Verso 1b', 'verso slices use 1a/1b')
assert(sliceChipLabel('Coro', 0, 2) === 'Coro a', 'plain labels get a spaced letter')
assert(sliceChipLabel('Verso 1', 0, 1) === 'Verso 1', 'single slice keeps the label')
assert(sliceLetter(26) === 'aa', 'slice letters continue past z')

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
assert(planned.closed == null, 'the first song does not close a list')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'b', friday)
assert(planned.items.map((item) => item.songId).join() === 'a,b', 'adds keep accumulating before the service')
assert(planned.closed == null, 'adding before the service does not close the list')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'c', saturday)
assert(planned.items.length === 3 && planned.evergreen.serviceDate === '2026-10-17', 'adding on the service day keeps the list')
assert(planned.closed == null, 'adding on the service day does not close the list')
assert(!dayListIsDue({ weekday: 6, serviceDate: '2026-10-17' }, saturday), 'the service day itself is not due')
assert(dayListIsDue({ weekday: 6, serviceDate: '2026-10-17' }, sunday), 'the day after the service is due')
planned = planEvergreenAdd(planned.evergreen, planned.items, 'd', sunday)
assert(planned.items.length === 1 && planned.items[0]?.songId === 'd', 'adding after the service clears the list')
assert(planned.evergreen.serviceDate === '2026-10-24', 'the new service is the following Saturday')
assert(planned.closed?.serviceDate === '2026-10-17', 'closing keeps that Saturday')
assert(planned.closed?.items.map((item) => item.songId).join() === 'a,b,c', 'closing keeps the song order')
const repeated = planEvergreenAdd(
  { weekday: 6, serviceDate: '2026-10-17' },
  [
    { songId: 'a', semitones: 3 },
    { songId: 'b', semitones: 0 },
  ],
  'a',
  sunday,
)
assert(repeated.closed?.items.map((item) => `${item.songId}:${item.semitones}`).join() === 'a:3,b:0', 'closing keeps semitones')
assert(repeated.items.map((item) => item.songId).join() === 'a', 'the new rotation starts with the added song')
assert(closeRotatedDayList({ weekday: 6, serviceDate: '2026-10-17' }, [], sunday) == null, 'an empty list has nothing to close')
assert(
  closeRotatedDayList({ weekday: 6, serviceDate: '2026-10-17' }, [{ songId: 'a', semitones: 1 }], saturday) == null,
  'close uses the same day-after rule',
)
const closed = closeRotatedDayList(
  { weekday: 6, serviceDate: '2026-10-17' },
  [
    { songId: 'a', semitones: 1 },
    { songId: 'b', semitones: -2 },
  ],
  sunday,
)
assert(closed?.id === 'historial-6-2026-10-17' && closed.serviceDate === '2026-10-17', 'closed list keeps the day key')
assert(closed?.items.map((item) => `${item.songId}:${item.semitones}`).join() === 'a:1,b:-2', 'closed list keeps song order')
const remembered = rememberClosedDayList([], closed)
assert(rememberClosedDayList(remembered, closed).length === 1, 'the same day is closed once')
planned = planEvergreenAdd({ weekday: 6, serviceDate: '2026-10-17' }, [{ songId: 'a', semitones: 0 }], 'e', laterSaturday)
assert(planned.items.length === 1 && planned.evergreen.serviceDate === '2026-10-24', 'a later Saturday starts that Saturday')
assert(planned.closed?.serviceDate === '2026-10-17' && planned.closed.items[0]?.songId === 'a', 'a later Saturday closes the previous one')
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

const gMajor = diatonicChords({ pc: 7, minor: false }, false)
assert(gMajor.map((chord) => chord.name).join(' ') === 'G Am Bm C D Em F#dim', 'diatonic G')
assert(gMajor.map((chord) => chord.degree).join(' ') === '1 2m 3m 4 5 6m 7dim', 'diatonic degrees')
assert(diatonicChords({ pc: 2, minor: true }, true).map((chord) => chord.name).join(' ') === 'Dm7 Em7b5 Fmaj7 Gm7 Am7 Bbmaj7 C7', 'diatonic Dm sevenths')
assert(signature({ pc: 5, minor: false }) === '1♭' && signature({ pc: 4, minor: true }) === '1♯', 'key signature')
assert(keyName(parseStudyKey('Bbm')!) === 'Bbm', 'study key round trip')
assert(pianoVoicings(11, [0, 4, 7, 11]).every((notes) => notes[0]! < 12 && notes.at(-1)! < 24), 'piano voicings fit two octaves')
assert(shapesFor('Bm7b5')[0]?.frets.join(',') === '-1,2,3,2,3,-1', 'half-diminished shape')

const dame = parseChart(
  await readFile(path.join(root, 'public/songs/authored/dame-a-cristo.song.md'), 'utf8'),
  'authored/dame-a-cristo.song.md',
)
const dameVerse = dame.sections.find((section) => section.label === 'Verso')
assert(dameVerse, 'dame verse')
const dameDegrees = sectionDegrees(
  dame.key,
  dameVerse!.lines.flatMap((line) => line.chords.map((chord) => chord.raw)),
)
assert(dameDegrees.join('-') === '1-4-2m-1-4', `dame verse degrees ${dameDegrees.join('-')}`)
const mixed = sectionProgressions([
  {
    id: 'uno',
    title: 'Uno',
    key: 'C',
    origin: 'catalog',
    sections: [{ label: 'Verso', lines: [{ chords: [{ raw: 'C' }, { raw: 'G' }, { raw: 'Am' }, { raw: 'Dm' }] }] }],
  },
  {
    id: 'dos',
    title: 'Dos',
    key: 'C',
    origin: 'catalog',
    sections: [{ label: 'Coro', lines: [{ chords: [{ raw: 'C' }, { raw: 'G' }, { raw: 'Am' }, { raw: 'Dm' }] }] }],
  },
  {
    id: 'tres',
    title: 'Tres',
    key: 'G',
    origin: 'catalog',
    sections: [{ label: 'Verso', lines: [{ chords: [{ raw: 'G' }, { raw: 'D' }, { raw: 'Em' }, { raw: 'Am' }] }] }],
  },
])
const pattern = mixed.find((item) => item.degrees === '1-5-6m-2m')
assert(pattern, '1-5-6m-2m comes from the stored sections')
assert(pattern.reference.key === 'C' && (pattern.reference.section === 'Verso' || pattern.reference.section === 'Coro'), 'the example is one section in that key')
assert(pattern.alternatives.length === 1 && pattern.alternatives[0]?.key === 'G' && pattern.alternatives[0]?.title === 'Tres', 'another key is another way to play it')
assert(pattern.alternatives.every((item) => item.key !== 'C'), 'another song in the same key is not an example')

{
  const line = (chords: string[], lyric: string | null) => ({
    chords: chords.map((raw, column) => ({ raw, column: column * 4, notes: [] })),
    lyric,
    notes: [],
  })
  const section = (id: string, label: string, repeat: number, lines: ReturnType<typeof line>[]) => ({
    id,
    label,
    repeat,
    notes: [],
    lines,
  })
  const playSong = {
    id: 'play',
    title: 'Play',
    artist: '',
    composer: '',
    key: 'G',
    source: '',
    sources: [{ url: 'https://youtu.be/dQw4w9WgXcQ', label: 'YouTube' }],
    lyricsText: '',
    versions: [],
    sections: [
      section('intro', 'Intro', 1, [line(['G', 'D', 'Em', 'C'], null)]),
      section('verso', 'Verso', 1, [line(['G', 'D'], 'Uno dos'), line([], 'Tres cuatro')]),
      section('coro', 'Coro', 2, [line(['C'], 'Cinco')]),
    ],
  }
  const playBlocks = blocksFor(playSong, null)
  // Lines × repeats: intro 1, verso 2, coro 1 × 2 = 5 units over 50 s.
  // Duration mode uses duration_ms only — no YouTube/MP3 required.
  const byDuration = buildTimeline({ blocks: playBlocks, settings: { pace: 'duration', useBpm: false }, durationMs: 50_000 })
  assert(byDuration.basis === 'duration' && byDuration.totalMs === 50_000, 'duration timeline spans the song')
  assert(effectiveAudio('off', songMediaSources({ ...playSong, audioUrl: '', durationMs: 50_000 })) === 'off', 'duration works with audio off')
  assert(byDuration.blocks.map((block) => block.start).join(',') === '0,10000,30000', `duration starts ${byDuration.blocks.map((block) => block.start)}`)
  assert(locate(byDuration, 5_000)?.chordIndex === 2, 'chords share an intro line evenly')
  assert(locate(byDuration, 25_000)?.lineIndex === 1, 'second verse line')
  const secondPass = locate(byDuration, 45_000)
  assert(secondPass?.blockId === 'coro' && secondPass.pass === 2, 'repeat counts its passes')
  assert(locate(byDuration, 50_000) === null, 'playback ends with the song')
  assert(startOffset(byDuration, 'verso', 1) === 20_000, 'a slice starts at its line')
  // BPM: intro 4 bars, verso 2 + 2, coro 2 × 2 = 12 bars at 120 = 24 s.
  const byBpm = buildTimeline({ blocks: playBlocks, settings: { pace: 'tempo', useBpm: true }, bpm: 120, durationMs: 50_000 })
  assert(byBpm.basis === 'bpm' && byBpm.totalMs === 24_000, `bpm timeline ${byBpm.totalMs}`)
  const refined = buildTimeline({ blocks: playBlocks, settings: { pace: 'duration', useBpm: true }, bpm: 120, durationMs: 48_000 })
  assert(refined.blocks[1]?.start === 16_000, 'bpm weighs bars inside the duration')
  const fromMedia = buildTimeline({ blocks: playBlocks, settings: { pace: 'duration', useBpm: false }, durationMs: 50_000, mediaMs: 60_000 })
  assert(fromMedia.basis === 'media' && fromMedia.totalMs === 60_000, 'loaded audio length wins')
  const estimate = buildTimeline({ blocks: playBlocks, settings: { pace: 'duration', useBpm: true } })
  assert(estimate.basis === 'estimate' && estimate.totalMs > 0, 'no duration or bpm still plays')
  assert(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3') === 'dQw4w9WgXcQ', 'watch link id')
  assert(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ', 'short link id')
  assert(youtubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ', 'music link id')
  assert(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'dQw4w9WgXcQ', 'shorts link id')
  assert(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ') === null, 'not youtube')
  const playMedia = songMediaSources({ ...playSong, audioUrl: '', bpm: null, durationMs: null })
  assert(playMedia.youtubeId === 'dQw4w9WgXcQ', 'song media finds the YouTube source')
  assert(effectiveAudio('mp3', playMedia) === 'off' && effectiveAudio('youtube', playMedia) === 'youtube', 'missing audio falls back to silence')
  const starts = (timeline: { blocks: { start: number }[] }) => timeline.blocks.map((block) => block.start).join(',')
  const dur = { pace: 'duration' as const, useBpm: false }
  assert(partKeys([{ id: 'verso' }, { id: 'coro' }, { id: 'verso' }]).join(',') === 'verso,coro,verso~2', 'a part played again keys its occurrence')
  const intro = buildTimeline({ blocks: playBlocks, settings: dur, durationMs: 54_000, introMs: 4_000 })
  assert(intro.totalMs === 50_000 && starts(intro) === '0,10000,30000', `the intro comes off the length ${starts(intro)}`)
  const marked = buildTimeline({ blocks: playBlocks, settings: dur, durationMs: 99_000, parts: { intro: 8000, verso: 20000, coro: 12000 } })
  assert(marked.basis === 'marks' && starts(marked) === '0,8000,28000' && marked.totalMs === 40_000, `full marks win ${starts(marked)}`)
  assert(marked.blocks[2]?.passMs === 6000 && marked.measured === 3, 'a measured repeat splits its passes')
  const partial = buildTimeline({ blocks: playBlocks, settings: dur, durationMs: 48_000, parts: { intro: 8000 } })
  assert(partial.basis === 'marks' && starts(partial) === '0,8000,28000', `the rest shares what is left ${starts(partial)}`)
  const noLength = buildTimeline({ blocks: playBlocks, settings: dur, parts: { intro: 8000 } })
  assert(noLength.blocks[1]?.start === 8000 && noLength.blocks[2]?.start === 24_000, 'without a length the measured rate sets the pace')
  const tempoMarks = buildTimeline({ blocks: playBlocks, settings: { pace: 'tempo', useBpm: true }, bpm: 120, parts: { intro: 8000 } })
  assert(tempoMarks.basis === 'bpm' && tempoMarks.totalMs === 24_000, 'tempo pace ignores marks')
  const stray = buildTimeline({ blocks: playBlocks, settings: dur, durationMs: 50_000, parts: { puente: 9000 } })
  assert(stray.basis === 'duration' && starts(stray) === '0,10000,30000', 'marks for missing parts change nothing')
  const fromMarks = marksToParts(['intro', 'verso', 'coro'], [4000, 12_000, 32_000], 44_000)
  assert(fromMarks.introMs === 4000 && Object.values(fromMarks.parts).join(',') === '8000,20000,12000', 'taps become part lengths')
  assert(Object.keys(marksToParts(['intro', 'verso', 'coro'], [4000, null, 32_000], null).parts).length === 0, 'a missed tap skips its neighbours')
  const cues = cuePoints(byDuration)
  assert(cues.length === 4 && cues[3]?.at === 40_000 && cues[3]?.pass === 2, 'each pass of a repeat is a cue')
  assert(cueIndexAt(cues, -1) === -1 && cueIndexAt(cues, 41_000) === 3, 'cue lookup')
  assert(impliedBpm(refined) === 60 && impliedBpm(byDuration) === null, 'implied tempo only when bars are weighed')
  assert(parsePlaybackSettings('{"pace":"parts"}').pace === 'tempo' && parsePlaybackSettings('junk').audio === 'off', 'old and broken settings load')
  assert(formatClock(-4000) === '\u22120:04' && formatLead(4500) === '0:04,5' && formatLead(-1200) === '\u22120:01,2', 'clock formats')
  const playTrack = { src: 'dQw4w9WgXcQ', introMs: 1000, parts: {} }
  assert(referenceTrack({ youtube: playTrack }, 'off', playMedia) === playTrack, 'silent play borrows the YouTube marks')
  assert(referenceTrack({ youtube: { ...playTrack, src: 'other123456' } }, 'youtube', playMedia) === null, 'marks from another video are stale')
  const cleaned = songPlayback({ youtube: { src: 'x', introMs: -5.4, parts: { verso: 9000, 'bad key': 1, coro: 'x' } }, speed: 1 })
  assert(JSON.stringify(cleaned) === '{"youtube":{"src":"x","introMs":-5,"parts":{"verso":9000}}}', `server cleans playback ${JSON.stringify(cleaned)}`)
  assert(JSON.stringify(songPlayback('junk')) === '{}' && songPlayback({ speed: 3 }).speed === 2, 'junk and speed bounds')
}

{
  const base = '{title: Base}\n{key: G}\n{bpm: 72}\n{start_of_verse: Verso}\n[G]Hola [C]mundo\n{end_of_verse}\n'
  const mine = '{title: Mía}\n{key: G}\n{bpm: 80}\n{duration_ms: 200000}\n{start_of_verse: Verso}\n[G]Hola [D]mundo\n{end_of_verse}\n'
  const changes = songFieldChanges(base, mine, 'prueba')
  const fields = changes.map((change) => change.field)
  assert(fields.includes('Título') && fields.includes('BPM') && fields.includes('Duración'), `diff fields ${fields}`)
  assert(fields.includes('Parte: Verso') && !fields.includes('Tono'), `diff parts ${fields}`)
  assert(changes.find((change) => change.field === 'Duración')?.after === '3:20', 'duration shows as m:ss')
  assert(songFieldChanges(base, base, 'prueba').length === 0, 'same text has no changes')
  const cho = '{title: Base}\n{artist: X}\n{key: G}\n{capo: 2}\n\n{start_of_verse: Verso}\n[G]Hola\n{end_of_verse}\n'
  const md = '---\ntitle: Mía\nartist: Y\nkey: G\nbpm: 80\nsources:\n  - https://youtu.be/abc | YouTube\n---\n\n## Verso\n[G]Hola\n'
  const intoCho = copyChartMedia(shareChartMeta(cho, md), md)
  assert(intoCho.includes('{title: Mía}') && intoCho.includes('{artist: Y}') && intoCho.includes('{capo: 2}'), `meta into chordpro ${intoCho}`)
  assert(intoCho.includes('youtu.be/abc') && intoCho.includes('80') && !intoCho.includes('{artist: X}'), `media into chordpro ${intoCho}`)
  assert(parseChart(intoCho, 'x.cho').title === 'Mía' && intoCho.includes('[G]Hola'), 'chordpro keeps its parts')
  const intoMd = shareChartMeta(md, cho)
  assert(parseChart(intoMd, 'x.song.md').title === 'Base' && intoMd.includes('bpm: 80'), `identity only into markdown ${intoMd}`)
  assert(shareChartMeta(cho, cho) === cho, 'same header leaves the text alone')
  const rows = lineDiff('a\nb\nc', 'a\nx\nc')
  assert(rows.map((row) => row.kind).join() === 'same,del,add,same', `line diff ${rows.map((row) => row.kind)}`)
}

console.log(`Parsed ${files.length} charts`)
