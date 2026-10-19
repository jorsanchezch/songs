import { importLocal } from '@/lib/api'
import { loadLibrary } from '@/lib/libraryStore'
import { loadSettings } from '@/lib/settings'
import { DEFAULT_SERVICE_DAYS, type Setlist } from '@/lib/setlists'

export async function migrateLocalSongs(): Promise<void> {
  const library = loadLibrary()
  const settings = loadSettings()
  const storedLists = readStoredLists()
  await importLocal({
    overrides: library.overrides,
    hidden: library.hidden,
    created: library.created,
    hasLists: storedLists != null,
    days: storedLists?.days,
    setlists: storedLists?.lists,
    semitones: settings.semitones,
    chordShapes: settings.chordShapes,
  })
}

function readStoredLists(): { lists: Setlist[]; days: number[] } | null {
  try {
    const raw = localStorage.getItem('songbook-setlists-v1')
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || !parsed.length) return null
    let days = [...DEFAULT_SERVICE_DAYS]
    const daysRaw = localStorage.getItem('songbook-services-v1')
    if (daysRaw) {
      const parsedDays = JSON.parse(daysRaw) as unknown
      if (Array.isArray(parsedDays)) {
        const unique = [...new Set(parsedDays.filter((day) => typeof day === 'number' && day >= 0 && day <= 6))]
        if (unique.length) days = unique
      }
    }
    return { lists: parsed as Setlist[], days }
  } catch {
    return null
  }
}
