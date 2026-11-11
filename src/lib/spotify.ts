/** Spotify Web API helpers (Authorization Code + PKCE in the browser). */

const TOKEN_KEY = 'songbook-spotify-token-v1'
const PENDING_KEY = 'songbook-spotify-pending-v1'
const AUTH_KEY = 'songbook-spotify-auth-v1'
const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private',
  'user-read-email',
].join(' ')

export type SpotifyTrackRef = { title: string; artist: string }

export type SpotifyPendingPlaylist = {
  setlistId: string
  name: string
  tracks: SpotifyTrackRef[]
}

export type SpotifyPlaylistResult = {
  id: string
  url: string
  name: string
  matched: number
  missing: SpotifyTrackRef[]
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
const DEFAULT_SPOTIFY_CLIENT_ID = 'bfe45189360e48a2987fdae586883cd3'

export function spotifyClientId(): string {
  return (import.meta.env?.VITE_SPOTIFY_CLIENT_ID ?? '').trim() || DEFAULT_SPOTIFY_CLIENT_ID
}

export function spotifyConfigured(): boolean {
  return Boolean(spotifyClientId())
}

/** Redirect URI registered in the Spotify app (exact match). */
export function spotifyRedirectUri(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = `${base.replace(/\/?$/, '/')}spotify/callback`
  return new URL(path, window.location.origin).toString()
}

export function savePendingPlaylist(pending: SpotifyPendingPlaylist) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function readPendingPlaylist(): SpotifyPendingPlaylist | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SpotifyPendingPlaylist
    if (!parsed?.setlistId || !Array.isArray(parsed.tracks)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPendingPlaylist() {
  sessionStorage.removeItem(PENDING_KEY)
}

export function clearSpotifySession() {
  writeToken(null)
  sessionStorage.removeItem(AUTH_KEY)
}

export async function beginSpotifyLogin(returnPath: string): Promise<void> {
  const clientId = spotifyClientId()
  if (!clientId) throw new Error('Falta VITE_SPOTIFY_CLIENT_ID.')
  const verifier = randomString(64)
  const challenge = await codeChallenge(verifier)
  const state = randomString(24)
  const auth: AuthPending = { verifier, state, returnPath }
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth))
  const url = new URL('https://accounts.spotify.com/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', spotifyRedirectUri())
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  // Force account picker so Development Mode uses the allowlisted Spotify user.
  url.searchParams.set('show_dialog', 'true')
  window.location.assign(url.toString())
}

/** Finish PKCE after Spotify redirects to /spotify/callback. Returns where to go next. */
export async function completeSpotifyLogin(params: URLSearchParams): Promise<string> {
  const error = params.get('error')
  if (error) throw new Error(error === 'access_denied' ? 'No diste permiso a Spotify.' : `Spotify: ${error}`)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) throw new Error('Falta el código de Spotify.')
  const raw = sessionStorage.getItem(AUTH_KEY)
  if (!raw) throw new Error('Se perdió el inicio de sesión con Spotify. Inténtalo otra vez.')
  const auth = JSON.parse(raw) as AuthPending
  sessionStorage.removeItem(AUTH_KEY)
  if (auth.state !== state) throw new Error('El estado de Spotify no coincide.')
  const clientId = spotifyClientId()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: spotifyRedirectUri(),
    client_id: clientId,
    code_verifier: auth.verifier,
  })
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error('No pude canjear el código de Spotify.')
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

export function spotifyLoggedIn(): boolean {
  return Boolean(readToken()?.accessToken)
}

export async function ensureSpotifyAccess(): Promise<string> {
  const token = readToken()
  if (token && token.expiresAt > Date.now() + 15_000) return token.accessToken
  if (token?.refreshToken) {
    const next = await refreshAccess(token.refreshToken)
    writeToken(next)
    return next.accessToken
  }
  throw new Error('SPOTIFY_LOGIN')
}

export function spotifySearchQuery(track: SpotifyTrackRef): string {
  const title = track.title.trim()
  const artist = track.artist.trim()
  if (title && artist) return `track:${quote(title)} artist:${quote(artist)}`
  return title || artist
}

