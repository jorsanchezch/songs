import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Guitar,
  Info,
  Loader2,
  Minus,
  Moon,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react'
import { ChartRow, NoteRow, placeChords } from '@/components/ChartLines'
import { SongMark } from '@/components/SongMark'
import { InstrumentCharts } from '@/components/InstrumentCharts'
import { InstrumentSwitch } from '@/components/InstrumentSwitch'
import { Kbd, ShortcutLegend } from '@/components/KeyHint'
import { SpellingToggle } from '@/components/SpellingToggle'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { formatChord, transposeKeyName } from '@/lib/chords'
import {
  blocksFor,
  chordSequence,
  displayLyric,
  headerChips,
  headerChipText,
  partKind,
  type DisplayBlock,
  type PartKind,
} from '@/lib/display'
import { instrumentLabel, type InstrumentId } from '@/lib/instruments'
import { putPrefs } from '@/lib/api'
import { loadSettings, saveSettings, type ViewSettings } from '@/lib/settings'
import { NOTE_HINT, NOTE_LABEL, NOTE_TYPES } from '@/lib/types'
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
  const [announce, setAnnounce] = useState('')
  const [headerHeight, setHeaderHeight] = useState(0)
  const [chartWidth, setChartWidth] = useState(0)
  const [chPerPx, setChPerPx] = useState(0.6)
  const headerRef = useRef<HTMLElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const [nearEnd, setNearEnd] = useState(false)
  // Smooth scrolling passes through other parts. The scroll spy waits until it lands.
  const spyPausedUntil = useRef(0)

  const instrument = settings.instrument
  const live = settings.mode === 'live'

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
    setSettings((prev) => {
      if (prev.spelling === 'both' && prev.showChords) return prev
      const next = { ...prev, spelling: 'both' as const, showChords: true }
      saveSettings(next)
      return next
    })
  }, [songId])

  const version = chart?.versions.find((item) => item.id === versionId) ?? chart?.versions[0]
  const blocks = useMemo(
    () => (chart ? blocksFor(chart, version?.flow ?? null) : []),
    [chart, version],
  )
  const nav = useMemo(() => headerChips(blocks, settings.concise), [blocks, settings.concise])

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
    const index = blocks.findIndex((block) => block.id === id)
    const block = blocks[index]
    if (!block) return
    setCurrent(id)
    setAnnounce(`${block.label}${block.repeat > 1 ? ` por ${block.repeat}` : ''}, parte ${index + 1} de ${blocks.length}`)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    spyPausedUntil.current = Date.now() + (smooth ? 900 : 100)
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  // The sticky header changes height with the controls. Parts land just under it.
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight))
    observer.observe(header)
    return () => observer.disconnect()
  })

  // Scrolling by hand moves the current part too, so the footer never lies.
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (Date.now() < spyPausedUntil.current || !blocks.length) return
        const line = headerHeight + 48
        let index = 0
        blocks.forEach((block, position) => {
          const top = document.getElementById(`sec-${block.id}`)?.getBoundingClientRect().top
          if (top != null && top <= line) index = position
        })
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
        if (atBottom) {
          // The last parts cannot reach the top. Keep a part chosen down there.
          const chosen = blocks.findIndex((block) => block.id === current)
          index = Math.max(index, chosen)
        }
        const id = blocks[index]?.id
        if (id) setCurrent((prev) => (prev === id ? prev : id))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [blocks, current, headerHeight])

  // When the end of the current part is on screen, the change is coming: the footer says so.
  useEffect(() => {
    if (!live) {
      setNearEnd(false)
      return
    }
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const section = activeId ? document.getElementById(`sec-${activeId}`) : null
        const footerTop = footerRef.current?.getBoundingClientRect().top ?? window.innerHeight
        const last = activeId !== blocks[blocks.length - 1]?.id
        setNearEnd(Boolean(section && last && section.getBoundingClientRect().bottom <= footerTop))
      })
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [activeId, blocks, live])

  // Keep the current part chip in view in the scrolling row.
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!row || !chip) return
    const left = chip.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: 'auto' })
    }
  }, [activeId])

  // In live mode the chart fits the width, so nothing scrolls sideways mid-song.
  useLayoutEffect(() => {
    const chartEl = chartRef.current
    if (!chartEl) return
    const measure = () => {
      setChartWidth(chartEl.clientWidth)
      const probe = probeRef.current
      if (probe && settings.fontSize) setChPerPx(probe.offsetWidth / 10 / settings.fontSize)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(chartEl)
    return () => observer.disconnect()
  }, [settings.fontSize, chart])

  // The screen stays on while a song is being played.
  useEffect(() => {
    if (!live || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const request = () => {
      if (document.visibilityState !== 'visible') return
      void navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (gone) void sentinel.release()
          else lock = sentinel
        })
        .catch(() => undefined)
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [live])

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
        const block = nav[partNumber - 1]
        if (!block) return
        event.preventDefault()
        go(block.id)
        return
      }
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        update({ mode: settings.mode === 'live' ? 'learn' : 'live' })
        return
      }
      // Bluetooth page turner pedals send PageUp and PageDown.
      const back = event.key === 'ArrowLeft' || event.key === 'PageUp'
      const forward = event.key === 'ArrowRight' || event.key === 'PageDown'
      if (!back && !forward) return
      event.preventDefault()
      stepSection(back ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocks, activeId, nav, settings.mode])

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
  const partTotal = blocks.length
  const partCountLabel =
    partLabel && partTotal > 0 ? `${partLabel} ${partIndex + 1}/${partTotal}` : partLabel
  const songKey = (chart ?? song).key
  const spelling = live ? settings.liveSpelling : settings.spelling
  const nextBlock = blocks[partIndex + 1]
  const nextChords = nextBlock
    ? chordSequence(nextBlock.section.lines)
        .slice(0, 4)
        .map((raw) => formatChord(raw, songKey, semitones, spelling))
    : []
  const widestLine = widestLineCh(blocks, songKey, semitones, spelling)
  // Section border and padding take about 16px of the width.
  const fitted = chartWidth && widestLine ? Math.floor((chartWidth - 16) / (widestLine * chPerPx)) : settings.fontSize
  // Live mode shrinks a little to keep lines whole, then wraps what is still too long.
  const chartFontSize = live
    ? Math.max(Math.round(settings.fontSize * 0.85), Math.min(settings.fontSize, fitted))
    : settings.fontSize
  const wrapAt = live && chartWidth ? Math.floor((chartWidth - 16) / (chPerPx * chartFontSize)) : undefined
  const author = song.artist.trim() || song.composer.trim()
  const names = chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
    formatChord(raw, songKey, semitones, spelling),
  )
  const uniqueNames = [...new Set(names)]
  const diagramNames = [
    ...new Set(
      chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
        formatChord(raw, (chart ?? song).key, semitones, 'letters'),
      ),
    ),
  ]

  const toolbarFloat = (
    <>
      {activeList && (
        <Link
          to={`/listas/${encodeURIComponent(activeList.id)}`}
          aria-keyshortcuts="Escape"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:underline"
        >
          <span>
            {setlistItemIndex + 1}/{activeList.items.length} {activeList.name}
          </span>
          {headerOpen && <Kbd>Esc</Kbd>}
        </Link>
      )}
      <p className="shrink-0 text-base font-semibold text-primary tabular-nums">{partCountLabel}</p>
      <span className="inline-flex items-center gap-1">
        <UserBadge />
        <InfoTip label="Qué es una persona" text={USER_HINT} />
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={headerOpen}
        aria-keyshortcuts="Space"
        onClick={() => setHeaderOpen((open) => !open)}
      >
        {headerOpen ? 'Ocultar' : 'Controles'}
        <Kbd>Espacio</Kbd>
      </Button>
    </>
  )

  const modeButton = (
    <Button
      size="sm"
      variant="outline"
      aria-keyshortcuts="M"
      title={live ? 'Modo aprender: diagramas, notas y referencias.' : 'Modo tocar: solo la cifra, grande y sin distracciones.'}
      onClick={() => update({ mode: live ? 'learn' : 'live' })}
    >
      {live ? <BookOpen /> : <Guitar />}
      <span className={cn(live && !headerOpen && 'sr-only sm:not-sr-only')}>{live ? 'Aprender' : 'Tocar'}</span>
      {headerOpen && <Kbd>M</Kbd>}
    </Button>
  )

  const transposer = (compact: boolean) => (
    <div
      role="group"
      aria-label="Tono"
      className={cn('flex shrink-0 items-center rounded-md border bg-card', compact ? 'gap-0' : 'gap-1 self-start px-1 py-1')}
    >
      <Button variant="ghost" size="icon" aria-label="Bajar un semitono" title="Baja un semitono." onClick={() => setSemitones(semitones - 1)}>
        <Minus />
      </Button>
      <span className={cn('text-center font-semibold', compact ? 'min-w-10 text-base' : 'min-w-16 text-sm')} aria-live="polite">
        <span className="sr-only">Tono </span>
        {soundingKey || '—'}
        {semitones !== 0 && songKey ? (
          <span className={cn('block text-xs font-normal text-muted-foreground', compact && 'sr-only')}>orig. {songKey}</span>
        ) : null}
      </span>
      <Button variant="ghost" size="icon" aria-label="Subir un semitono" title="Sube un semitono." onClick={() => setSemitones(semitones + 1)}>
        <Plus />
      </Button>
    </div>
  )

  return (
    <div className="min-h-svh pb-40">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <header ref={headerRef} className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className={cn('mx-auto flex max-w-[70.4rem] flex-col px-4 py-2', live && !headerOpen ? 'gap-2' : 'gap-3')}>
          {live && !headerOpen ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden sm:contents">
                <SongMark songId={song.id} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg leading-tight font-semibold">{song.title}</h1>
                {activeList && (
                  <Link
                    to={`/listas/${encodeURIComponent(activeList.id)}`}
                    className="block truncate text-xs text-muted-foreground hover:underline"
                  >
                    {setlistItemIndex + 1}/{activeList.items.length} {activeList.name}
                  </Link>
                )}
              </div>
              {transposer(true)}
              {modeButton}
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={headerOpen}
                aria-keyshortcuts="Space"
                aria-label="Controles"
                title="Controles (Espacio)"
                onClick={() => setHeaderOpen(true)}
              >
                <SlidersHorizontal />
                <span className="sr-only sm:not-sr-only">Controles</span>
              </Button>
            </div>
          ) : headerOpen ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:min-w-[12rem] sm:flex-1">
                <SongMark songId={song.id} />
                <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{song.title}</h1>
              </div>
              {toolbarFloat}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {modeButton}
                {toolbarFloat}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <SongMark songId={song.id} />
                <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{song.title}</h1>
                {author && <p className="max-w-[40%] shrink-0 truncate text-sm text-muted-foreground">{author}</p>}
              </div>
            </div>
          )}
          {!(live && !headerOpen) && transposer(false)}
          {headerOpen && (
          <>
          <div className="flex flex-wrap items-center gap-2">
            {modeButton}
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
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Volver"
                title="Volver a las canciones."
                aria-keyshortcuts={listaId ? undefined : 'Escape'}
              >
                <Link to="/">
                  <ArrowLeft />
                </Link>
              </Button>
              {!listaId && <Kbd>Esc</Kbd>}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {song.artist || 'Sin artista'}
              {song.composer ? ` · ${song.composer}` : ''}
            </p>
            {song.editable && (
              <Button variant="outline" size="icon" asChild aria-label="Editar" title="Editar esta canción.">
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
              title={settings.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
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
              <InfoTip label="Qué significa compartir" text={SHARE_HINT} />
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
                    title="Quitar a esta persona de la copia."
                    onClick={() => void shareSong(song.id, { userId, include: false })}
                  >
                    {person?.name ?? userId} ×
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SpellingToggle
              value={spelling}
              onChange={(next) => update(live ? { liveSpelling: next } : { spelling: next })}
            />
            <Button variant="outline" title="Achica la letra de la cifra." onClick={() => update({ fontSize: Math.max(16, settings.fontSize - 2) })}>
              A−
            </Button>
            <Button variant="outline" title="Aumenta la letra de la cifra." onClick={() => update({ fontSize: Math.min(40, settings.fontSize + 2) })}>
              A+
            </Button>
            <Button
              variant={settings.showChords ? 'default' : 'outline'}
              title="Muestra u oculta los acordes sobre la letra."
              onClick={() => update({ showChords: !settings.showChords })}
            >
              Acordes
            </Button>
            <Button
              variant={settings.showDiagrams ? 'default' : 'outline'}
              size="icon"
              aria-pressed={settings.showDiagrams}
              aria-label="Diagramas"
              title="Muestra u oculta los diagramas del instrumento."
              onClick={() => update({ showDiagrams: !settings.showDiagrams })}
            >
              <Eye />
            </Button>
            <Button
              variant={settings.concise ? 'default' : 'outline'}
              title={
                settings.concise
                  ? 'Pliega las partes iguales en la cifra y en la lista de arriba. El ×2 se queda.'
                  : 'Muestra cada parte, también las que se repiten.'
              }
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
                  title={NOTE_HINT[type]}
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

          </>
          )}

          <nav ref={chipsRef} aria-label="Partes de la canción" className="flex gap-1.5 overflow-x-auto pb-1">
            {nav.map((chip, index) => {
              const kind = partKind(chip.label)
              const active = chip.ids.includes(activeId ?? '')
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                  title={
                    chip.copies > 1
                      ? `Sale ${chip.copies} veces${chip.repeat > 1 ? `. Se repite ×${chip.repeat}` : ''}.`
                      : undefined
                  }
                  onClick={() => go(chip.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
                    live ? 'min-h-11 text-base' : 'py-1',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                  )}
                >
                  {kind !== 'other' && (
                    <span className={cn('size-1.5 rounded-full', active ? 'bg-primary-foreground' : kindPip(kind))} />
                  )}
                  {index < 9 && <Kbd>{index + 1}</Kbd>}
                  {headerChipText(chip)}
                </button>
              )
            })}
          </nav>
          {(!live || headerOpen) && (
          <ShortcutLegend
            className="border-t pt-2"
            items={[
              { id: 'space', keys: <Kbd>Espacio</Kbd>, label: 'Controles' },
              { id: 'mode', keys: <Kbd>M</Kbd>, label: live ? 'Modo aprender' : 'Modo tocar' },
              {
                id: 'pedal',
                keys: (
                  <>
                    <Kbd>RePág</Kbd>
                    <Kbd>AvPág</Kbd>
                  </>
                ),
                label: 'Pedal de páginas',
              },
              {
                id: 'part',
                keys: (
                  <>
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd>
                  </>
                ),
                label: 'Parte anterior o siguiente',
              },
              { id: 'jump', keys: <Kbd>1–9</Kbd>, label: 'Ir a esa parte' },
              {
                id: 'song',
                keys: (
                  <>
                    <Kbd>⌘←</Kbd>
                    <Kbd>⌘→</Kbd>
                  </>
                ),
                label: listaId ? 'Canción en la lista' : 'Canción en la biblioteca',
              },
              {
                id: 'leave',
                keys: <Kbd>Esc</Kbd>,
                label: listaId ? 'Volver a la lista' : 'Volver a las canciones',
              },
            ]}
          />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[70.4rem] px-4 py-4">
        {!chart && <p className="mb-4 text-sm text-muted-foreground">Cargando {instrumentLabel(instrument)}…</p>}
        {chart && !live && settings.showDiagrams && (instrument === 'drums' || diagramNames.length > 0) && (
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

        <div
          ref={chartRef}
          className={cn('relative font-mono', live ? 'space-y-5' : 'space-y-8')}
          style={{ fontSize: `${chartFontSize}px` }}
        >
          <span ref={probeRef} aria-hidden className="invisible absolute whitespace-pre" style={{ fontSize: `${settings.fontSize}px` }}>
            0000000000
          </span>
          {blocks.map((block, index) => {
            const active = block.id === activeId
            const kind = partKind(block.label)
            const folded = settings.concise && Boolean(block.duplicateOf) && !expanded.includes(block.id)
            const following = blocks[index + 1]
            const followingChord = following ? chordSequence(following.section.lines)[0] : undefined
            return (
              <section
                key={block.id}
                id={`sec-${block.id}`}
                aria-labelledby={`h-${block.id}`}
                aria-current={active ? 'step' : undefined}
                style={{ scrollMarginTop: `${headerHeight + 8}px` }}
                className={cn(
                  'rounded-r-md pl-3 transition-colors',
                  active ? 'border-l-4 border-primary bg-primary/[0.06] py-2' : cn('border-l-2', kindEdge(kind)),
                )}
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h2
                    id={`h-${block.id}`}
                    className={cn('font-sans text-[0.7em] font-semibold tracking-wide uppercase', kindHeading(kind))}
                  >
                    <span className="sr-only">Parte {index + 1}: </span>
                    {block.label}
                  </h2>
                  {block.repeat > 1 && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-sans font-bold',
                        live ? 'bg-primary text-[0.7em] text-primary-foreground' : 'bg-primary/15 text-[0.55em]',
                      )}
                    >
                      <span aria-hidden>×{block.repeat}</span>
                      <span className="sr-only">se repite {block.repeat} veces</span>
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
                        spelling={spelling}
                        semitones={semitones}
                        songKey={(chart ?? song).key}
                        visible={settings.visibleNotes}
                        openNote={openNote}
                        onToggle={setOpenNote}
                        wrapAt={wrapAt}
                      />
                    ))}
                    {block.section.sameAs && block.section.lines.length === 0 && (
                      <p className="font-sans text-[0.65em] text-muted-foreground">
                        No se encontró la parte «{block.section.sameAs}».
                      </p>
                    )}
                  </div>
                )}
                {live && following && (
                  <button
                    type="button"
                    data-cue
                    aria-label={`Ir a la parte siguiente: ${following.label}`}
                    onClick={() => go(following.id)}
                    className={cn(
                      'mt-1 inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-sans text-[0.6em] focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
                      active ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground',
                    )}
                  >
                    <ChevronRight className="size-[1.1em]" aria-hidden />
                    <span className="font-semibold">{following.label}</span>
                    {following.repeat > 1 && <span>×{following.repeat}</span>}
                    {followingChord && (
                      <span className="font-mono font-semibold text-chart-chord">
                        {formatChord(followingChord, songKey, semitones, spelling)}
                      </span>
                    )}
                  </button>
                )}
              </section>
            )
          })}
        </div>

        {!live && (song.sources.length > 0 || song.source) && (
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

      <footer ref={footerRef} className="fixed inset-x-0 bottom-8 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] flex-col gap-2">
          <div
            className="flex h-2.5 items-center gap-1"
            role="progressbar"
            aria-label="Avance de la canción"
            aria-valuemin={1}
            aria-valuemax={Math.max(partTotal, 1)}
            aria-valuenow={partTotal ? Math.max(partIndex + 1, 1) : 1}
            aria-valuetext={partLabel ? `${partLabel}, parte ${Math.max(partIndex + 1, 1)} de ${partTotal}` : undefined}
          >
            {/* One segment per part, as long as its lines times its repeats. */}
            {blocks.map((block, index) => (
              <span
                key={block.id}
                className={cn(
                  'rounded-full transition-[height,background-color] motion-reduce:transition-none',
                  index === partIndex
                    ? 'h-2.5 bg-primary'
                    : index < partIndex
                      ? 'h-1.5 bg-primary/45'
                      : 'h-1.5 bg-muted-foreground/30',
                )}
                style={{ flexGrow: Math.max(1, block.section.lines.length) * Math.max(1, block.repeat), flexBasis: 0 }}
              />
            ))}
          </div>
          <div className="flex items-stretch gap-2">
          <Button
            size="lg"
            variant="secondary"
            aria-label="Parte anterior"
            aria-keyshortcuts="ArrowLeft PageUp"
            disabled={partIndex <= 0}
            className={cn(live && 'h-14 px-4')}
            onClick={() => stepSection(-1)}
          >
            <ChevronLeft />
            <span className={cn(live && 'sr-only sm:not-sr-only')}>Anterior</span>
            {headerOpen && <Kbd>←</Kbd>}
          </Button>
          <p className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <span className="block max-w-full truncate text-sm font-semibold">
              {partLabel || 'Canción'}
              {partTotal > 0 && (
                <span className="ml-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {Math.max(partIndex + 1, 1)}/{partTotal}
                </span>
              )}
            </span>
            <span
              className={cn(
                'block max-w-full truncate rounded-md px-2 text-xs transition-colors motion-reduce:transition-none',
                nearEnd ? 'bg-primary/20 py-0.5 text-sm text-foreground ring-1 ring-primary' : 'text-muted-foreground',
              )}
            >
              {nextBlock ? (
                <>
                  Sigue <span className="font-semibold text-foreground">{nextBlock.label}</span>
                  {nextBlock.repeat > 1 ? ` ×${nextBlock.repeat}` : ''}
                  {nextChords.length > 0 && (
                    <span className="ml-1.5 font-mono text-chart-chord">{nextChords.join(' ')}</span>
                  )}
                </>
              ) : (
                'Última parte'
              )}
            </span>
          </p>
          <Button
            size="lg"
            aria-label={nextBlock ? `Parte siguiente: ${nextBlock.label}` : 'Parte siguiente'}
            aria-keyshortcuts="ArrowRight PageDown"
            disabled={partIndex >= blocks.length - 1}
            className={cn(live && 'h-14 min-w-28 px-5')}
            onClick={() => stepSection(1)}
          >
            {headerOpen && <Kbd>→</Kbd>}
            Siguiente
            <ChevronRight />
          </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

const SHARE_HINT =
  'Una copia personal se puede compartir con todos o con una persona para que la vean. No publica el catálogo.'
const USER_HINT = 'Una persona que entra con su nombre. Tiene un rol: dueño, admin o lectura.'

function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        title={text}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="size-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border bg-popover px-2 py-1.5 text-xs leading-snug text-popover-foreground shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  )
}

function kindPip(kind: PartKind): string {
  if (kind === 'intro') return 'bg-muted-foreground/70'
  if (kind === 'verse') return 'bg-chart-chord'
  if (kind === 'chorus') return 'bg-primary'
  if (kind === 'bridge') return 'bg-accent-foreground/80'
  return 'bg-transparent'
}

function kindHeading(kind: PartKind): string {
  if (kind === 'intro') return 'text-muted-foreground'
  if (kind === 'verse') return 'text-chart-chord'
  if (kind === 'chorus') return 'text-primary'
  if (kind === 'bridge') return 'text-accent-foreground'
  return 'text-foreground'
}

function kindEdge(kind: PartKind): string {
  if (kind === 'intro') return 'border-muted-foreground/35'
  if (kind === 'verse') return 'border-chart-chord/45'
  if (kind === 'chorus') return 'border-primary/40'
  if (kind === 'bridge') return 'border-accent-foreground/40'
  return 'border-transparent'
}

/** Widest chart line in ch, chords included, as ChartRow lays it out. */
function widestLineCh(blocks: DisplayBlock[], songKey: string, semitones: number, spelling: ViewSettings['spelling']): number {
  let widest = 0
  for (const block of blocks) {
    for (const line of block.section.lines) {
      const placed = placeChords(
        line.chords.map((chord) => ({ ...chord, name: formatChord(chord.raw, songKey, semitones, spelling) })),
      )
      const lyric = line.lyric == null ? 0 : displayLyric(line.lyric).trimEnd().length
      widest = Math.max(widest, lyric, placed.cursor)
    }
  }
  return widest
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}
