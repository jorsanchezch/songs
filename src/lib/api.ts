import type { Account, Role } from '@/lib/access'
import { SESSION_KEY, setCurrentUser } from '@/lib/currentSession'
import type { InstrumentId } from '@/lib/instruments'
import type { SongPlayback } from '@/lib/types'

type SetlistPayload = {
  id: string
  name: string
  items: { songId: string; semitones: number }[]
  evergreen?: { weekday: number; serviceDate: string | null }
}

export type DayListHistoryPayload = {
  id: string
  weekday: number
  serviceDate: string
  items: { songId: string; semitones: number }[]
}

export type ApiSong = {
  id: string
  title: string
  artist: string
  composer: string
  key: string
  source: string
  sourceText: string
  bpm: number | null
  durationMs: number | null
  audioUrl: string
  playback?: SongPlayback
  origin: 'catalog' | 'local' | 'copy'
  ownerId: string
  ownerName: string
  creatorId: string
  creatorName: string
  shared: boolean
  catalogId: string | null
  editable: boolean
  /** Cannot change the shared song, so saving keeps a personal version. */
  personal: boolean
  /** This person's version for this instrument, when they saved one. */
  draft: SongDraftInfo | null
  /** Staff only: how many people saved their own version. */
  draftUsers: number
  removable: boolean
  diverged: boolean
  instrument: InstrumentId
  shares: string[]
  hasCopy: boolean
  revision: number
  partRevision: number
}

export type SongDraftInfo = {
  updatedAt: string
  edited: boolean
  /** The shared song changed after this version started. */
  stale: boolean
}

export type UserSongVersion = {
  userId: string
  userName: string
  instrument: InstrumentId
  sourceText: string
  baseText: string
  canonicalText: string
  stale: boolean
  createdAt: string
  updatedAt: string
}

export type SongVersions = {
  song: { id: string; title: string; revision: number; creatorId: string; creatorName: string }
  drafts: UserSongVersion[]
}

export type PartText = {
  sourceText: string
  revision: number
  /** True when this text is the person's own version, not the shared part. */
  draft?: boolean
}

export type SongList = {
  songs: ApiSong[]
  hiddenCount: number
  needsSeed: boolean
  instrument: InstrumentId
}

type ShareBody = { shared?: boolean; userId?: string; include?: boolean }

