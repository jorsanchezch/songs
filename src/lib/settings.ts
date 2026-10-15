import type { NoteType, Spelling } from '@/lib/types'
import { NOTE_TYPES } from '@/lib/types'

const STORAGE = 'cancionero-v1'
export const THEME_KEY = 'cancionero-theme'

export type ViewSettings = {
  theme: 'dark' | 'light'
  spelling: Spelling
  fontSize: number
  showChords: boolean
  concise: boolean
  visibleNotes: NoteType[]
  semitones: Record<string, number>
}

const DEFAULTS: ViewSettings = {
  theme: 'dark',
  spelling: 'letters',
  fontSize: 22,
  showChords: true,
  concise: false,
  visibleNotes: [...NOTE_TYPES],
  semitones: {},
}

export function loadSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return { ...DEFAULTS, visibleNotes: [...NOTE_TYPES], semitones: {} }
    const parsed = JSON.parse(raw) as Partial<ViewSettings>
    return {
      ...DEFAULTS,
      ...parsed,
      visibleNotes: parsed.visibleNotes?.length ? parsed.visibleNotes : [...NOTE_TYPES],
      semitones: parsed.semitones ?? {},
    }
  } catch {
    return { ...DEFAULTS, visibleNotes: [...NOTE_TYPES], semitones: {} }
  }
}

export function saveSettings(settings: ViewSettings) {
  localStorage.setItem(STORAGE, JSON.stringify(settings))
  localStorage.setItem(THEME_KEY, settings.theme)
  document.documentElement.classList.toggle('dark', settings.theme === 'dark')
}
