import type { FoldMode } from '@/lib/display'
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
  fold: FoldMode
  visibleNotes: NoteType[]
  semitones: Record<string, number>
  chordShapes: Record<string, Record<string, string>>
  instrument: InstrumentId
}

const DEFAULTS: ViewSettings = {
  theme: 'dark',
  spelling: 'both',
  fontSize: 22,
  showChords: true,
  showDiagrams: true,
  fold: 'full',
  visibleNotes: [...NOTE_TYPES],
  semitones: {},
  chordShapes: {},
  instrument: DEFAULT_INSTRUMENT,
}

function savedSpelling(value: unknown): Spelling {
  return value === 'letters' || value === 'degrees' || value === 'both' ? value : 'both'
}

function savedFold(parsed: { fold?: unknown; concise?: unknown }): FoldMode {
  if (parsed.fold === 'full' || parsed.fold === 'concise' || parsed.fold === 'music') return parsed.fold
  return parsed.concise === true ? 'concise' : 'full'
}

export function loadSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return { ...DEFAULTS, visibleNotes: [...NOTE_TYPES], semitones: {}, chordShapes: {} }
    const parsed = JSON.parse(raw) as Partial<ViewSettings> & { concise?: boolean }
    return {
      ...DEFAULTS,
      ...parsed,
      spelling: savedSpelling(parsed.spelling),
      showChords: true,
      visibleNotes: parsed.visibleNotes?.length ? parsed.visibleNotes : [...NOTE_TYPES],
      semitones: parsed.semitones ?? {},
      chordShapes: parsed.chordShapes ?? {},
      fold: savedFold(parsed),
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
