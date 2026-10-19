export type NoteType = 'cue' | 'how' | 'repeat' | 'arrange' | 'free'

export type Spelling = 'letters' | 'degrees' | 'both'

export type SongNote = {
  id: string
  type: NoteType
  text: string
}

export type ChordMark = {
  raw: string
  column: number
  notes: SongNote[]
}

export type ChartLine = {
  chords: ChordMark[]
  lyric: string | null
  notes: SongNote[]
}

export type SongSection = {
  id: string
  label: string
  sameAs?: string
  repeat: number
  notes: SongNote[]
  lines: ChartLine[]
}

export type SongVersion = {
  id: string
  label: string
  flow: string[]
  openNotes: NoteType[]
}

export type SongOrigin = 'catalog' | 'local' | 'copy'

export type Song = {
  id: string
  title: string
  artist: string
  composer: string
  key: string
  source: string
  sections: SongSection[]
  versions: SongVersion[]
  lyricsText: string
  sourceText?: string
  origin?: SongOrigin
  overridden?: boolean
  ownerId?: string
  ownerName?: string
  shared?: boolean
  catalogId?: string | null
  editable?: boolean
  removable?: boolean
  shares?: string[]
  instrument?: string
  hasCopy?: boolean
}

export const NOTE_TYPES: NoteType[] = [
  'cue',
  'how',
  'repeat',
  'arrange',
  'free',
]

export const NOTE_LABEL: Record<NoteType, string> = {
  cue: 'Entrada',
  how: 'Cómo',
  repeat: 'Repite',
  arrange: 'Arreglo',
  free: 'Nota',
}
