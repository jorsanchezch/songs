import { parseChart } from '@/lib/parseChart'
import { formatDurationMmSs, isYoutubeUrl } from '@/lib/songMedia'
import { NOTE_LABEL, type ChartLine, type Song, type SongNote, type SongSection } from '@/lib/types'

export type FieldChange = {
  field: string
  before: string
  after: string
  /** Long fields (parts, references) are shown as a line diff instead of before → after. */
  multiline: boolean
}

export type LineDiff = { kind: 'same' | 'add' | 'del'; text: string }

/** Every field that differs between two charts of the same song, in the order the editor shows them. */
export function songFieldChanges(beforeText: string, afterText: string, id: string): FieldChange[] {
  if (beforeText === afterText) return []
  const before = parse(beforeText, id)
  const after = parse(afterText, id)
  if (!before || !after) return [{ field: 'Texto', before: beforeText, after: afterText, multiline: true }]

  const changes: FieldChange[] = []
  const add = (field: string, a: string, b: string, multiline = false) => {
    if (a !== b) changes.push({ field, before: a, after: b, multiline })
  }
  add('Título', before.title, after.title)
  add('Artista', before.artist, after.artist)
  add('Compositor', before.composer, after.composer)
  add('Tono', before.key, after.key)
  add('Tono original', before.originalKey ?? '', after.originalKey ?? '')
  add('BPM', before.bpm == null ? '' : String(before.bpm), after.bpm == null ? '' : String(after.bpm))
  add('Duración', formatDurationMmSs(before.durationMs), formatDurationMmSs(after.durationMs))
  add('Audio (MP3)', before.audioUrl ?? '', after.audioUrl ?? '')
  add('YouTube', youtubeLinks(before), youtubeLinks(after), true)
  add('Referencias', otherLinks(before), otherLinks(after), true)

  const beforeSections = new Map(before.sections.map((section) => [section.id, section]))
  const afterSections = new Map(after.sections.map((section) => [section.id, section]))
  const order = [...after.sections.map((section) => section.id)]
  for (const section of before.sections) if (!afterSections.has(section.id)) order.push(section.id)
  for (const sectionId of order) {
    const a = beforeSections.get(sectionId)
    const b = afterSections.get(sectionId)
    const label = b?.label || a?.label || sectionId
    add(`Parte: ${label}`, a ? sectionText(a) : '', b ? sectionText(b) : '', true)
  }
  add('Orden de partes', sectionOrder(before), sectionOrder(after))
  add('Versiones', versionsText(before), versionsText(after), true)

  if (!changes.length) {
    changes.push({ field: 'Formato del texto', before: beforeText, after: afterText, multiline: true })
  }
  return changes
}

/** Longest-common-subsequence line diff; charts are small enough that the quadratic table is fine. */
export function lineDiff(before: string, after: string): LineDiff[] {
  const a = before ? before.split('\n') : []
  const b = after ? after.split('\n') : []
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const out: LineDiff[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! })
      i += 1
    } else {
      out.push({ kind: 'add', text: b[j]! })
      j += 1
    }
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++]! })
  while (j < b.length) out.push({ kind: 'add', text: b[j++]! })
  return out
}

function parse(text: string, id: string): Song | null {
  try {
    return parseChart(text, `${id}.${text.trimStart().startsWith('---') ? 'song.md' : 'cho'}`)
  } catch {
    return null
  }
}

function youtubeLinks(song: Song): string {
  return song.sources
    .filter((item) => isYoutubeUrl(item.url))
    .map((item) => item.url)
    .join('\n')
}

function otherLinks(song: Song): string {
  const sources = song.sources.length ? song.sources : song.source ? [{ url: song.source, label: '' }] : []
  return sources
    .filter((item) => !isYoutubeUrl(item.url))
    .map((item) => (item.label ? `${item.label}: ${item.url}` : item.url))
    .join('\n')
}

function noteText(notes: SongNote[]): string[] {
  return notes.map((note) => `(${NOTE_LABEL[note.type]}: ${note.text})`)
}

function lineText(line: ChartLine): string {
  const chordNotes = line.chords.flatMap((chord) => noteText(chord.notes))
  let text: string
  if (line.lyric == null) {
    text = line.chords.map((chord) => `[${chord.raw}]`).join(' ')
  } else {
    text = line.lyric
    const chords = [...line.chords].sort((x, y) => y.column - x.column)
    for (const chord of chords) {
      const at = Math.min(Math.max(chord.column, 0), text.length)
      text = `${text.slice(0, at)}[${chord.raw}]${text.slice(at)}`
    }
  }
  return [text, ...noteText(line.notes), ...chordNotes].filter(Boolean).join(' ')
}

function sectionText(section: SongSection): string {
  const head = [section.label, section.repeat > 1 ? `×${section.repeat}` : '', section.sameAs ? `igual que ${section.sameAs}` : '']
    .filter(Boolean)
    .join(' · ')
  return [head, ...noteText(section.notes), ...section.lines.map(lineText)].join('\n')
}

function sectionOrder(song: Song): string {
  return song.sections.map((section) => section.label).join(' → ')
}

function versionsText(song: Song): string {
  return song.versions
    .map((version) => `${version.label}: ${version.flow.join(' → ')}`)
    .join('\n')
}
