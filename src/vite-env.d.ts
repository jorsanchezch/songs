/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_COMMIT: string
  readonly VITE_SONGBOOK_API?: string
  /** Spotify app client id (PKCE). Public; empty disables playlist export. */
  readonly VITE_SPOTIFY_CLIENT_ID?: string
}
