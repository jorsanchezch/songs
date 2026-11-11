/** YouTube Data API helpers (Google OAuth Authorization Code + PKCE). */

import { findYoutubeSource } from '@/lib/songMedia'
import { youtubeVideoId } from '@/lib/playback'
import type { Song } from '@/lib/types'

const TOKEN_KEY = 'songbook-youtube-token-v1'
const PENDING_KEY = 'songbook-youtube-pending-v1'
const AUTH_KEY = 'songbook-youtube-auth-v1'
const SCOPES = 'https://www.googleapis.com/auth/youtube'

export type YoutubeTrackRef = { title: string; artist: string; videoId?: string }

export type YoutubePendingPlaylist = {
  setlistId: string
  name: string
  tracks: YoutubeTrackRef[]
}

export type YoutubePlaylistResult = {
  id: string
  url: string
  name: string
  matched: number
  missing: YoutubeTrackRef[]
}

type TokenBundle = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

type AuthPending = {
  verifier: string
  state: string
  returnPath: string
}

/** Public PKCE client id (not a secret). Env overrides when set at build time. */
const DEFAULT_YOUTUBE_CLIENT_ID =
  '1005651847868-k4oas55ikbu34alfcggqts39tel93j0r.apps.googleusercontent.com'

export function youtubeClientId(): string {
  return (import.meta.env?.VITE_YOUTUBE_CLIENT_ID ?? '').trim() || DEFAULT_YOUTUBE_CLIENT_ID
}

export function youtubeConfigured(): boolean {
  return Boolean(youtubeClientId())
}

export function youtubeRedirectUri(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = `${base.replace(/\/?$/, '/')}youtube/callback`
  return new URL(path, window.location.origin).toString()
}

/** Preferred YouTube video for a song, when the chart already has one. */
export function songYoutubeTrack(song: Pick<Song, 'title' | 'artist' | 'sources'>): YoutubeTrackRef {
  const source = findYoutubeSource(song.sources ?? [])
  const videoId = source ? youtubeVideoId(source.url) ?? undefined : undefined
  return { title: song.title, artist: song.artist, videoId }
}

export function savePendingYoutubePlaylist(pending: YoutubePendingPlaylist) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function readPendingYoutubePlaylist(): YoutubePendingPlaylist | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as YoutubePendingPlaylist
    if (!parsed?.setlistId || !Array.isArray(parsed.tracks)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPendingYoutubePlaylist() {
  sessionStorage.removeItem(PENDING_KEY)
}

export async function beginYoutubeLogin(returnPath: string): Promise<void> {
  const clientId = youtubeClientId()
  if (!clientId) throw new Error('Falta VITE_YOUTUBE_CLIENT_ID.')
  const verifier = randomString(64)
  const challenge = await codeChallenge(verifier)
  const state = randomString(24)
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ verifier, state, returnPath } satisfies AuthPending))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', youtubeRedirectUri())
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  window.location.assign(url.toString())
}

export async function completeYoutubeLogin(params: URLSearchParams): Promise<string> {
  const error = params.get('error')
  if (error) {
    throw new Error(error === 'access_denied' ? 'No diste permiso a YouTube.' : `YouTube: ${error}`)
  }
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) throw new Error('Falta el código de YouTube.')
  const raw = sessionStorage.getItem(AUTH_KEY)
  if (!raw) throw new Error('Se perdió el inicio de sesión con YouTube. Inténtalo otra vez.')
  const auth = JSON.parse(raw) as AuthPending
  sessionStorage.removeItem(AUTH_KEY)
  if (auth.state !== state) throw new Error('El estado de YouTube no coincide.')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: youtubeRedirectUri(),
    client_id: youtubeClientId(),
    code_verifier: auth.verifier,
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error('No pude canjear el código de YouTube.')
  const json = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  writeToken({
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresAt: Date.now() + Math.max(30, json.expires_in - 60) * 1000,
  })
  return auth.returnPath || '/'
}