export async function bootSession(): Promise<Account | null> {
  const token = localStorage.getItem(SESSION_KEY)
  if (!token) return null
  try {
    return await me()
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export async function me(): Promise<Account> {
  const data = await request<{ user: Account }>('/api/session')
  setCurrentUser(data.user)
  return data.user
}

export async function signIn(username: string, password: string): Promise<Account> {
  const data = await request<{ token: string; user: Account }>('/api/session', {
    method: 'POST',
    body: { username: username.trim(), password: password.trim() },
    auth: false,
  })
  localStorage.setItem(SESSION_KEY, data.token)
  setCurrentUser(data.user)
  return data.user
}

export async function signOut(): Promise<void> {
  try {
    await request('/api/session', { method: 'DELETE' })
  } finally {
    localStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
  }
}

export async function putPassword(password: string): Promise<Account> {
  const data = await request<{ user: Account }>('/api/profile/password', {
    method: 'PUT',
    body: { password },
  })
  setCurrentUser(data.user)
  return data.user
}

export type AdminSongRef = {
  id: string
  title: string
  shared: boolean
}

export type AdminPerson = Account & {
  copies: AdminSongRef[]
  created: AdminSongRef[]
  catalogCount: number
}

export type AdminInventory = {
  users: number
  catalogSongs: number
  personalCopies: number
  sharedCopies: number
  createdSongs: number
  userVersions: number
  setlists: number
  serviceDays: number
}

export type AdminDraftSummary = {
  songId: string
  title: string
  users: { id: string; name: string; updatedAt: string }[]
}

export type AdminOverview = {
  me: Account
  users: AdminPerson[]
  drafts: AdminDraftSummary[]
  inventory: AdminInventory
}

export function getAdmin(): Promise<AdminOverview> {
  return request('/api/admin')
}

export type MediaBackfillReport = {
  apiKeyPresent: boolean
  r2Configured: boolean
  dryRun: boolean
  searchQuota: { day: string; used: number; limit: number; remaining: number }
  missingBefore: number
  updated: number
  skipped: number
  queued: number
  errors: number
  queueSize: number
  results: Array<{
    id: string
    title: string
    status: 'updated' | 'skipped' | 'queued' | 'error'
    reason?: string
    youtubeUrl?: string
    durationMs?: number | null
    bpm?: number | null
    audio?: string
    via?: string
  }>
  note?: string
}

export function getMediaBackfill(): Promise<MediaBackfillReport> {
  return request('/api/admin/media-backfill')
}

export function runMediaBackfill(body: {
  limit?: number
  dryRun?: boolean
  extractAudio?: boolean
} = {}): Promise<MediaBackfillReport> {
  return request('/api/admin/media-backfill', { method: 'POST', body })
}

export type FoundMedia = { youtubeUrl: string; videoTitle: string; durationMs: number | null; bpm: number | null }

/** Best YouTube match for a title, in the song's language, with its length. */
export function lookupSongMedia(title: string, artist: string): Promise<{ media: FoundMedia | null }> {
  const query = new URLSearchParams({ title, artist })
  return request(`/api/media/lookup?${query}`)
}

export type AudioExtractReport = {
  extractorAvailable: boolean
  r2Configured: boolean
  storeReady: boolean
  dryRun: boolean
  missingAudio: number
  updated: number
  skipped: number
  errors: number
  results: Array<{
    id: string
    title: string
    status: 'updated' | 'skipped' | 'error'
    reason?: string
    audioUrl?: string
    youtubeUrl?: string
  }>
  note?: string
  blocked?: boolean
}

export function getAudioExtract(): Promise<AudioExtractReport> {
  return request('/api/admin/audio-extract')
}

export function runAudioExtract(body: { limit?: number; dryRun?: boolean } = {}): Promise<AudioExtractReport> {
  return request('/api/admin/audio-extract', { method: 'POST', body })
}

export async function uploadAudioFile(file: File, songId?: string): Promise<{ audioUrl: string; key: string }> {
  const headers = new Headers()
  const token = localStorage.getItem(SESSION_KEY)
  if (token) headers.set('authorization', `Bearer ${token}`)
  const form = new FormData()
  form.append('file', file)
  if (songId) form.append('songId', songId)
  const response = await fetch(`${apiRoot()}/api/audio`, { method: 'POST', headers, body: form })
  const text = await response.text()
  let data: { error?: string; audioUrl?: string; key?: string } = {}
  if (text) {
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      data = {}
    }
  }
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`)
  if (!data.audioUrl || !data.key) throw new Error('La subida no devolvió audio_url.')
  return { audioUrl: data.audioUrl, key: data.key }
}

export type SongMediaPatch = {
  durationMs?: number | null
  bpm?: number | null
  audioUrl?: string | null
  selectYoutubeUrl?: string | null
  instrument?: InstrumentId
}

export function patchSongMedia(
  id: string,
  body: SongMediaPatch,
): Promise<{ song: ApiSong; parts: Record<string, PartText> }> {
  return request(`/api/songs/${encodeURIComponent(id)}/media`, { method: 'PUT', body })
}

export type YoutubeInfo = {
  videoId: string
  url: string
  title: string
  durationMs: number | null
  bpm: number | null
  via: string
  apiKeyPresent: boolean
  canExtract: boolean
}

export function fetchYoutubeInfo(url: string): Promise<YoutubeInfo> {
  const query = new URLSearchParams({ url })
  return request(`/api/youtube/info?${query}`)
}

export function extractYoutubeAudio(
  youtubeUrl: string,
  songId?: string,
): Promise<{ audioUrl: string; key: string; blocked?: boolean; error?: string }> {
  return request('/api/audio/extract', { method: 'POST', body: { youtubeUrl, songId } })
}

export function createPerson(body: {
  name: string
  username: string
  role: Role
  password: string
}): Promise<AdminOverview> {
  return request('/api/admin/users', { method: 'POST', body })
}

export function updatePerson(
  id: string,
  body: { role?: Role; username?: string; password?: string },
): Promise<AdminOverview> {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body })
}

export function removePerson(id: string): Promise<AdminOverview> {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listUsers(): Promise<Account[]> {
  const data = await request<{ users: Account[] }>('/api/users')
  return data.users
}

export type ChartSearch = {
  found: boolean
  title?: string
  url?: string
}

export function searchCharts(query: string): Promise<ChartSearch> {
  return request(`/api/search-charts?q=${encodeURIComponent(query)}`)
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

export function saveDraft(
  id: string,
  sourceText: string,
  instrument: InstrumentId,
): Promise<{ song: ApiSong; parts: Record<string, PartText> }> {
  return request(`/api/songs/${encodeURIComponent(id)}/draft`, {
    method: 'PUT',
    body: { sourceText, instrument },
  })
}

export function discardDraft(
  id: string,
  instrument: InstrumentId,
): Promise<{ song: ApiSong; parts: Record<string, PartText> }> {
  return request(`/api/songs/${encodeURIComponent(id)}/draft?instrument=${encodeURIComponent(instrument)}`, {
    method: 'DELETE',
  })
}

export function getSongVersions(id: string): Promise<SongVersions> {
  return request(`/api/songs/${encodeURIComponent(id)}/drafts`)
}

export function removeSongVersion(id: string, userId: string): Promise<SongVersions> {
  return request(`/api/songs/${encodeURIComponent(id)}/drafts/${encodeURIComponent(userId)}`, { method: 'DELETE' })
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

export function putPlayback(id: string, playback: SongPlayback): Promise<{ playback: SongPlayback }> {
  return request(`/api/songs/${encodeURIComponent(id)}/playback`, { method: 'PUT', body: { playback } })
}

export function revealSongs(): Promise<{ ok: boolean }> {
  return request('/api/songs/reveal', { method: 'POST', body: {} })
}

export function getSetlists(): Promise<{
  days: number[]
  setlists: SetlistPayload[]
  history?: DayListHistoryPayload[]
}> {
  return request('/api/setlists')
}

export function putSetlists(
  days: number[],
  setlists: SetlistPayload[],
  history: DayListHistoryPayload[],
): Promise<{ days: number[]; setlists: SetlistPayload[]; history?: DayListHistoryPayload[] }> {
  return request('/api/setlists', { method: 'PUT', body: { days, setlists, history } })
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
