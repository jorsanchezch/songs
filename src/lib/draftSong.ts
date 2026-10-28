import { parseKey, prefersFlats, transposeChordSymbol } from '@/lib/chords'
import type { ChartLine, NoteType, Song, SongNote, SongSection, SongVersion } from '@/lib/types'

let seq = 0

export function freshId(prefix = 'e'): string {
  seq += 1
  return `${prefix}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function blankNote(type: NoteType = 'free'): SongNote {
  return { id: freshId('n'), type, text: '' }
}

export function blankLine(): ChartLine {
  return { chords: [], lyric: '', notes: [] }
}

export function blankSection(label: string, id: string): SongSection {
  return { id, label, repeat: 1, notes: [], lines: [blankLine()] }
}

export function blankSong(): Song {
  return {
    id: 'nueva',
    title: '',
    artist: '',
    composer: '',
    key: '',
    source: '',
    sources: [],
    sections: [blankSection('Verso', 'verso')],
    versions: [],
    lyricsText: '',
  }
}

export function blankVersion(label: string, flow: string[]): SongVersion {
  const id = uniqueId(slugify(label) || 'version', new Set(flow))
  return { id, label, flow, openNotes: [] }
}

export function uniqueId(base: string, used: Set<string>): string {
  const root = base || 'parte'
  if (!used.has(root)) return root
  let count = 2
  while (used.has(`${root}-${count}`)) count += 1
  return `${root}-${count}`
}

export function usedSectionIds(song: Song): Set<string> {
  return new Set(song.sections.map((section) => section.id))
}

/** Keep `C#` and `Cm` as written. `parseKey` needs the lowercase `m`. */
export function normalizeKeyText(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^([A-Ga-g])(#|b)?(m)?$/i)
  if (!match) return trimmed
  return `${(match[1] ?? 'C').toUpperCase()}${match[2] ?? ''}${match[3] ? 'm' : ''}`
}

/** Change the editing key, transpose chord symbols, and freeze the original key. */
export function applyEditingKey(song: Song, nextKey: string): Song {
  const next = normalizeKeyText(nextKey)
  const current = song.key.trim()
  if (next === current) return song
  const from = parseKey(current)
  const to = parseKey(next)
  const steps = from.valid && to.valid ? (to.pc - from.pc + 12) % 12 : 0
  const frozen = song.originalKey?.trim() || current
  const originalKey = frozen && frozen !== next ? frozen : undefined
  if (!from.valid || !to.valid || steps === 0) return { ...song, key: next, originalKey }
  const flats = next.includes('b') ? true : next.includes('#') ? false : prefersFlats(to.pc, to.minor)
  return {
    ...song,
    key: next,
    originalKey,
    sections: song.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        chords: line.chords.map((chord) => ({
          ...chord,
          raw: transposeChordSymbol(chord.raw, steps, flats),
        })),
      })),
    })),
  }
}

/** Record the original key without moving the chords. */
export function applyOriginalKey(song: Song, nextKey: string): Song {
  const next = normalizeKeyText(nextKey)
  if (!next || next === song.key.trim()) return { ...song, originalKey: undefined }
  return { ...song, originalKey: next }
}
