import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Kbd, ShortcutLegend } from '@/components/KeyHint'
import { SongMark } from '@/components/SongMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useSetlists } from '@/hooks/useSetlists'
import { useSongs } from '@/hooks/useSongs'
import { useUser } from '@/hooks/useUser'
import { can } from '@/lib/access'
import { transposeKeyName } from '@/lib/chords'
import {
  addSetlistSong,
  evergreenStatus,
  moveSetlistSong,
  neighborSong,
  removeSetlist,
  removeSetlistSong,
  renameSetlist,
  reorderSetlistSong,
  setSetlistSemitones,
  songPath,
} from '@/lib/setlists'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

export function SetlistView() {
  const { setlistId = '' } = useParams()
  const navigate = useNavigate()
  const user = useUser()
  const setlists = useSetlists()
  const { state } = useSongs()
  const list = setlists.find((item) => item.id === setlistId)
  const songs = state.status === 'ready' ? state.songs : []
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragFrom = useRef<number | null>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    if (!needle) return []
    return songs
      .filter((song) => `${song.title} ${song.artist}`.toLocaleLowerCase('es').includes(needle))
      .slice(0, 40)
  }, [query, songs])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!list || !event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (typing(event.target)) return
      const ids = list.items.map((item) => item.songId).filter((id) => songs.some((song) => song.id === id))
      const next = neighborSong(ids, '', event.key === 'ArrowLeft' ? -1 : 1)
      if (!next) return
      event.preventDefault()
      navigate(songPath(next, list.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, navigate, songs])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (typing(event.target)) return
      event.preventDefault()
      navigate('/')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [navigate])

  if (!list) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4">No está esta lista.</p>
        <Button asChild>
          <Link to="/listas">Volver a las listas</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-svh pb-12">
      <header className="border-b bg-card/80">
        <div className={`${page} flex items-center gap-3 py-4`}>
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to="/listas">
              <ArrowLeft />
            </Link>
          </Button>
          {list.evergreen || !can(user, 'update') ? (
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{list.name}</h1>
          ) : (
            <Input
              value={list.name}
              aria-label="Nombre de la lista"
              onChange={(event) => renameSetlist(list.id, event.target.value)}
              className="max-w-md text-lg font-semibold"
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            <UserBadge />
            {!list.evergreen && can(user, 'delete') && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!window.confirm(`¿Eliminar la lista «${list.name}»?`)) return
                  removeSetlist(list.id)
                  navigate('/listas')
                }}
              >
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className={`${page} flex flex-col gap-4 py-4`}>
        <ShortcutLegend
          items={[
            ...(list.items.some((item) => songs.some((song) => song.id === item.songId))
              ? [
                  { id: 'last', keys: <Kbd>⌘←</Kbd>, label: 'Última canción' },
                  { id: 'first', keys: <Kbd>⌘→</Kbd>, label: 'Primera canción' },
                ]
              : []),
            { id: 'esc', keys: <Kbd>Esc</Kbd>, label: 'Ir a las canciones' },
          ]}
        />
        {list.evergreen && <p className="text-sm text-muted-foreground">{evergreenStatus(list)}</p>}
        {can(user, 'create') && (
        <div className="relative">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Agregar una canción"
            aria-label="Buscar canción para la lista"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-[36rem] w-full overflow-auto rounded-lg border bg-card shadow-md">
              {matches.map((song) => {
                const checked = picked.includes(song.id)
                return (
                  <li key={song.id} className="relative grid grid-cols-2">
                    <span className="pointer-events-none absolute inset-y-1 left-1/2 w-px bg-border/70" />
                    <label className="group relative flex h-full min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-3">
                      <span className="pointer-events-none absolute inset-1 rounded-md bg-accent/0 transition-colors group-hover:bg-accent/40" />
                      <input
                        type="checkbox"
                        className="relative size-4 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setPicked((current) =>
                            current.includes(song.id) ? current.filter((id) => id !== song.id) : [...current, song.id],
                          )
                        }
                        aria-label={`Seleccionar ${song.title}`}
                      />
                      <span className="relative min-w-0">
                        <span className="block truncate font-medium">{song.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{song.artist || 'Sin artista'}</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="group relative flex h-full min-h-14 w-full items-center justify-end gap-2 px-3 py-3 text-sm"
                      aria-label={`Agregar ${song.title}`}
                      onClick={() => addSetlistSong(list.id, song.id)}
                    >
                      <span className="pointer-events-none absolute inset-1 rounded-md bg-accent/0 transition-colors group-hover:bg-accent/40" />
                      <Plus className="relative size-4" />
                      <span className="relative">Agregar</span>
                    </button>
                  </li>
                )
              })}
              {picked.length > 0 && (
                <li className="sticky bottom-0 border-t bg-card p-2">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      for (const songId of picked) addSetlistSong(list.id, songId)
                      setPicked([])
                    }}
                  >
                    <Check /> Agregar todas ({picked.length})
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
        )}

        {list.items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Esta lista no tiene canciones.</p>
        ) : (
          <ol className="divide-y overflow-hidden rounded-xl border bg-card">
            {list.items.map((item, index) => {
              const songsReady = state.status === 'ready'
              const song = songsReady ? songs.find((entry) => entry.id === item.songId) : undefined
              const key = song ? transposeKeyName(song.key, item.semitones) : ''
              return (
                <li
                  key={`${item.songId}-${index}`}
                  className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                    dragIndex === index ? 'opacity-50' : ''
                  } ${overIndex === index && dragIndex !== index ? 'bg-accent/50' : ''}`}
                  onDragOver={(event) => {
                    if (!can(user, 'update')) return
                    event.preventDefault()
                    if (overIndex !== index) setOverIndex(index)
                  }}
                  onDrop={(event) => {
                    if (!can(user, 'update')) return
                    event.preventDefault()
                    const from = dragFrom.current
                    dragFrom.current = null
                    setDragIndex(null)
                    setOverIndex(null)
                    if (from == null || from === index) return
                    reorderSetlistSong(list.id, from, index)
                  }}
                >
                  {can(user, 'update') && (
                  <button
                    type="button"
                    draggable
                    aria-label={`Arrastrar ${song?.title ?? 'canción'}`}
                    className="cursor-grab text-muted-foreground active:cursor-grabbing"
                    onDragStart={(event) => {
                      dragFrom.current = index
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', String(index))
                      setDragIndex(index)
                    }}
                    onDragEnd={() => {
                      dragFrom.current = null
                      setDragIndex(null)
                      setOverIndex(null)
                    }}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  )}
                  <span className="w-6 text-sm text-muted-foreground">{index + 1}</span>
                  {!songsReady ? (
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground">Cargando…</span>
                  ) : song ? (
                    <Link to={songPath(song.id, list.id)} className="group flex min-w-[13rem] flex-1 items-center gap-2">
                      <SongMark songId={song.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:underline">{song.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{song.artist || 'Sin artista'}</span>
                      </span>
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground">No está esta canción</span>
                  )}
                  <div className="flex items-center gap-1">
                    {can(user, 'update') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Bajar el tono en la lista"
                        onClick={() => setSetlistSemitones(list.id, index, item.semitones - 1)}
                      >
                        −
                      </Button>
                    )}
                    <span className="w-10 text-center text-sm font-semibold">{key || '—'}</span>
                    {can(user, 'update') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Subir el tono en la lista"
                        onClick={() => setSetlistSemitones(list.id, index, item.semitones + 1)}
                      >
                        +
                      </Button>
                    )}
                  </div>
                  {can(user, 'update') && (
                    <>
                      <Button size="icon" variant="ghost" aria-label="Subir" onClick={() => moveSetlistSong(list.id, index, -1)}>
                        <ChevronUp />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Bajar" onClick={() => moveSetlistSong(list.id, index, 1)}>
                        <ChevronDown />
                      </Button>
                    </>
                  )}
                  {can(user, 'delete') && (
                    <Button size="icon" variant="ghost" aria-label="Quitar de la lista" onClick={() => removeSetlistSong(list.id, index)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </main>
    </div>
  )
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}
