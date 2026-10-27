import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ListMusic, Plus, Settings, Trash2 } from 'lucide-react'
import { Kbd } from '@/components/KeyHint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useSetlists } from '@/hooks/useSetlists'
import { useUser } from '@/hooks/useUser'
import { can } from '@/lib/access'
import { createSetlist, evergreenStatus, removeSetlist } from '@/lib/setlists'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

export function SetlistsView() {
  const navigate = useNavigate()
  const user = useUser()
  const setlists = useSetlists()
  const [name, setName] = useState('')

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
        <SetlistGroup lists={setlists.filter((list) => list.evergreen)} />
        <SetlistGroup
          lists={setlists.filter((list) => !list.evergreen)}
          empty="Todavía no hay otras listas."
          allowDelete={can(user, 'delete')}
        />
      </main>
    </div>
  )
}

function SetlistGroup({
  lists,
  empty,
  allowDelete = false,
}: {
  lists: ReturnType<typeof useSetlists>
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
          <Link to={`/listas/${encodeURIComponent(list.id)}`} className="min-w-0 flex-1 px-4 py-3 hover:bg-accent/60">
            <span className="block font-medium">{list.name}</span>
            <span className="block text-sm text-muted-foreground">
              {list.evergreen
                ? `${evergreenStatus(list)} · ${list.items.length} ${list.items.length === 1 ? 'canción' : 'canciones'}`
                : `${list.items.length} ${list.items.length === 1 ? 'canción' : 'canciones'}`}
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