export async function createSetlistPlaylist(
  pending: SpotifyPendingPlaylist,
): Promise<SpotifyPlaylistResult> {
  const access = await ensureSpotifyAccess()
  const me = await spotifyJson<{ id: string; display_name?: string; email?: string }>(
    'https://api.spotify.com/v1/me',
    access,
  )
  if (!me.id) throw new Error('Spotify no devolvió el usuario conectado.')
  const matched: string[] = []
  const missing: SpotifyTrackRef[] = []
  for (const track of pending.tracks) {
    const uri = await searchTrackUri(access, track)
    if (uri) matched.push(uri)
    else missing.push(track)
  }
  const playlist = await spotifyJson<{ id: string; external_urls?: { spotify?: string } }>(
    `https://api.spotify.com/v1/users/${encodeURIComponent(me.id)}/playlists`,
    access,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: pending.name,
        description: 'Lista creada desde Songbook',
        public: false,
      }),
    },
  )
  for (let i = 0; i < matched.length; i += 100) {
    const chunk = matched.slice(i, i + 100)
    await spotifyJson(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlist.id)}/tracks`,
      access,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uris: chunk }),
      },
    )
  }
  return {
    id: playlist.id,
    url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
    name: pending.name,
    matched: matched.length,
    missing,
  }
}

async function searchTrackUri(access: string, track: SpotifyTrackRef): Promise<string | null> {
  const q = spotifySearchQuery(track)
  if (!q.trim()) return null
  const url = new URL('https://api.spotify.com/v1/search')
  url.searchParams.set('q', q)
  url.searchParams.set('type', 'track')
  url.searchParams.set('limit', '5')
  const data = await spotifyJson<{
    tracks?: { items?: { uri?: string; name?: string; artists?: { name?: string }[] }[] }
  }>(url.toString(), access)
  const items = data.tracks?.items ?? []
  const pick = pickBestTrack(track, items)
  return pick?.uri ?? null
}

export function pickBestTrack(
  wanted: SpotifyTrackRef,
  items: { uri?: string; name?: string; artists?: { name?: string }[] }[],
): { uri: string; name: string } | null {
  if (!items.length) return null
  const title = fold(wanted.title)
  const artist = fold(wanted.artist)
  const scored = items
    .map((item) => {
      const uri = item.uri ?? ''
      const name = item.name ?? ''
      const artists = (item.artists ?? []).map((person) => person.name ?? '').filter(Boolean)
      if (!uri) return null
      let score = 0
      if (fold(name) === title) score += 5
      else if (fold(name).includes(title) || title.includes(fold(name))) score += 2
      if (artist && artists.some((name) => fold(name) === artist || fold(name).includes(artist))) score += 4
      else if (artist && artists.some((name) => fold(name).includes(artist) || artist.includes(fold(name)))) {
        score += 2
      }
      return { uri, name, score }
    })
    .filter((item): item is { uri: string; name: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 2) {
    const fallback = items[0]
    return fallback?.uri ? { uri: fallback.uri, name: fallback.name ?? wanted.title } : null
  }
  return { uri: best.uri, name: best.name }
}

async function refreshAccess(refreshToken: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: spotifyClientId(),
  })
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    writeToken(null)
    throw new Error('SPOTIFY_LOGIN')
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

async function spotifyJson<T>(url: string, access: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${access}`)
  const response = await fetch(url, { ...init, headers })
  if (response.status === 401) {
    writeToken(null)
    throw new Error('SPOTIFY_LOGIN')
  }
  if (response.status === 403) {
    // Stale token or account not on the Development Mode allowlist.
    clearSpotifySession()
    throw new Error('SPOTIFY_FORBIDDEN')
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(spotifyErrorMessage(response.status, text))
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

function spotifyErrorMessage(status: number, text: string): string {
  let detail = ''
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; status?: number } | string }
    if (typeof parsed.error === 'string') detail = parsed.error
    else if (parsed.error?.message) detail = parsed.error.message
  } catch {
    detail = text.trim()
  }
  return detail || `Spotify respondió ${status}`
}

function quote(value: string): string {
  const cleaned = value.replace(/"/g, '')
  return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')
}

async function codeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
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
