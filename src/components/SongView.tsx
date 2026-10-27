import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react'
import { ChartRow, NoteRow } from '@/components/ChartLines'
import { InstrumentCharts } from '@/components/InstrumentCharts'
import { InstrumentSwitch } from '@/components/InstrumentSwitch'
import { SpellingToggle } from '@/components/SpellingToggle'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { formatChord, transposeKeyName } from '@/lib/chords'
import { blocksFor, chordSequence } from '@/lib/display'
import { instrumentLabel, type InstrumentId } from '@/lib/instruments'
import { putPrefs } from '@/lib/api'
import { loadSettings, saveSettings, type ViewSettings } from '@/lib/settings'
import { NOTE_LABEL, NOTE_TYPES } from '@/lib/types'
import { useSetlists } from '@/hooks/useSetlists'
import { useSession, useUser } from '@/hooks/useUser'
import { useSongs } from '@/hooks/useSongs'
import { can, isStaff } from '@/lib/access'
import { neighborSong, setSetlistSemitones, songPath } from '@/lib/setlists'
import { cn } from '@/lib/utils'

export function SongView() {
  const { songId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useUser()
  const { people } = useSession()
  const { state, reload, removeSong, restoreSong, copySong, shareSong, songById, ensurePart } = useSongs()
  const setlists = useSetlists()
  const listaId = searchParams.get('lista')
  const [settings, setSettings] = useState<ViewSettings>(() => loadSettings())
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [headerOpen, setHeaderOpen] = useState(false)
  const pendingScroll = useRef<string | null>(null)

  const instrument = settings.instrument

  useEffect(() => {
    setSettings(loadSettings())
  }, [user.id])
  const guitar = state.status === 'ready' ? songById(songId, 'guitar') : undefined
  const chart = state.status === 'ready' ? songById(songId, instrument) : undefined
  const song = chart ?? guitar

  useEffect(() => {
    if (!songId || state.status !== 'ready') return
    void ensurePart(songId, instrument).catch((error) => console.error(error))
  }, [ensurePart, instrument, songId, state.status])

  useEffect(() => {
    setOpenNote(null)
    setExpanded([])
    setHeaderOpen(false)
    setVersionId(null)
    setCurrent(null)
  }, [songId])

  const version = chart?.versions.find((item) => item.id === versionId) ?? chart?.versions[0]
  const blocks = useMemo(
    () => (chart ? blocksFor(chart, version?.flow ?? null) : []),
    [chart, version],
  )

  const activeId =
    current && blocks.some((block) => block.id === current)
      ? current
      : (blocks[0]?.id ?? null)

  useEffect(() => {
    if (!version) return
    setSettings((prev) => {
      const next = {
        ...prev,
        visibleNotes: version.openNotes.length ? version.openNotes : [],
      }
      saveSettings(next)
      return next
    })
  }, [version])

  const update = (patch: Partial<ViewSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      if (patch.semitones || patch.chordShapes) {
        void putPrefs({ semitones: next.semitones, chordShapes: next.chordShapes }).catch((error) => console.error(error))
      }
      return next
    })
  }

  const activeList = listaId ? setlists.find((list) => list.id === listaId) : undefined
  const setlistItemIndex = activeList?.items.findIndex((item) => item.songId === songId) ?? -1
  const setlistItem = setlistItemIndex >= 0 ? activeList?.items[setlistItemIndex] : undefined

  const semitones = song
    ? (setlistItem && can(user, 'update') ? setlistItem.semitones : (settings.semitones[song.id] ?? 0))
    : 0
  const setSemitones = (value: number) => {
    if (!song) return
    const wrapped = value > 11 ? value - 12 : value < -11 ? value + 12 : value
    if (listaId && setlistItemIndex >= 0 && can(user, 'update')) {
      setSetlistSemitones(listaId, setlistItemIndex, wrapped)
      return
    }
    update({ semitones: { ...settings.semitones, [song.id]: wrapped } })
  }

  const go = (id: string) => {
    pendingScroll.current = id
    setCurrent(id)
  }

  useEffect(() => {
    const id = pendingScroll.current
    if (!id) return
    pendingScroll.current = null
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeId])

  const stepSection = (direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === activeId)
    const next = blocks[index + direction]
    if (next) go(next.id)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      ) {
        return
      }
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        setHeaderOpen((open) => !open)
        return
      }
      const partNumber = Number(event.key)
      if (event.key.length === 1 && partNumber >= 1 && partNumber <= 9) {
        const block = blocks[partNumber - 1]
        if (!block) return
        event.preventDefault()
        go(block.id)
        return
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      stepSection(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocks, activeId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (typing(event.target)) return
      if (state.status !== 'ready') return
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      const ids = listaId
        ? (setlists.find((list) => list.id === listaId)?.items.map((item) => item.songId) ?? [])
        : state.songs.map((item) => item.id)
      const playable = ids.filter((id) => state.songs.some((item) => item.id === id))
      const next = neighborSong(playable, songId, direction)
      if (!next) return
      event.preventDefault()
      navigate(songPath(next, listaId))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listaId, navigate, setlists, songId, state])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (typing(event.target)) return
      event.preventDefault()
      navigate(listaId ? `/listas/${encodeURIComponent(listaId)}` : '/')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listaId, navigate])

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" />
        <p>Cargando canción…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 font-medium text-destructive">{state.message}</p>
        <Button onClick={() => void reload()}>Reintentar</Button>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 font-medium">No está esta canción.</p>
        <Button asChild>
          <Link to="/">Volver a Songbook</Link>
        </Button>
      </div>
    )
  }

  const soundingKey = transposeKeyName((chart ?? song).key, semitones)
  const partIndex = blocks.findIndex((block) => block.id === activeId)
  const partLabel = blocks[partIndex]?.label ?? ''
  const names = chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
    formatChord(raw, (chart ?? song).key, semitones, settings.spelling),
  )
  const uniqueNames = [...new Set(names)]
  const diagramNames = [
    ...new Set(
      chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
        formatChord(raw, (chart ?? song).key, semitones, 'letters'),
      ),
    ),
  ]

  return (
    <div className="min-h-svh pb-32">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] flex-col gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{song.title}</h1>
            {activeList && (
              <Link
                to={`/listas/${encodeURIComponent(activeList.id)}`}
                className="shrink-0 text-sm text-muted-foreground hover:underline"
              >
                {setlistItemIndex + 1}/{activeList.items.length} {activeList.name}
              </Link>
            )}
            <p className="shrink-0 text-sm font-semibold text-primary">{partLabel}</p>
            <UserBadge />
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={headerOpen}
              onClick={() => setHeaderOpen((open) => !open)}
            >
              {headerOpen ? 'Ocultar' : 'Controles'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InstrumentSwitch value={instrument} onChange={(next: InstrumentId) => update({ instrument: next })} />
            {!song.editable && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void copySong(song.id).then((id) => navigate(`/c/${encodeURIComponent(id)}`))
                }}
              >
                Crear mi copia
              </Button>
            )}
          </div>
          {headerOpen && (
          <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Volver">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {song.artist || 'Sin artista'}
              {song.composer ? ` · ${song.composer}` : ''}
            </p>
            {song.editable && (
              <Button variant="outline" size="icon" asChild aria-label="Editar">
                <Link to={`/editar/${encodeURIComponent(song.id)}?inst=${instrument}`}>
                  <Pencil />
                </Link>
              </Button>
            )}
            {(song.origin === 'catalog' || (song.ownerId && song.ownerId !== user.id)) && (
              <Button
                variant="outline"
                onClick={() => {
                  void copySong(song.id).then((id) => navigate(`/c/${encodeURIComponent(id)}`))
                }}
              >
                Crear mi copia
              </Button>
            )}
            {song.removable && (
              <Button
                variant="outline"
                onClick={() => {
                  const label =
                    song.origin === 'catalog'
                      ? '¿Ocultar esta canción del catálogo?'
                      : '¿Eliminar esta canción?'
                  if (!window.confirm(label)) return
                  void removeSong(song).then(() => navigate(listaId ? `/listas/${encodeURIComponent(listaId)}` : '/'))
                }}
              >
                <Trash2 />
                {song.origin === 'catalog' ? 'Ocultar canción' : 'Eliminar'}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={settings.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              {settings.theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
          {song.overridden && song.origin === 'catalog' && song.editable && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <p>El catálogo en la base difiere del archivo. El archivo no se toca.</p>
              <Button size="sm" onClick={() => void restoreSong(song.id)}>
                Restaurar archivo
              </Button>
            </div>
          )}
          {song.origin !== 'catalog' && (song.ownerId === user.id || isStaff(user)) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button
                size="sm"
                variant={song.shared ? 'default' : 'outline'}
                aria-pressed={song.shared}
                onClick={() => void shareSong(song.id, { shared: !song.shared })}
              >
                Compartida
              </Button>
              {isStaff(user) && (
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  aria-label="Compartir con"
                  value=""
                  onChange={(event) => {
                    const userId = event.target.value
                    if (userId) void shareSong(song.id, { userId, include: true })
                  }}
                >
                  <option value="">Compartir con…</option>
                  {people
                    .filter((person) => person.id !== song.ownerId)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              )}
              {song.shares?.map((userId) => {
                const person = people.find((item) => item.id === userId)
                return (
                  <button
                    key={userId}
                    type="button"
                    className="rounded-full border px-2 py-1 text-xs"
                    onClick={() => void shareSong(song.id, { userId, include: false })}
                  >
                    {person?.name ?? userId} ×
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
              <Button variant="ghost" size="icon" aria-label="Bajar un semitono" onClick={() => setSemitones(semitones - 1)}>
                <Minus />
              </Button>
              <span className="min-w-16 text-center text-sm font-semibold">
                {soundingKey || '—'}
                {semitones !== 0 && (chart ?? song).key ? (
                  <span className="block text-xs font-normal text-muted-foreground">orig. {(chart ?? song).key}</span>
                ) : null}
              </span>
              <Button variant="ghost" size="icon" aria-label="Subir un semitono" onClick={() => setSemitones(semitones + 1)}>
                <Plus />
              </Button>
            </div>

            <SpellingToggle value={settings.spelling} onChange={(spelling) => update({ spelling })} />
            <Button variant="outline" onClick={() => update({ fontSize: Math.max(16, settings.fontSize - 2) })}>
              A−
            </Button>
            <Button variant="outline" onClick={() => update({ fontSize: Math.min(40, settings.fontSize + 2) })}>
              A+
            </Button>
            <Button
              variant={settings.showChords ? 'default' : 'outline'}
              onClick={() => update({ showChords: !settings.showChords })}
            >
              Acordes
            </Button>
            <Button
              variant={settings.showDiagrams ? 'default' : 'outline'}
              aria-pressed={settings.showDiagrams}
              onClick={() => update({ showDiagrams: !settings.showDiagrams })}
            >
              Diagrama
            </Button>
            <Button
              variant={settings.concise ? 'default' : 'outline'}
              onClick={() => update({ concise: !settings.concise })}
            >
              {settings.concise ? 'Conciso' : 'Completo'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {NOTE_TYPES.map((type) => {
              const on = settings.visibleNotes.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    update({
                      visibleNotes: on
                        ? settings.visibleNotes.filter((item) => item !== type)
                        : [...settings.visibleNotes, type],
                    })
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium',
                    on ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {NOTE_LABEL[type]}
                </button>
              )
            })}
          </div>

          {song.versions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {song.versions.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={(version?.id ?? '') === item.id ? 'default' : 'outline'}
                  onClick={() => {
                    setVersionId(item.id)
                    setCurrent(null)
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => go(block.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-sm',
                  block.id === activeId
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card',
                )}
              >
                {block.label}
                {block.repeat > 1 ? ` ×${block.repeat}` : ''}
              </button>
            ))}
          </div>
          </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[70.4rem] px-4 py-4">
        {!chart && <p className="mb-4 text-sm text-muted-foreground">Cargando {instrumentLabel(instrument)}…</p>}
        {chart && settings.showDiagrams && (instrument === 'drums' || diagramNames.length > 0) && (
          <InstrumentCharts
            instrument={instrument}
            names={diagramNames}
            choices={settings.chordShapes[song.id] ?? {}}
            onChoose={(name, shapeId) => {
              const current = { ...(settings.chordShapes[song.id] ?? {}) }
              if (shapeId) current[name] = shapeId
              else delete current[name]
              update({
                chordShapes: { ...settings.chordShapes, [song.id]: current },
              })
            }}
          />
        )}
        {headerOpen && uniqueNames.length > 0 && (
          <p className="mb-4 text-sm leading-6 text-chart-chord">
            <span className="mr-2 font-medium text-muted-foreground">Acordes</span>
            {uniqueNames.join('  ·  ')}
          </p>
        )}

        <div className="space-y-8 font-mono" style={{ fontSize: `${settings.fontSize}px` }}>
          {blocks.map((block) => {
            const active = block.id === activeId
            const folded =
              !settings.concise &&
              Boolean(block.duplicateOf) &&
              !expanded.includes(block.id) &&
              !active
            if (settings.concise && !active) return null
            return (
              <section
                key={block.id}
                id={`sec-${block.id}`}
                className={cn(headerOpen ? 'scroll-mt-64' : 'scroll-mt-14', active && 'border-l-2 border-primary pl-3')}
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h2 className="font-sans text-[0.7em] font-semibold tracking-wide text-primary uppercase">
                    {block.label}
                  </h2>
                  {block.repeat > 1 && (
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-sans text-[0.55em] font-semibold">
                      ×{block.repeat}
                    </span>
                  )}
                </div>
                <NoteRow
                  notes={block.section.notes}
                  visible={settings.visibleNotes}
                  openNote={openNote}
                  prefix={`${block.id}:section`}
                  onToggle={setOpenNote}
                />
                {folded ? (
                  <button
                    type="button"
                    className="font-sans text-[0.7em] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setExpanded((ids) => [...ids, block.id])}
                  >
                    Igual que {block.duplicateOf}. Mostrar.
                  </button>
                ) : (
                  <div className="overflow-x-auto">
                    {block.section.lines.map((line, index) => (
                      <ChartRow
                        key={`${block.id}-${index}`}
                        block={block}
                        lineIndex={index}
                        showChords={settings.showChords || line.lyric == null}
                        spelling={settings.spelling}
                        semitones={semitones}
                        songKey={(chart ?? song).key}
                        visible={settings.visibleNotes}
                        openNote={openNote}
                        onToggle={setOpenNote}
                      />
                    ))}
                    {block.section.sameAs && block.section.lines.length === 0 && (
                      <p className="font-sans text-[0.65em] text-muted-foreground">
                        No se encontró la parte «{block.section.sameAs}».
                      </p>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {(song.sources.length > 0 || song.source) && (
          <section className="mt-8 font-sans text-sm">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Referencias y tutoriales
            </h2>
            <ul className="flex flex-col gap-1.5">
              {(song.sources.length
                ? song.sources
                : [{ url: song.source, label: 'Fuente' }]
              ).map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    {item.label || item.url}
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-8 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] items-center gap-2">
          <Button
            size="lg"
            variant="secondary"
            aria-label="Parte anterior"
            disabled={partIndex <= 0}
            onClick={() => stepSection(-1)}
          >
            <ChevronLeft />
            Anterior
          </Button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{partLabel}</p>
          <Button
            size="lg"
            aria-label="Parte siguiente"
            disabled={partIndex >= blocks.length - 1}
            onClick={() => stepSection(1)}
          >
            Siguiente
            <ChevronRight />
          </Button>
        </div>
      </footer>
    </div>
  )
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}
