import { getSetlists, putSetlists, type DayListHistoryPayload } from '@/lib/api'

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

export type DayListHistory = {
  id: string
  weekday: number
  serviceDate: string
  items: SetlistItem[]
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

/** The day after the stored service date, the next added song replaces the list. */
export function dayListIsDue(evergreen: Evergreen, today: Date): boolean {
  return evergreen.serviceDate != null && isoDate(today) > evergreen.serviceDate
}

export function closeRotatedDayList(
  evergreen: Evergreen,
  items: SetlistItem[],
  today: Date,
): DayListHistory | null {
  if (!dayListIsDue(evergreen, today) || !evergreen.serviceDate || items.length === 0) return null
  return {
    id: `historial-${evergreen.weekday}-${evergreen.serviceDate}`,
    weekday: evergreen.weekday,
    serviceDate: evergreen.serviceDate,
    items: items.map((item) => ({ songId: item.songId, semitones: item.semitones })),
  }
}

export function rememberClosedDayList(history: DayListHistory[], closed: DayListHistory | null): DayListHistory[] {
  if (!closed || history.some((entry) => entry.id === closed.id)) return history
  return [...history, closed]
}

export function planEvergreenAdd(
  evergreen: Evergreen,
  items: SetlistItem[],
  songId: string,
  today: Date,
): { evergreen: Evergreen; items: SetlistItem[]; closed: DayListHistory | null } {
  const stale = dayListIsDue(evergreen, today)
  const closed = closeRotatedDayList(evergreen, items, today)
  const base = stale ? [] : items
  if (!stale && base.some((item) => item.songId === songId)) return { evergreen, items, closed: null }
  return {
    items: [...base, { songId, semitones: 0 }],
    evergreen: {
      weekday: evergreen.weekday,
      serviceDate:
        stale || !evergreen.serviceDate ? nextServiceDate(today, evergreen.weekday) : evergreen.serviceDate,
    },
    closed,
  }
}

const listeners = new Set<() => void>()
let snapshot: { lists: Setlist[]; days: number[]; history: DayListHistory[] } = {
  lists: [],
  days: [...DEFAULT_SERVICE_DAYS],
  history: [],
}
let ready = false
let hydrating: Promise<void> | null = null
let persistChain: Promise<void> = Promise.resolve()

function weekRank(day: number): number {
  return day === 0 ? 7 : day
}

function read(): Setlist[] {
  return snapshot.lists
}

function emitLists() {
  listeners.forEach((listener) => listener())
}

function normalizeHistory(entries: DayListHistoryPayload[] | undefined): DayListHistory[] {
  if (!Array.isArray(entries)) return []
  const seen = new Set<string>()
  const history: DayListHistory[] = []
  for (const entry of entries) {
    const weekday = entry?.weekday
    const serviceDate = entry?.serviceDate
    if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) continue
    if (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) continue
    const items = Array.isArray(entry.items)
      ? entry.items.flatMap((item) =>
          item && typeof item.songId === 'string'
            ? [{ songId: item.songId, semitones: typeof item.semitones === 'number' ? item.semitones : 0 }]
            : [],
        )
      : []
    if (!items.length) continue
    const id = `historial-${weekday}-${serviceDate}`
    if (seen.has(id)) continue
    seen.add(id)
    history.push({ id, weekday, serviceDate, items })
  }
  return history
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

function write(lists: Setlist[], history: DayListHistory[] = snapshot.history) {
  snapshot = { ...snapshot, lists, history }
  emitLists()
  if (ready) void persist()
}

function persist() {
  const run = persistChain.then(async () => {
    if (!ready) return
    const current = snapshot
    try {
      await putSetlists(current.days, current.lists, current.history)
    } catch (error) {
      console.error(error)
    }
  })
  persistChain = run.then(
    () => undefined,
    () => undefined,
  )
}

export function loadServiceDays(): number[] {
  return snapshot.days
}

export function saveServiceDays(days: number[]) {
  const unique = [...new Set(days.filter((day) => day >= 0 && day <= 6))]
  snapshot = { ...snapshot, days: unique }
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
  if (JSON.stringify(next) === JSON.stringify(current)) {
    emitLists()
    if (ready) void persist()
    return
  }
  write(next)
}

export function loadSetlists(): Setlist[] {
  return read()
}

export function loadDayListHistory(): DayListHistory[] {
  return snapshot.history
}

export async function hydrateSetlists(): Promise<void> {
  if (ready) return
  if (hydrating) return hydrating
  hydrating = (async () => {
    const remote = await getSetlists()
    const lists = remote.setlists.flatMap((list) => {
      const normalized = normalizeSetlist(list)
      return normalized ? [normalized] : []
    })
    const days = remote.days.length ? remote.days : [...DEFAULT_SERVICE_DAYS]
    snapshot = { lists, days, history: normalizeHistory(remote.history) }
    ready = true
    emitLists()
  })()
  try {
    await hydrating
  } finally {
    hydrating = null
  }
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
  let history = snapshot.history
  const lists = read().map((list) => {
    if (list.id !== id) return list
    if (list.evergreen) {
      const next = planEvergreenAdd(list.evergreen, list.items, songId, today)
      history = rememberClosedDayList(history, next.closed)
      return { ...list, evergreen: next.evergreen, items: next.items }
    }
    if (list.items.some((item) => item.songId === songId)) return list
    return { ...list, items: [...list.items, { songId, semitones: 0 }] }
  })
  write(lists, history)
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
