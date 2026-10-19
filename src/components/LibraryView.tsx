import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ListMusic, Loader2, Music, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useSongs } from '@/hooks/useSongs'
import { useUser } from '@/hooks/useUser'
import { can } from '@/lib/access'
import type { Song } from '@/lib/types'

export function LibraryView() {
  const navigate = useNavigate()
  const user = useUser()
  const { state, reload, revealHidden } = useSongs()
  const [query, setQuery] = useState('')
  const [artist, setArtist] = useState('')
  const [keyName, setKeyName] = useState('')

  const songs = state.status === 'ready' ? state.songs : []
  const artists = useMemo(
    () => [...new Set(songs.map((song) => song.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [songs],
  )
  const keys = useMemo(
    () => [...new Set(songs.map((song) => song.key).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [songs],
  )

  const visible = songs.filter((song) => {
    if (artist && song.artist !== artist) return false
    if (keyName && song.key !== keyName) return false
    const needle = query.trim().toLocaleLowerCase('es')
    if (!needle) return true
    const haystack = `${song.title} ${song.artist} ${song.lyricsText}`.toLocaleLowerCase('es')
    return haystack.includes(needle)
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
      if (!visible.length) return
      event.preventDefault()
      const song = event.key === 'ArrowRight' ? visible[0] : visible[visible.length - 1]
      if (!song) return
      navigate(`/c/${encodeURIComponent(song.id)}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, visible])

  return (
    <div className="min-h-svh pb-10">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[52.8rem] items-center gap-3 px-4 py-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Music className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Songbook</h1>
            <p className="text-sm text-muted-foreground">
              {state.status === 'ready' ? `${songs.length} canciones` : 'Acordes para cantar'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <UserBadge />
            <Button asChild variant="outline">
              <Link to="/listas">
                <ListMusic className="size-4" />
                Listas
              </Link>
            </Button>
            <Button asChild>
              <Link to="/nueva">
                <Plus className="size-4" />
                Agregar
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[52.8rem] px-4 py-4">
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
            <Loader2 className="size-8 animate-spin" />
            <p>Cargando canciones…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="mb-2 font-medium text-destructive">No se pudieron cargar las canciones</p>
            <p className="mb-6 text-sm text-muted-foreground">{state.message}</p>
            <Button onClick={() => void reload()}>
              <RefreshCw className="size-4" />
              Reintentar
            </Button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar título, artista o letra"
                className="pl-9"
                aria-label="Buscar canciones"
              />
            </div>
            {state.needsSeed && (
              <p className="mb-3 text-sm text-muted-foreground">
                La base no tiene canciones. En local se cargan solas. Con D1, sigue la carga única del README.
              </p>
            )}
            {state.hiddenCount > 0 && can(user, 'update') && (
              <div className="mb-3">
                <Button variant="outline" size="sm" onClick={() => void revealHidden()}>
                  Mostrar ocultas ({state.hiddenCount})
                </Button>
              </div>
            )}
            <div className="mb-4 flex gap-2">
              <select
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                aria-label="Filtrar por artista"
              >
                <option value="">Todos los artistas</option>
                {artists.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                className="h-10 rounded-md border bg-background px-2 text-sm"
                aria-label="Filtrar por tono"
              >
                <option value="">Tono</option>
                {keys.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {visible.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">Ninguna canción coincide.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {visible.map((song) => (
                  <li key={song.id}>
                    <Link
                      to={`/c/${encodeURIComponent(song.id)}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/60"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{song.title}</span>
                          {song.origin === 'catalog' && song.hasCopy ? (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                              Tienes copia
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-sm text-muted-foreground">{songNote(song, user.id)}</span>
                      </span>
                      {song.key && (
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold text-primary">
                          {song.key}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function songNote(song: Song, userId: string): string {
  const artist = song.artist || 'Sin artista'
  if (song.origin === 'catalog' || !song.origin) return artist
  if (song.ownerId === userId) {
    const kind = song.origin === 'copy' ? 'Tu copia' : 'Tuya'
    return song.shared ? `${artist} · ${kind} · Compartida` : `${artist} · ${kind}`
  }
  if (song.shared) return `${artist} · Compartida · ${song.ownerName || 'otra persona'}`
  return `${artist} · Copia de ${song.ownerName || 'otra persona'}`
}
