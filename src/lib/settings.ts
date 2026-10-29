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
  /** Guitar charts: hide a slash chord's bass and keep the chord itself. */
  slashAsDegree: boolean
  /**
   * Live nav: split tall parts into viewport-sized jumps (chips/arrows only).
   * Does not change fold modes or how the chart is drawn.
   */
  viewportJumps: boolean
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
  slashAsDegree: true,
  viewportJumps: false,
}

function savedSpelling(value: unknown): Spelling {
  return value === 'letters' || value === 'degrees' || value === 'both' ? value : 'both'
}

function savedFold(parsed: { fold?: unknown; concise?: unknown }): FoldMode {
  if (
    parsed.fold === 'collapse' ||
    parsed.fold === 'byChords' ||
    parsed.fold === 'chordsOnly' ||
    parsed.fold === 'openChords' ||
    parsed.fold === 'full'
  ) {
    return parsed.fold
  }
  if (parsed.fold === 'concise' || parsed.concise === true) return 'collapse'
  if (parsed.fold === 'music') return 'byChords'
  return 'full'
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
      slashAsDegree: parsed.slashAsDegree !== false,
      viewportJumps: parsed.viewportJumps === true,
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
