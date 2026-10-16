export type SetlistItem = {
  songId: string
  semitones: number
}

export type Evergreen = {
  weekday: number
  serviceDate: string | null
}

export type Setlist = {
  id: string
  name: string
  items: SetlistItem[]
  evergreen?: Evergreen
}

export const WEEKDAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 0, name: 'Domingo' },
] as const

export const DEFAULT_SERVICE_DAYS = [3, 6, 0]

const SERVICES_KEY = 'songbook-services-v1'

export function serviceListName(weekday: number): string {
  const name = WEEKDAYS.find((day) => day.id === weekday)?.name ?? 'día'
  return `Servicio del próximo ${name.toLocaleLowerCase('es')}`
}

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function nextServiceDate(from: Date, weekday: number): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const delta = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + delta)
  return isoDate(date)
}

export function formatServiceDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function evergreenStatus(list: Setlist, today = new Date()): string {
  if (!list.evergreen) return ''
  const { serviceDate } = list.evergreen
  if (!serviceDate) return 'Vacía hasta que agregues una canción.'
  if (isoDate(today) > serviceDate) {
    return `Último servicio: ${formatServiceDay(serviceDate)}. Se vacía al agregar otra canción.`
  }
  return `Para el ${formatServiceDay(serviceDate)}.`
}

export function planEvergreenAdd(
  evergreen: Evergreen,
  items: SetlistItem[],
  songId: string,
  today: Date,
): { evergreen: Evergreen; items: SetlistItem[] } {
  const stale = evergreen.serviceDate != null && isoDate(today) > evergreen.serviceDate
  const base = stale ? [] : items
  if (!stale && base.some((item) => item.songId === songId)) return { evergreen, items }
  return {
    items: [...base, { songId, semitones: 0 }],
    evergreen: {
      weekday: evergreen.weekday,
      serviceDate:
        stale || !evergreen.serviceDate ? nextServiceDate(today, evergreen.weekday) : evergreen.serviceDate,
    },
  }
}

const KEY = 'songbook-setlists-v1'
const listeners = new Set<() => void>()

function weekRank(day: number): number {
  return day === 0 ? 7 : day
}

function read(): Setlist[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Setlist[]
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((list) => {
      const normalized = normalizeSetlist(list)
      return normalized ? [normalized] : []
    })
  } catch {
    return []
  }
}

function normalizeSetlist(list: Setlist): Setlist | null {
  if (!list || typeof list.id !== 'string' || typeof list.name !== 'string') return null
  const items = Array.isArray(list.items)
    ? list.items.flatMap((item) =>
        item && typeof item.songId === 'string'
          ? [{ songId: item.songId, semitones: typeof item.semitones === 'number' ? item.semitones : 0 }]
          : [],
      )
    : []
  const weekday = list.evergreen?.weekday
  if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) return { id: list.id, name: list.name, items }
  const serviceDate = typeof list.evergreen?.serviceDate === 'string' ? list.evergreen.serviceDate : null
  return { id: list.id, name: list.name, items, evergreen: { weekday, serviceDate } }
}

function write(lists: Setlist[]) {
  localStorage.setItem(KEY, JSON.stringify(lists))
  listeners.forEach((listener) => listener())
}

export function loadServiceDays(): number[] {
  try {
    const raw = localStorage.getItem(SERVICES_KEY)
    if (!raw) return [...DEFAULT_SERVICE_DAYS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_SERVICE_DAYS]
    return [...new Set(parsed.filter((day) => typeof day === 'number' && day >= 0 && day <= 6))]
  } catch {
    return [...DEFAULT_SERVICE_DAYS]
  }
}

export function saveServiceDays(days: number[]) {
  const unique = [...new Set(days.filter((day) => day >= 0 && day <= 6))]
  localStorage.setItem(SERVICES_KEY, JSON.stringify(unique))
  syncEvergreen(unique)
}

function syncEvergreen(days: number[]) {
  const ordered = [...days].sort((a, b) => weekRank(a) - weekRank(b))
  const current = read()
  const evergreen = ordered.map((weekday) => {
    const existing = current.find((list) => list.evergreen?.weekday === weekday)
    if (existing?.evergreen) return { ...existing, name: serviceListName(weekday) }
    return {
      id: `servicio-${weekday}`,
      name: serviceListName(weekday),
      items: [],
      evergreen: { weekday, serviceDate: null },
    }
  })
  const custom = current.filter((list) => !list.evergreen)
  const next = [...evergreen, ...custom]
  if (JSON.stringify(next) === JSON.stringify(current)) return
  write(next)
}

function ensureServices() {
  if (!localStorage.getItem(SERVICES_KEY)) {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(DEFAULT_SERVICE_DAYS))
  }
  syncEvergreen(loadServiceDays())
}

export function loadSetlists(): Setlist[] {
  ensureServices()
  return read()
}

export function subscribeSetlists(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function createSetlist(name: string): string {
  const id = `lista-${Date.now()}`
  write([...read(), { id, name: name.trim(), items: [] }])
  return id
}

export function renameSetlist(id: string, name: string) {
  write(read().map((list) => (list.id === id ? { ...list, name: name.trim() || list.name } : list)))
}

export function removeSetlist(id: string) {
  write(read().filter((list) => list.id !== id))
}

export function addSetlistSong(id: string, songId: string, today = new Date()) {
  write(
    read().map((list) => {
      if (list.id !== id) return list
      if (list.evergreen) {
        const next = planEvergreenAdd(list.evergreen, list.items, songId, today)
        return { ...list, ...next }
      }
      if (list.items.some((item) => item.songId === songId)) return list
      return { ...list, items: [...list.items, { songId, semitones: 0 }] }
    }),
  )
}

export function removeSetlistSong(id: string, index: number) {
  write(
    read().map((list) =>
      list.id === id ? { ...list, items: list.items.filter((_, itemIndex) => itemIndex !== index) } : list,
    ),
  )
}

export function reorderSetlistSong(id: string, from: number, to: number) {
  write(
    read().map((list) => {
      if (list.id !== id || from === to) return list
      if (from < 0 || to < 0 || from >= list.items.length || to >= list.items.length) return list
      const items = [...list.items]
      const [moved] = items.splice(from, 1)
      if (!moved) return list
      items.splice(to, 0, moved)
      return { ...list, items }
    }),
  )
}

export function moveSetlistSong(id: string, index: number, direction: -1 | 1) {
  write(
    read().map((list) => {
      if (list.id !== id) return list
      const next = index + direction
      if (next < 0 || next >= list.items.length) return list
      const items = [...list.items]
      const current = items[index]
      const swap = items[next]
      if (!current || !swap) return list
      items[index] = swap
      items[next] = current
      return { ...list, items }
    }),
  )
}

export function setSetlistSemitones(id: string, index: number, semitones: number) {
  const wrapped = semitones > 11 ? semitones - 12 : semitones < -11 ? semitones + 12 : semitones
  write(
    read().map((list) =>
      list.id === id
        ? {
            ...list,
            items: list.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, semitones: wrapped } : item,
            ),
          }
        : list,
    ),
  )
}

export function songPath(songId: string, setlistId?: string | null): string {
  const path = `/c/${encodeURIComponent(songId)}`
  return setlistId ? `${path}?lista=${encodeURIComponent(setlistId)}` : path
}

export function neighborSong(ids: string[], currentId: string, direction: -1 | 1): string | null {
  if (!ids.length) return null
  const index = ids.indexOf(currentId)
  if (index < 0) return direction > 0 ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null)
  return ids[index + direction] ?? null
}
