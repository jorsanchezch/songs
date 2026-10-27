import { DEFAULT_INSTRUMENT, isInstrument, type InstrumentId } from '@/lib/instruments'
import type { NoteType, Spelling } from '@/lib/types'
import { NOTE_TYPES } from '@/lib/types'

const STORAGE = 'songbook-v1'
export const THEME_KEY = 'songbook-theme'

export type ViewSettings = {
  theme: 'dark' | 'light'
  spelling: Spelling
  fontSize: number
  showChords: boolean
  showDiagrams: boolean
  concise: boolean
  visibleNotes: NoteType[]
  semitones: Record<string, number>
  chordShapes: Record<string, Record<string, string>>
  instrument: InstrumentId
}

const DEFAULTS: ViewSettings = {
  theme: 'dark',
  spelling: 'letters',
  fontSize: 22,
  showChords: true,
  showDiagrams: true,
  concise: false,
  visibleNotes: [...NOTE_TYPES],
  semitones: {},
  chordShapes: {},
  instrument: DEFAULT_INSTRUMENT,
}

export function loadSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return { ...DEFAULTS, visibleNotes: [...NOTE_TYPES], semitones: {}, chordShapes: {} }
    const parsed = JSON.parse(raw) as Partial<ViewSettings>
    const spelling =
      parsed.spelling === 'letters' || parsed.spelling === 'degrees' || parsed.spelling === 'both'
        ? parsed.spelling
        : DEFAULTS.spelling
    return {
      ...DEFAULTS,
      ...parsed,
      spelling,
      visibleNotes: parsed.visibleNotes?.length ? parsed.visibleNotes : [...NOTE_TYPES],
      semitones: parsed.semitones ?? {},
      chordShapes: parsed.chordShapes ?? {},
      instrument: isInstrument(parsed.instrument) ? parsed.instrument : DEFAULT_INSTRUMENT,
    }
  } catch {
    return { ...DEFAULTS, visibleNotes: [...NOTE_TYPES], semitones: {}, chordShapes: {} }
  }
}

export function saveSettings(settings: ViewSettings) {
  localStorage.setItem(STORAGE, JSON.stringify(settings))
  localStorage.setItem(THEME_KEY, settings.theme)
  document.documentElement.classList.toggle('dark', settings.theme === 'dark')
}
