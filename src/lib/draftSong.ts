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
    sections: [blankSection('Estrofa', 'estrofa')],
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
