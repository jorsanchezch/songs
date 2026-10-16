import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { ChartPreview } from '@/components/ChartPreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSongs } from '@/hooks/useSongs'
import { chartToSongMd, fetchChartPage, isBlockedPage, songToMarkdown } from '@/lib/importChart'
import { parseChart } from '@/lib/parseChart'
import {
  blankLine,
  blankNote,
  blankSection,
  blankSong,
  blankVersion,
  freshId,
  slugify,
  uniqueId,
  usedSectionIds,
} from '@/lib/draftSong'
import { NOTE_LABEL, NOTE_TYPES, type NoteType, type Song, type SongNote, type SongSection } from '@/lib/types'

export function SongEditor() {
  const { songId = '' } = useParams()
  const navigate = useNavigate()
  const { state, saveSong, removeSong, restoreSong } = useSongs()
  const song = state.status === 'ready' ? state.songs.find((item) => item.id === songId) : undefined
  const [draft, setDraft] = useState<Song>(blankSong)
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [folded, setFolded] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const hydrated = useRef('')
  const ready = state.status === 'ready'
  const missing = Boolean(songId) && ready && !song
  const version = draft.versions[0]

  useEffect(() => {
    if (state.status !== 'ready') return
    const key = songId || '__new__'
    if (hydrated.current === key) return
    if (songId && !song) return
    hydrated.current = key
    const text = song?.sourceText ?? ''
    setDraft(text.trim() ? songFromSource(text, songId || 'nueva') : blankSong())
    const source = song?.source ?? ''
    setUrl(source.startsWith('http') ? source : '')
    setMode('edit')
    setFolded([])
  }, [state.status, song, songId])

  const convert = async () => {
    setError('')
    setBusy(true)
    setStatus('Leyendo el enlace…')
    try {
      const link = url.trim()
      const page = link ? await fetchChartPage(link) : songToMarkdown(draft)
      const markdown = chartToSongMd(page, link || draft.source)
      setDraft(songFromSource(markdown, songId || 'nueva'))
      setMode('edit')
      setStatus('Listo. Revisa las partes y guarda.')
    } catch (reason) {
      setStatus('')
      const message = reason instanceof Error ? reason.message : 'No se pudo convertir.'
      setError(message)
      if (message.includes('bloqueó') && isBlockedPage(songToMarkdown(draft))) setDraft(blankSong())
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    setError('')
    try {
      const id = saveSong(songToMarkdown(draft), songId || undefined)
      navigate(`/c/${encodeURIComponent(id)}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
    }
  }

  const remove = () => {
    if (!song) return
    const label = song.origin === 'local' ? '¿Eliminar esta canción?' : '¿Ocultar esta canción en este navegador?'
    if (!window.confirm(label)) return
    setLeaving(true)
    removeSong(song)
    navigate('/')
  }

  const download = () => {
    const markdown = songToMarkdown(draft)
    const title = draft.title.trim() || 'cancion'
    const artist = draft.artist.trim()
    const blob = new Blob([markdown], { type: 'text/plain;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `${artist ? `${title} - ${artist}` : title}.song.md`.replace(/[\\/]/g, '-')
    link.click()
    URL.revokeObjectURL(href)
  }

  if (state.status === 'loading' || leaving) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" />
        <p>Cargando…</p>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4">No está esta canción.</p>
        <Button asChild>
          <Link to="/">Volver a Songbook</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-svh pb-24">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to={song ? `/c/${encodeURIComponent(song.id)}` : '/'}>
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {draft.title.trim() || (song ? 'Editar canción' : 'Nueva canción')}
          </h1>
          <div className="flex rounded-lg border p-0.5">
            <Button size="sm" variant={mode === 'edit' ? 'default' : 'ghost'} onClick={() => setMode('edit')}>
              Editar
            </Button>
            <Button size="sm" variant={mode === 'preview' ? 'default' : 'ghost'} onClick={() => setMode('preview')}>
              Vista previa
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        {status && <p className="text-sm text-primary">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {mode === 'preview' ? (
          <ChartPreview song={draft} />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </Field>
              <Field label="Artista">
                <Input value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} />
              </Field>
              <Field label="Compositor">
                <Input value={draft.composer} onChange={(event) => setDraft({ ...draft, composer: event.target.value })} />
              </Field>
              <Field label="Tonalidad">
                <Input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="uppercase" />
              </Field>
              <Field label="Fuente" className="sm:col-span-2">
                <Input
                  value={draft.source}
                  onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                  placeholder="https://"
                />
              </Field>
            </section>

            <details className="rounded-xl border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Traer de un enlace</summary>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.cifraclub.com/..."
                  inputMode="url"
                  aria-label="Enlace de la cifra"
                />
                <Button onClick={() => void convert()} disabled={busy || !url.trim()}>
                  {busy ? 'Convirtiendo…' : 'Convertir'}
                </Button>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Partes</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((current) => {
                    const ids = usedSectionIds(current)
                    const id = uniqueId('parte', ids)
                    const section = blankSection('Parte', id)
                    return {
                      ...current,
                      sections: [...current.sections, section],
                      versions: current.versions.map((item) => ({ ...item, flow: [...item.flow, id] })),
                    }
                  })
                }
              >
                <Plus /> Parte
              </Button>
            </div>

            {draft.sections.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                song={draft}
                folded={folded.includes(section.id)}
                versionLabel={version?.label}
                included={version ? version.flow.includes(section.id) : true}
                onToggleFold={() =>
                  setFolded((ids) =>
                    ids.includes(section.id) ? ids.filter((id) => id !== section.id) : [...ids, section.id],
                  )
                }
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    sections: current.sections.map((item) => (item.id === section.id ? next : item)),
                  }))
                }
                onRenameId={(nextId) => setDraft((current) => renameSection(current, section.id, nextId))}
                onMove={(direction) => setDraft((current) => moveSection(current, index, direction))}
                onRemove={() => setDraft((current) => removeSection(current, section.id))}
                onDuplicate={() => setDraft((current) => duplicateSection(current, section))}
                onToggleIncluded={() => setDraft((current) => toggleIncluded(current, section.id))}
              />
            ))}

            <VersionsEditor song={draft} onChange={setDraft} />

            {song?.overridden && song.origin === 'catalog' && (
              <Button
                variant="outline"
                onClick={() => {
                  restoreSong(song.id)
                  navigate(`/c/${encodeURIComponent(song.id)}`)
                }}
              >
                Restaurar original
              </Button>
            )}
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2">
          <Button onClick={save}>Guardar</Button>
          <Button variant="outline" onClick={download}>
            Descargar .song.md
          </Button>
          {song && (
            <Button variant="outline" onClick={remove}>
              {song.origin === 'local' ? 'Eliminar' : 'Ocultar'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function SectionCard({
  section,
  song,
  folded,
  versionLabel,
  included,
  onToggleFold,
  onChange,
  onRenameId,
  onMove,
  onRemove,
  onDuplicate,
  onToggleIncluded,
}: {
  section: SongSection
  song: Song
  folded: boolean
  versionLabel?: string
  included: boolean
  onToggleFold: () => void
  onChange: (section: SongSection) => void
  onRenameId: (id: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onDuplicate: () => void
  onToggleIncluded: () => void
}) {
  const others = song.sections.filter((item) => item.id !== section.id && !item.sameAs)
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={section.label}
          aria-label="Nombre de la parte"
          onChange={(event) => onChange({ ...section, label: event.target.value })}
          className="max-w-xs font-semibold"
        />
        <label className="flex items-center gap-1 text-sm">
          ×
          <Input
            type="number"
            min={1}
            value={section.repeat}
            aria-label="Repeticiones"
            onChange={(event) => onChange({ ...section, repeat: Math.max(1, Number(event.target.value) || 1) })}
            className="w-16"
          />
        </label>
        <Button size="icon" variant="ghost" aria-label="Subir parte" onClick={() => onMove(-1)}>
          <ChevronUp />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Bajar parte" onClick={() => onMove(1)}>
          <ChevronDown />
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleFold} aria-pressed={folded}>
          {folded ? <Eye /> : <EyeOff />}
          {folded ? 'Mostrar' : 'Plegar'}
        </Button>
        <Button size="sm" variant={included ? 'outline' : 'default'} onClick={onToggleIncluded}>
          {included ? `En ${versionLabel ?? 'la versión'}` : 'Oculta'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDuplicate}>
          Duplicar
        </Button>
        <Button size="icon" variant="ghost" aria-label="Quitar parte" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      {!folded && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Id">
              <Input
                value={section.id}
                onChange={(event) => onRenameId(slugify(event.target.value))}
                className="font-mono"
              />
            </Field>
            <Field label="Igual que">
              <select
                value={section.sameAs ?? ''}
                aria-label="Parte duplicada"
                onChange={(event) =>
                  onChange({
                    ...section,
                    sameAs: event.target.value || undefined,
                  })
                }
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Letra propia</option>
                {others.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <NoteList
            label="Notas de la parte"
            notes={section.notes}
            onChange={(notes) => onChange({ ...section, notes })}
          />

          {section.sameAs ? (
            <p className="text-sm text-muted-foreground">
              Esta parte muestra la letra de {others.find((item) => item.id === section.sameAs)?.label ?? section.sameAs}.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {section.lines.map((line, index) => (
                <LineCard
                  key={`${section.id}-${index}`}
                  line={line}
                  onChange={(next) =>
                    onChange({
                      ...section,
                      lines: section.lines.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    })
                  }
                  onMove={(direction) => onChange({ ...section, lines: moveItem(section.lines, index, direction) })}
                  onRemove={() =>
                    onChange({
                      ...section,
                      lines: section.lines.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                />
              ))}
              <Button size="sm" variant="outline" onClick={() => onChange({ ...section, lines: [...section.lines, blankLine()] })}>
                <Plus /> Línea
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function LineCard({
  line,
  onChange,
  onMove,
  onRemove,
}: {
  line: SongSection['lines'][number]
  onChange: (line: SongSection['lines'][number]) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const lyricRef = useRef<HTMLInputElement>(null)
  const instrumental = line.lyric == null
  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="mb-2 flex flex-wrap gap-1">
        {line.chords.map((chord, index) => (
          <span key={`${chord.column}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1 py-0.5">
            <input
              value={chord.raw}
              aria-label="Acorde"
              onChange={(event) =>
                onChange({
                  ...line,
                  chords: line.chords.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, raw: event.target.value } : item,
                  ),
                })
              }
              className="w-16 bg-transparent font-mono text-sm font-semibold text-chart-chord outline-none"
            />
            <input
              type="number"
              min={0}
              value={chord.column}
              aria-label="Columna del acorde"
              onChange={(event) =>
                onChange({
                  ...line,
                  chords: line.chords.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, column: Math.max(0, Number(event.target.value) || 0) } : item,
                  ),
                })
              }
              className="w-12 bg-transparent text-xs outline-none"
            />
            <button
              type="button"
              aria-label="Quitar acorde"
              className="px-1 text-muted-foreground"
              onClick={() => onChange({ ...line, chords: line.chords.filter((_, itemIndex) => itemIndex !== index) })}
            >
              ×
            </button>
            <NoteList
              label=""
              notes={chord.notes}
              compact
              onChange={(notes) =>
                onChange({
                  ...line,
                  chords: line.chords.map((item, itemIndex) => (itemIndex === index ? { ...item, notes } : item)),
                })
              }
            />
          </span>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const column = lyricRef.current?.selectionStart ?? (line.lyric?.length ?? 0)
            onChange({
              ...line,
              chords: [...line.chords, { raw: 'C', column, notes: [] }].sort((a, b) => a.column - b.column),
            })
          }}
        >
          <Plus /> Acorde
        </Button>
      </div>
      {instrumental ? (
        <p className="font-mono text-sm text-muted-foreground">Instrumental</p>
      ) : (
        <input
          ref={lyricRef}
          value={line.lyric ?? ''}
          aria-label="Letra"
          onChange={(event) => onChange({ ...line, lyric: event.target.value })}
          className="w-full bg-transparent font-mono text-base outline-none"
          placeholder="Letra"
        />
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ ...line, lyric: instrumental ? '' : null })}
        >
          {instrumental ? 'Con letra' : 'Sin letra'}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Subir línea" onClick={() => onMove(-1)}>
          <ChevronUp />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Bajar línea" onClick={() => onMove(1)}>
          <ChevronDown />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Quitar línea" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <NoteList label="Notas de la línea" notes={line.notes} onChange={(notes) => onChange({ ...line, notes })} />
    </div>
  )
}

