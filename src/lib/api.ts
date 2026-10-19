import type { Account } from '@/lib/access'
import { SESSION_KEY, setCurrentUser } from '@/lib/currentSession'
import type { InstrumentId } from '@/lib/instruments'

type SetlistPayload = {
  id: string
  name: string
  items: { songId: string; semitones: number }[]
  evergreen?: { weekday: number; serviceDate: string | null }
}

export type ApiSong = {
  id: string
  title: string
  artist: string
  composer: string
  key: string
  source: string
  sourceText: string
  origin: 'catalog' | 'local' | 'copy'
  ownerId: string
  ownerName: string
  shared: boolean
  catalogId: string | null
  editable: boolean
  removable: boolean
  diverged: boolean
  instrument: InstrumentId
  shares: string[]
  hasCopy: boolean
  revision: number
  partRevision: number
}

export type PartText = {
  sourceText: string
  revision: number
}

export type SongList = {
  songs: ApiSong[]
  hiddenCount: number
  needsSeed: boolean
  instrument: InstrumentId
}

type ShareBody = { shared?: boolean; userId?: string; include?: boolean }

export async function bootSession(): Promise<Account> {
  const token = localStorage.getItem(SESSION_KEY)
  if (token) {
    try {
      return await me()
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
  }
  return signIn('Jorge Sanchez')
}

export async function me(): Promise<Account> {
  const data = await request<{ user: Account }>('/api/session')
  setCurrentUser(data.user)
  return data.user
}

export async function signIn(name: string): Promise<Account> {
  const data = await request<{ token: string; user: Account }>('/api/session', {
    method: 'POST',
    body: { name },
    auth: false,
  })
  localStorage.setItem(SESSION_KEY, data.token)
  setCurrentUser(data.user)
  return data.user
}

export async function listUsers(): Promise<Account[]> {
  const data = await request<{ users: Account[] }>('/api/users')
  return data.users
}

export function listSongs(instrument: InstrumentId): Promise<SongList> {
  return request<SongList>(`/api/songs?instrument=${encodeURIComponent(instrument)}`)
}

export function getSong(id: string, instrument: InstrumentId): Promise<{ song: ApiSong }> {
  return request(`/api/songs/${encodeURIComponent(id)}?instrument=${encodeURIComponent(instrument)}`)
}

export function createSong(sourceText: string, id?: string): Promise<{ song: ApiSong }> {
  return request('/api/songs', { method: 'POST', body: { sourceText, id } })
}

export function saveSong(
  id: string,
  sourceText: string,
  instrument: InstrumentId,
  revision: number,
  partRevision: number,
): Promise<{ song: ApiSong; parts: Record<string, PartText> }> {
  return request(`/api/songs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { sourceText, instrument, revision, partRevision },
  })
}

export function importLocal(body: {
  overrides: Record<string, string>
  hidden: string[]
  created: Record<string, string>
  hasLists: boolean
  days?: number[]
  setlists?: SetlistPayload[]
  semitones: Record<string, number>
  chordShapes: Record<string, Record<string, string>>
}): Promise<{ ok: boolean; skipped: boolean; lists?: 'imported' | 'kept' }> {
  return request('/api/import-local', { method: 'POST', body })
}

export function getPrefs(): Promise<{
  prefs: { semitones: Record<string, number>; chordShapes: Record<string, Record<string, string>> } | null
}> {
  return request('/api/prefs')
}

export function putPrefs(body: {
  semitones: Record<string, number>
  chordShapes: Record<string, Record<string, string>>
}): Promise<{ prefs: { semitones: Record<string, number>; chordShapes: Record<string, Record<string, string>> } }> {
  return request('/api/prefs', { method: 'PUT', body })
}

export function deleteSong(id: string): Promise<{ ok: boolean }> {
  return request(`/api/songs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function copySong(id: string): Promise<{ song: ApiSong }> {
  return request(`/api/songs/${encodeURIComponent(id)}/copy`, { method: 'POST', body: {} })
}

export function shareSong(id: string, body: ShareBody): Promise<{ song: ApiSong }> {
  return request(`/api/songs/${encodeURIComponent(id)}/share`, { method: 'POST', body })
}

export function restoreSong(id: string): Promise<{ song: ApiSong }> {
  return request(`/api/songs/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} })
}

export function revealSongs(): Promise<{ ok: boolean }> {
  return request('/api/songs/reveal', { method: 'POST', body: {} })
}

export function getSetlists(): Promise<{ days: number[]; setlists: SetlistPayload[] }> {
  return request('/api/setlists')
}

export function putSetlists(
  days: number[],
  setlists: SetlistPayload[],
): Promise<{ days: number[]; setlists: SetlistPayload[] }> {
  return request('/api/setlists', { method: 'PUT', body: { days, setlists } })
}

function apiRoot(): string {
  const value = import.meta.env?.VITE_SONGBOOK_API
  return typeof value === 'string' ? value.replace(/\/$/, '') : ''
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; auth?: boolean }): Promise<T> {
  const headers = new Headers()
  const token = localStorage.getItem(SESSION_KEY)
  if (token && init?.auth !== false) headers.set('authorization', `Bearer ${token}`)
  if (init?.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`${apiRoot()}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await response.text()
  let data: { error?: string } = {}
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string }
    } catch {
      data = {}
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`) as Error & { status: number }
    error.status = response.status
    throw error
  }
  return data as T
}
