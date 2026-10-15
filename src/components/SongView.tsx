import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
} from 'lucide-react'
import { ChordStrip } from '@/components/ChordDiagrams'
import { Button } from '@/components/ui/button'
import { formatChord, transposeKeyName } from '@/lib/chords'
import { blocksFor, chordSequence, displayLyric, type DisplayBlock } from '@/lib/display'
import { loadSettings, saveSettings, type ViewSettings } from '@/lib/settings'
import { NOTE_LABEL, NOTE_TYPES, type NoteType, type SongNote } from '@/lib/types'
import { useSongs } from '@/hooks/useSongs'
import { cn } from '@/lib/utils'

export function SongView() {
  const { songId = '' } = useParams()
  const { state, reload } = useSongs()
  const [settings, setSettings] = useState<ViewSettings>(() => loadSettings())
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const pendingScroll = useRef<string | null>(null)

  const song =
    state.status === 'ready' ? state.songs.find((item) => item.id === songId) : undefined

  useEffect(() => {
    setOpenNote(null)
    setExpanded([])
    setVersionId(null)
    setCurrent(null)
  }, [songId])

  const version = song?.versions.find((item) => item.id === versionId) ?? song?.versions[0]
  const blocks = useMemo(
    () => (song ? blocksFor(song, version?.flow ?? null) : []),
    [song, version],
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
      return next
    })
  }

  const semitones = song ? (settings.semitones[song.id] ?? 0) : 0
  const setSemitones = (value: number) => {
    if (!song) return
    const wrapped = value > 11 ? value - 12 : value < -11 ? value + 12 : value
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
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      stepSection(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocks, activeId])

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
          <Link to="/">Volver a Acuerdes</Link>
        </Button>
      </div>
    )
  }

  const soundingKey = transposeKeyName(song.key, semitones)
  const partIndex = blocks.findIndex((block) => block.id === activeId)
  const partLabel = blocks[partIndex]?.label ?? ''
  const names = chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
    formatChord(raw, song.key, semitones, settings.spelling),
  )
  const uniqueNames = [...new Set(names)]
  const diagramNames = [
    ...new Set(
      chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
        formatChord(raw, song.key, semitones, 'letters'),
      ),
    ),
  ]

  return (
    <div className="min-h-svh pb-24">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Volver">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">{song.title}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {song.artist || 'Sin artista'}
                {song.composer ? ` · ${song.composer}` : ''}
              </p>
            </div>
            <Button variant="outline" size="icon" asChild aria-label="Editar">
              <Link to={`/editar/${encodeURIComponent(song.id)}`}>
                <Pencil />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={settings.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              {settings.theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
              <Button variant="ghost" size="icon" aria-label="Bajar un semitono" onClick={() => setSemitones(semitones - 1)}>
                <Minus />
              </Button>
              <span className="min-w-16 text-center text-sm font-semibold">
                {soundingKey || '—'}
                {semitones !== 0 && song.key ? (
                  <span className="block text-xs font-normal text-muted-foreground">orig. {song.key}</span>
                ) : null}
              </span>
              <Button variant="ghost" size="icon" aria-label="Subir un semitono" onClick={() => setSemitones(semitones + 1)}>
                <Plus />
              </Button>
            </div>

            <Button
              variant={settings.spelling === 'degrees' ? 'default' : 'outline'}
              onClick={() =>
                update({ spelling: settings.spelling === 'letters' ? 'degrees' : 'letters' })
              }
            >
              {settings.spelling === 'letters' ? 'Letras' : 'Grados'}
            </Button>
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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {settings.showDiagrams && diagramNames.length > 0 && <ChordStrip names={diagramNames} />}
        {uniqueNames.length > 0 && (
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
                className={cn('scroll-mt-36', active && 'border-l-2 border-primary pl-3')}
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
                        songKey={song.key}
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

        {song.source && (
          <p className="mt-8 font-sans text-sm">
            <a
              href={song.source}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              Ver fuente
              <ExternalLink className="size-3.5" />
            </a>
          </p>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
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

function NoteRow({
  notes,
  visible,
  openNote,
  prefix,
  onToggle,
}: {
  notes: SongNote[]
  visible: NoteType[]
  openNote: string | null
  prefix: string
  onToggle: (id: string | null) => void
}) {
  const shown = notes.filter((note) => visible.includes(note.type))
  if (!shown.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5 font-sans">
      {shown.map((note) => {
        const key = `${prefix}:${note.id}`
        const open = openNote === key
        const short = note.text.length <= 48
        if (short) {
          return (
            <span
              key={key}
              className="rounded-md bg-accent px-2 py-0.5 text-[0.55em] leading-snug text-accent-foreground"
            >
              <span className="font-semibold">{NOTE_LABEL[note.type]}.</span> {note.text}
            </span>
          )
        }
        return (
          <span key={key}>
            <button
              type="button"
              className="rounded-md bg-accent px-2 py-0.5 text-[0.55em] font-semibold"
              aria-expanded={open}
              onClick={() => onToggle(open ? null : key)}
            >
              {NOTE_LABEL[note.type]}
            </button>
            {open && (
              <span className="mt-1 block rounded-md bg-card px-2 py-1 text-[0.6em] shadow-sm">
                {note.text}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function ChartRow({
  block,
  lineIndex,
  showChords,
  spelling,
  semitones,
  songKey,
  visible,
  openNote,
  onToggle,
}: {
  block: DisplayBlock
  lineIndex: number
  showChords: boolean
  spelling: ViewSettings['spelling']
  semitones: number
  songKey: string
  visible: NoteType[]
  openNote: string | null
  onToggle: (id: string | null) => void
}) {
  const line = block.section.lines[lineIndex]
  if (!line) return null
  const lyric = line.lyric == null ? null : displayLyric(line.lyric)
  const placed = placeChords(
    line.chords.map((chord) => ({
      ...chord,
      name: formatChord(chord.raw, songKey, semitones, spelling),
    })),
  )
  const width = Math.max(lyric?.length ?? 0, placed.cursor, 1)

  return (
    <div className="mb-[0.55em]">
      <NoteRow
        notes={line.notes}
        visible={visible}
        openNote={openNote}
        prefix={`${block.id}:${lineIndex}`}
        onToggle={onToggle}
      />
      {showChords && placed.items.length > 0 && (
        <div className="relative h-[1.35em]" style={{ width: `${width}ch` }}>
          {placed.items.map((item, index) => {
            const note = item.chord.notes.find((entry) => visible.includes(entry.type))
            const key = `${block.id}:${lineIndex}:c${index}:${note?.id ?? ''}`
            const open = note ? openNote === key : false
            return (
              <span key={key} className="absolute top-0" style={{ left: `${item.left}ch` }}>
                <span className="text-[0.72em] leading-none font-semibold whitespace-nowrap text-chart-chord">
                  {item.name}
                  {note && (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={note.text}
                      className="ml-[0.2em] inline-block size-[0.55em] rounded-full bg-chart-chord align-middle"
                      onClick={() => onToggle(open ? null : key)}
                    />
                  )}
                </span>
              </span>
            )
          })}
        </div>
      )}
      {lyric != null && (
        <p className="font-medium whitespace-pre" style={{ width: `${width}ch` }}>
          {lyric || ' '}
        </p>
      )}
      {placed.items.map((item, index) => {
        const note = item.chord.notes.find((entry) => visible.includes(entry.type))
        if (!note) return null
        const key = `${block.id}:${lineIndex}:c${index}:${note.id}`
        if (openNote !== key) return null
        return (
          <p key={key} className="mt-1 font-sans text-[0.6em]">
            <span className="font-semibold text-chart-chord">{NOTE_LABEL[note.type]}.</span>{' '}
            {note.text}
          </p>
        )
      })}
    </div>
  )
}

function placeChords(
  chords: Array<{ raw: string; column: number; notes: SongNote[]; name: string }>,
) {
  let cursor = 0
  const items = chords.map((chord) => {
    const extra = chord.notes.length ? 1.4 : 0
    const left = Math.max(chord.column, cursor)
    cursor = left + chord.name.length * 0.72 + extra + 0.35
    return { chord, name: chord.name, left }
  })
  return { items, cursor }
}