function NoteList({
  label,
  notes,
  onChange,
  compact = false,
}: {
  label: string
  notes: SongNote[]
  onChange: (notes: SongNote[]) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? '' : 'flex flex-col gap-1'}>
      {notes.map((note) => (
        <div key={note.id} className="flex flex-wrap items-center gap-1">
          <select
            value={note.type}
            aria-label="Tipo de nota"
            onChange={(event) =>
              onChange(notes.map((item) => (item.id === note.id ? { ...item, type: event.target.value as NoteType } : item)))
            }
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {NOTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {NOTE_LABEL[type]}
              </option>
            ))}
          </select>
          <Input
            value={note.text}
            aria-label="Texto de la nota"
            onChange={(event) =>
              onChange(notes.map((item) => (item.id === note.id ? { ...item, text: event.target.value } : item)))
            }
            className="h-8 min-w-40 flex-1 text-sm"
          />
          <button
            type="button"
            aria-label="Quitar nota"
            className="px-1 text-muted-foreground"
            onClick={() => onChange(notes.filter((item) => item.id !== note.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start text-xs font-medium text-primary"
        onClick={() => onChange([...notes, blankNote()])}
      >
        {label ? `+ ${label}` : '+ Nota'}
      </button>
    </div>
  )
}

function VersionsEditor({ song, onChange }: { song: Song; onChange: (song: Song) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Versiones</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...song,
              versions: [
                ...song.versions,
                {
                  ...blankVersion(song.versions.length ? 'Otra' : 'Presentación', []),
                  id: uniqueId(song.versions.length ? 'otra' : 'presentacion', new Set(song.versions.map((item) => item.id))),
                  flow: song.sections.map((section) => section.id),
                },
              ],
            })
          }
        >
          <Plus /> Versión
        </Button>
      </div>
      {song.versions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin versiones, la canción muestra todas las partes. Una versión elige el orden, qué partes se ocultan y qué notas empiezan abiertas.
        </p>
      )}
      {song.versions.map((version) => (
        <div key={version.id} className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input
              value={version.label}
              aria-label="Nombre de la versión"
              onChange={(event) =>
                onChange({
                  ...song,
                  versions: song.versions.map((item) =>
                    item.id === version.id ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
              className="max-w-xs"
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Quitar versión"
              onClick={() => onChange({ ...song, versions: song.versions.filter((item) => item.id !== version.id) })}
            >
              <Trash2 />
            </Button>
          </div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Notas abiertas al empezar</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {NOTE_TYPES.map((type) => {
              const on = version.openNotes.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...song,
                      versions: song.versions.map((item) =>
                        item.id === version.id
                          ? {
                              ...item,
                              openNotes: on
                                ? item.openNotes.filter((note) => note !== type)
                                : [...item.openNotes, type],
                            }
                          : item,
                      ),
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary/15' : 'text-muted-foreground'}`}
                >
                  {NOTE_LABEL[type]}
                </button>
              )
            })}
          </div>
          <ol className="flex flex-col gap-1">
            {version.flow.map((id, index) => {
              const section = song.sections.find((item) => item.id === id)
              return (
                <li key={`${version.id}-${id}-${index}`} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{section?.label ?? id}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Subir en la versión"
                    onClick={() =>
                      onChange({
                        ...song,
                        versions: song.versions.map((item) =>
                          item.id === version.id ? { ...item, flow: moveItem(item.flow, index, -1) } : item,
                        ),
                      })
                    }
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Bajar en la versión"
                    onClick={() =>
                      onChange({
                        ...song,
                        versions: song.versions.map((item) =>
                          item.id === version.id ? { ...item, flow: moveItem(item.flow, index, 1) } : item,
                        ),
                      })
                    }
                  >
                    <ChevronDown />
                  </Button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${className}`}>
      {label}
      {children}
    </label>
  )
}

function songFromSource(text: string, id: string): Song {
  const ext = text.trimStart().startsWith('---') ? 'song.md' : 'cho'
  return parseChart(text, `${id}.${ext}`)
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction
  if (next < 0 || next >= items.length) return items
  const copy = [...items]
  const current = copy[index]
  const swap = copy[next]
  if (current === undefined || swap === undefined) return items
  copy[index] = swap
  copy[next] = current
  return copy
}

function moveSection(song: Song, index: number, direction: -1 | 1): Song {
  return { ...song, sections: moveItem(song.sections, index, direction) }
}

function removeSection(song: Song, id: string): Song {
  return {
    ...song,
    sections: song.sections
      .filter((section) => section.id !== id)
      .map((section) => (section.sameAs === id ? { ...section, sameAs: undefined } : section)),
    versions: song.versions.map((version) => ({ ...version, flow: version.flow.filter((item) => item !== id) })),
  }
}

function duplicateSection(song: Song, section: SongSection): Song {
  const id = uniqueId(`${section.id}-copia`, usedSectionIds(song))
  const copy: SongSection = {
    ...section,
    id,
    label: `${section.label} copia`,
    sameAs: undefined,
    notes: section.notes.map((note) => ({ ...note, id: freshId('n') })),
    lines: section.lines.map((line) => ({
      ...line,
      notes: line.notes.map((note) => ({ ...note, id: freshId('n') })),
      chords: line.chords.map((chord) => ({
        ...chord,
        notes: chord.notes.map((note) => ({ ...note, id: freshId('n') })),
      })),
    })),
  }
  return {
    ...song,
    sections: [...song.sections, copy],
    versions: song.versions.map((version) => ({ ...version, flow: [...version.flow, id] })),
  }
}

function renameSection(song: Song, from: string, to: string): Song {
  const nextId = uniqueId(to || 'parte', new Set([...usedSectionIds(song)].filter((id) => id !== from)))
  return {
    ...song,
    sections: song.sections.map((section) => {
      if (section.id === from) return { ...section, id: nextId }
      if (section.sameAs === from) return { ...section, sameAs: nextId }
      return section
    }),
    versions: song.versions.map((version) => ({
      ...version,
      flow: version.flow.map((id) => (id === from ? nextId : id)),
    })),
  }
}

function toggleIncluded(song: Song, sectionId: string): Song {
  if (!song.versions.length) {
    return {
      ...song,
      versions: [
        {
          id: 'presentacion',
          label: 'Presentación',
          flow: song.sections.map((section) => section.id).filter((id) => id !== sectionId),
          openNotes: [],
        },
      ],
    }
  }
  const version = song.versions[0]
  if (!version) return song
  const included = version.flow.includes(sectionId)
  return {
    ...song,
    versions: song.versions.map((item, index) =>
      index === 0
        ? {
            ...item,
            flow: included ? item.flow.filter((id) => id !== sectionId) : [...item.flow, sectionId],
          }
        : item,
    ),
  }
}
