import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, History, ListMusic, Plus, Settings, Trash2 } from 'lucide-react'
import { Kbd } from '@/components/KeyHint'
import { SongMark } from '@/components/SongMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useDayListHistory, useSetlists } from '@/hooks/useSetlists'
import { useSongs } from '@/hooks/useSongs'
import { useUser } from '@/hooks/useUser'
import { can } from '@/lib/access'
import { ListMark, useListMarks, WeekdayMark } from '@/components/ListMark'
import { createSetlist, evergreenStatus, removeSetlist, songPath, type DayListHistory } from '@/lib/setlists'
import type { Song } from '@/lib/types'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

export function SetlistsView() {
  const navigate = useNavigate()
  const user = useUser()
  const setlists = useSetlists()
  const history = useDayListHistory()
  const { state: songState } = useSongs()
  const [name, setName] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const marks = useListMarks(setlists.filter((list) => !list.evergreen).map((list) => list.id))
  const songs = songState.status === 'ready' ? songState.songs : []

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

  const create = () => {
    const title = name.trim()
    if (!title) return
    const id = createSetlist(title)
    setName('')
    navigate(`/listas/${encodeURIComponent(id)}`)
  }

  return (
    <div className="min-h-svh pb-12">
      <header className="border-b bg-card/80">
        <div className={`${page} flex items-center gap-3 py-4`}>
          <span className="inline-flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild aria-label="Volver" aria-keyshortcuts="Escape">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <Kbd>Esc</Kbd>
          </span>
          <ListMusic className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Listas</h1>
          <div className="ml-auto flex items-center gap-2">
            <UserBadge />
            {can(user, 'update') && (
              <Button asChild variant="outline">
                <Link to="/listas/dias">
                  <Settings className="size-4" />
                  Días de servicio
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className={`${page} flex flex-col gap-4 py-4`}>
        {can(user, 'create') && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre de la lista"
              aria-label="Nombre de la lista"
            />
            <Button type="submit" disabled={!name.trim()}>
              <Plus /> Crear
            </Button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">⌘← y ⌘→ cambian de canción dentro de una lista.</p>
        <Button
          type="button"
          className="self-start"
          variant={historyOpen ? 'secondary' : 'outline'}
          aria-pressed={historyOpen}
          aria-expanded={historyOpen}
          aria-controls="historial-listas"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <History />
          Historial
        </Button>
        <DayListHistoryPanel
          open={historyOpen}
          history={history}
          songs={songs}
          songsStatus={songState.status}
        />
        <SetlistGroup lists={setlists.filter((list) => list.evergreen)} marks={marks} />
        <SetlistGroup
          lists={setlists.filter((list) => !list.evergreen)}
          marks={marks}
          empty="Todavía no hay otras listas."
          allowDelete={can(user, 'delete')}
        />
      </main>
    </div>
  )
}

function DayListHistoryPanel({
  open,
  history,
  songs,
  songsStatus,
}: {
  open: boolean
  history: DayListHistory[]
  songs: Song[]
  songsStatus: 'loading' | 'error' | 'ready'
}) {
  const entries = [...history].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.weekday - b.weekday)
  if (!open) return null
  return (
    <section id="historial-listas" aria-label="Historial de listas de servicio" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Se guarda al agregar una canción después del servicio, con la fecha y el orden de ese día.
      </p>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay listas de servicio cerradas.</p>
      ) : (
        entries.map((entry) => (
          <article key={entry.id} className="overflow-hidden rounded-xl border bg-card">
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <WeekdayMark weekday={entry.weekday} />
              <span className="min-w-0">
                <span className="block font-medium">{historyTitle(entry.serviceDate)}</span>
                <span className="block text-sm text-muted-foreground">
                  {entry.items.length} {entry.items.length === 1 ? 'canción' : 'canciones'}
                </span>
              </span>
            </header>
            <ol className="divide-y">
              {entry.items.map((item, index) => {
                const song = songs.find((candidate) => candidate.id === item.songId)
                return (
                  <li key={`${entry.id}-${index}`} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-6 text-sm text-muted-foreground">{index + 1}</span>
                    {song ? (
                      <Link to={songPath(song.id)} className="flex min-w-0 flex-1 items-center gap-2">
                        <SongMark songId={song.id} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{song.title}</span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {song.artist || 'Sin artista'}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {songsStatus === 'ready' ? 'Canción quitada' : songsStatus === 'error' ? item.songId : 'Cargando…'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </article>
        ))
      )}
    </section>
  )
}

function historyTitle(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  const label = date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1)
}

function SetlistGroup({
  lists,
  marks,
  empty,
  allowDelete = false,
}: {
  lists: ReturnType<typeof useSetlists>
  marks: ReturnType<typeof useListMarks>
  empty?: string
  allowDelete?: boolean
}) {
  if (!lists.length) {
    return empty ? <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p> : null
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {lists.map((list) => (
        <li key={list.id} className="flex items-center gap-2">
          <Link
            to={`/listas/${encodeURIComponent(list.id)}`}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-accent/60"
          >
            {list.evergreen ? <WeekdayMark weekday={list.evergreen.weekday} /> : <ListMark look={marks.get(list.id)} />}
            <span className="min-w-0">
              <span className="block font-medium">{list.name}</span>
              <span className="block text-sm text-muted-foreground">
                {list.evergreen
                  ? `${evergreenStatus(list)} · ${list.items.length} ${list.items.length === 1 ? 'canción' : 'canciones'}`
                  : `${list.items.length} ${list.items.length === 1 ? 'canción' : 'canciones'}`}
              </span>
            </span>
          </Link>
          {!list.evergreen && allowDelete && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Eliminar ${list.name}`}
              onClick={() => {
                if (window.confirm(`¿Eliminar la lista «${list.name}»?`)) removeSetlist(list.id)
              }}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}
