import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { useUser } from '@/hooks/useUser'
import { isStaff } from '@/lib/access'
import { getSongVersions, removeSongVersion, type SongVersions, type UserSongVersion } from '@/lib/api'
import { instrumentLabel } from '@/lib/instruments'
import { lineDiff, songFieldChanges, type FieldChange } from '@/lib/songVersionDiff'
import { cn } from '@/lib/utils'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

type Compare = 'base' | 'canonical'

export function SongVersionsView() {
  const { songId = '' } = useParams()
  const user = useUser()
  const [data, setData] = useState<SongVersions | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [compare, setCompare] = useState<Compare>('base')

  useEffect(() => {
    if (!isStaff(user)) return
    let cancel = false
    setLoading(true)
    void getSongVersions(songId)
      .then((next) => {
        if (!cancel) setData(next)
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'No pude abrir las versiones.')
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [songId, user])

  const people = useMemo(() => {
    const groups: { userId: string; userName: string; drafts: UserSongVersion[] }[] = []
    for (const draft of data?.drafts ?? []) {
      let group = groups.find((item) => item.userId === draft.userId)
      if (!group) {
        group = { userId: draft.userId, userName: draft.userName, drafts: [] }
        groups.push(group)
      }
      group.drafts.push(draft)
    }
    return groups
  }, [data])

  if (!isStaff(user)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-6 font-medium">Solo un Admin o un Ayudante ve las versiones de cada persona.</p>
        <Button asChild>
          <Link to={`/c/${encodeURIComponent(songId)}`}>Volver a la canción</Link>
        </Button>
      </div>
    )
  }

  const discard = async (userId: string, name: string) => {
    if (!window.confirm(`¿Descartar la versión de ${name}? Esa persona vuelve a ver la canción compartida.`)) return
    setError('')
    try {
      setData(await removeSongVersion(songId, userId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude descartar la versión.')
    }
  }

  return (
    <div className="min-h-svh pb-12">
      <header className="border-b bg-card/80">
        <div className={`${page} flex items-center gap-3 py-4`}>
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to={`/c/${encodeURIComponent(songId)}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">Versiones de usuarios</h1>
            {data && <p className="truncate text-sm text-muted-foreground">{data.song.title}</p>}
          </div>
          <UserBadge />
        </div>
      </header>
      <main className={`${page} flex flex-col gap-4 py-4`}>
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" role="status">
            <Loader2 className="size-8 animate-spin" />
            <p>Cargando versiones…</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              Quien no puede cambiar la canción compartida guarda su propia versión. Solo esa persona la ve. Aquí ves
              cada campo que cambió. Creada por {data.song.creatorName || data.song.creatorId}.
            </p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Comparar con">
              <span className="text-sm text-muted-foreground">Comparar con</span>
              <Button
                size="sm"
                variant={compare === 'base' ? 'default' : 'outline'}
                aria-pressed={compare === 'base'}
                title="Lo que esa persona vio cuando empezó su versión."
                onClick={() => setCompare('base')}
              >
                Lo que vio
              </Button>
              <Button
                size="sm"
                variant={compare === 'canonical' ? 'default' : 'outline'}
                aria-pressed={compare === 'canonical'}
                title="La canción compartida como está ahora."
                onClick={() => setCompare('canonical')}
              >
                La canción actual
              </Button>
            </div>
            {!people.length && <p className="text-sm">Nadie guardó una versión propia de esta canción.</p>}
            {people.map((person) => (
              <article key={person.userId} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">{person.userName}</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void discard(person.userId, person.userName)}
                  >
                    Descartar su versión
                  </Button>
                </div>
                {person.drafts.map((draft) => (
                  <InstrumentVersion
                    key={draft.instrument}
                    songId={songId}
                    draft={draft}
                    changes={songFieldChanges(
                      compare === 'base' ? draft.baseText : draft.canonicalText,
                      draft.sourceText,
                      songId,
                    )}
                  />
                ))}
              </article>
            ))}
          </>
        )}
      </main>
    </div>
  )
}

function InstrumentVersion({
  songId,
  draft,
  changes,
}: {
  songId: string
  draft: UserSongVersion
  changes: FieldChange[]
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{instrumentLabel(draft.instrument)}</h3>
          <p className="text-xs text-muted-foreground">
            Guardada {new Date(draft.updatedAt).toLocaleString('es')}
            {draft.stale ? ' · la canción compartida cambió después' : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild title="Abre esta versión en el editor. Al guardar cambia la canción compartida.">
          <Link
            to={`/editar/${encodeURIComponent(songId)}?inst=${draft.instrument}&version=${encodeURIComponent(draft.userId)}`}
          >
            Abrir en el editor
          </Link>
        </Button>
      </div>
      {!changes.length && <p className="text-sm text-muted-foreground">Igual que la canción con la que se compara.</p>}
      <dl className="flex flex-col gap-2">
        {changes.map((change) => (
          <div key={change.field} className="flex flex-col gap-1">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{change.field}</dt>
            <dd>{change.multiline ? <LinesChange change={change} /> : <InlineChange change={change} />}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function InlineChange({ change }: { change: FieldChange }) {
  return (
    <p className="text-sm">
      <span className="rounded bg-red-500/10 px-1 text-red-700 line-through dark:text-red-300">
        {change.before || 'vacío'}
      </span>
      {' → '}
      <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">
        {change.after || 'vacío'}
      </span>
    </p>
  )
}

function LinesChange({ change }: { change: FieldChange }) {
  const rows = lineDiff(change.before, change.after)
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn(
            row.kind === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            row.kind === 'del' && 'bg-red-500/10 text-red-700 line-through dark:text-red-300',
          )}
        >
          {row.kind === 'add' ? '+ ' : row.kind === 'del' ? '− ' : '  '}
          {row.text || ' '}
        </div>
      ))}
    </pre>
  )
}