export async function ensureYoutubeAccess(): Promise<string> {
  const token = readToken()
  if (token && token.expiresAt > Date.now() + 15_000) return token.accessToken
  if (token?.refreshToken) {
    const next = await refreshAccess(token.refreshToken)
    writeToken(next)
    return next.accessToken
  }
  throw new Error('YOUTUBE_LOGIN')
}

export function youtubeSearchQuery(track: YoutubeTrackRef): string {
  return [track.title, track.artist].map((part) => part.trim()).filter(Boolean).join(' ')
}

export function isYoutubeVideoId(value: string | undefined): value is string {
  return Boolean(value && /^[\w-]{11}$/.test(value))
}

export async function createSetlistYoutubePlaylist(
  pending: YoutubePendingPlaylist,
): Promise<YoutubePlaylistResult> {
  const access = await ensureYoutubeAccess()
  const matched: string[] = []
  const missing: YoutubeTrackRef[] = []
  for (const track of pending.tracks) {
    const known = track.videoId?.trim()
    if (isYoutubeVideoId(known)) {
      matched.push(known)
      continue
    }
    const found = await searchVideoId(access, track)
    if (found) matched.push(found)
    else missing.push(track)
  }
  const playlist = await youtubeJson<{ id?: string }>(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    access,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          title: pending.name.slice(0, 150),
          description: 'Lista creada desde Songbook',
        },
        status: { privacyStatus: 'private' },
      }),
    },
  )
  const playlistId = playlist.id
  if (!playlistId) throw new Error('YouTube no devolvió la playlist.')
  for (const videoId of matched) {
    await youtubeJson(
      'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
      access,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: { kind: 'youtube#video', videoId },
          },
        }),
      },
    )
  }
  return {
    id: playlistId,
    url: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    name: pending.name,
    matched: matched.length,
    missing,
  }
}

async function searchVideoId(access: string, track: YoutubeTrackRef): Promise<string | null> {
  const q = youtubeSearchQuery(track)
  if (!q.trim()) return null
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '5')
  url.searchParams.set('q', q)
  const data = await youtubeJson<{
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[]
  }>(url.toString(), access)
  return pickBestVideo(track, data.items ?? [])?.videoId ?? null
}

export function pickBestVideo(
  wanted: YoutubeTrackRef,
  items: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[],
): { videoId: string; title: string } | null {
  if (!items.length) return null
  const title = fold(wanted.title)
  const artist = fold(wanted.artist)
  const scored = items
    .map((item) => {
      const videoId = item.id?.videoId ?? ''
      const name = item.snippet?.title ?? ''
      const channel = item.snippet?.channelTitle ?? ''
      if (!isYoutubeVideoId(videoId)) return null
      let score = 0
      const foldedName = fold(name)
      if (foldedName === title) score += 5
      else if (foldedName.includes(title) || title.includes(foldedName)) score += 2
      if (artist && (fold(channel) === artist || fold(channel).includes(artist) || foldedName.includes(artist))) {
        score += 3
      }
      return { videoId, title: name, score }
    })
    .filter((item): item is { videoId: string; title: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best) return null
  if (best.score < 2) {
    const fallback = items[0]
    const videoId = fallback?.id?.videoId
    return isYoutubeVideoId(videoId) ? { videoId, title: fallback?.snippet?.title ?? wanted.title } : null
  }
  return { videoId: best.videoId, title: best.title }
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
}

async function refreshAccess(refreshToken: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: youtubeClientId(),
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    writeToken(null)
    throw new Error('YOUTUBE_LOGIN')
  }
  const json = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: Date.now() + Math.max(30, json.expires_in - 60) * 1000,
  }
}

async function youtubeJson<T>(url: string, access: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${access}`)
  const response = await fetch(url, { ...init, headers })
  if (response.status === 401) {
    writeToken(null)
    throw new Error('YOUTUBE_LOGIN')
  }
  if (!response.ok) {
    let detail = `YouTube respondió ${response.status}`
    try {
      const err = (await response.json()) as { error?: { message?: string } }
      if (err.error?.message) detail = err.error.message
    } catch {
      // keep status text
    }
    throw new Error(detail)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function readToken(): TokenBundle | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TokenBundle
    if (!parsed?.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeToken(token: TokenBundle | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(digest)
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
