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

export type SongSource = {
  url: string
  label: string
}

export type Song = {
  id: string
  title: string
  artist: string
  composer: string
  key: string
  /** Frozen when the editing key changes. Omitted when it matches `key`. */
  originalKey?: string
  source: string
  sources: SongSource[]
  /** Beats per minute when known. */
  bpm?: number | null
  /** Full-song length in milliseconds when known. */
  durationMs?: number | null
  /** Optional MP3 (or other audio) URL for playback. */
  audioUrl?: string
  /** Playback calibration measured on a recording; stored beside the chart, not in it. */
  playback?: SongPlayback
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

/** What each marker is in the chart, from the parser’s note kinds. */
export const NOTE_HINT: Record<NoteType, string> = {
  cue: 'Muestra las entradas: comentarios en la línea que no son otra marca.',
  how: 'Muestra cómo se toca: arpegio, muteado, slide o riff.',
  repeat: 'Muestra las repeticiones: repeat, × o (//).',
  arrange: 'Muestra el arreglo: solo, batería o guitarra fuera.',
  free: 'Muestra las notas libres que no entran en las otras marcas.',
}

export type PlaybackTrack = {
  /** YouTube video id or MP3 URL these numbers were measured on. */
  src: string
  /** Media time before the first part starts. */
  introMs: number
  /** Measured length of each part (all passes), by part key. */
  parts: Record<string, number>
}

export type SongPlayback = { youtube?: PlaybackTrack; mp3?: PlaybackTrack; speed?: number }
