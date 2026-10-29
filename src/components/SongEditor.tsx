import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react'
import { ChartPreview } from '@/components/ChartPreview'
import { EditorHelp, HELP_PARTES, useEditorHelp } from '@/components/EditorHelp'
import { InstrumentSwitch } from '@/components/InstrumentSwitch'
import { Kbd, ShortcutLegend } from '@/components/KeyHint'
import { NOTE_OPTIONS } from '@/components/NoteIcon'
import { SongMediaInfoBanner } from '@/components/SongMediaInfoBanner'
import { SongMediaEditor } from '@/components/SongMediaEditor'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Stepper } from '@/components/ui/stepper'
import { UserBadge } from '@/components/UserBadge'
import { useSongs } from '@/hooks/useSongs'
import { isInstrument, type InstrumentId } from '@/lib/instruments'
import { loadSettings, saveSettings } from '@/lib/settings'
import { chartToSongMd, fetchChartPage, isBlockedPage, songToMarkdown } from '@/lib/importChart'
import { parseChart } from '@/lib/parseChart'
import {
  applyEditingKey,
  applyOriginalKey,
  blankLine,
  foldComposerIntoArtist,
  blankNote,
  blankSection,
  blankSong,
  blankVersion,
  freshId,
  slugify,
  uniqueId,
  usedSectionIds,
} from '@/lib/draftSong'
import { parseKey, transposeKeyName } from '@/lib/chords'
import { SOURCE_LABELS, guessSourceLabel, isYoutubeEntry } from '@/lib/songMedia'
import { NOTE_LABEL, NOTE_TYPES, type Song, type SongNote, type SongSection } from '@/lib/types'

export function SongEditor() {
  const { songId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state, saveSong, restoreSong, copySong, songById, knowsSong, ensurePart } = useSongs()
  const requested = searchParams.get('inst')
  const instrument: InstrumentId = isInstrument(requested) ? requested : loadSettings().instrument
  const song = state.status === 'ready' && songId ? songById(songId, instrument) : undefined
  const [draft, setDraft] = useState<Song>(blankSong)
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [folded, setFolded] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookupText, setLookupText] = useState('')
  const help = useEditorHelp()
  const hydrated = useRef('')
  const artists = useMemo(
    () =>
      state.status === 'ready'
        ? [...new Set(state.songs.map((item) => item.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
        : [],
    [state],
  )
  const ready = state.status === 'ready'
  const missing = Boolean(songId) && ready && !knowsSong(songId)
  const waiting = Boolean(songId) && ready && !missing && !song
  const version = draft.versions[0]

  useEffect(() => {
    if (!songId || state.status !== 'ready') return
    void ensurePart(songId, instrument).catch((error) => console.error(error))
  }, [ensurePart, instrument, songId, state.status])

  useEffect(() => {
    if (state.status !== 'ready') return
    const key = `${songId || '__new__'}:${instrument}`
    if (hydrated.current === key) return
    if (songId && !song) return
    hydrated.current = key
    const text = song?.sourceText ?? ''
    setDraft(text.trim() ? songFromSource(text, songId || 'nueva') : blankSong())
    const source = song?.source ?? ''
    setUrl(source.startsWith('http') ? source : '')
    setMode('edit')
    setFolded([])
  }, [instrument, song, songId, state.status])

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

  const setSourceLabel = (index: number, label: string) =>
    setDraft((current) => {
      const sources = (current.sources.length ? current.sources : [{ url: current.source, label: '' }]).map(
        (entry, entryIndex) => (entryIndex === index ? { ...entry, label } : entry),
      )
      return { ...current, sources, source: sources[0]?.url ?? '' }
    })

  const referenceRows = (draft.sources.length ? draft.sources : [{ url: draft.source, label: '' }])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isYoutubeEntry(item))

  const [saving, setSaving] = useState(false)
  const save = () => {
    // A new song waits on the YouTube search; a second click would create a second song.
    if (saving) return
    setError('')
    setSaving(true)
    void (async () => {
      try {
        const id = await saveSong(songToMarkdown(draft), songId || undefined, instrument)
        const settings = loadSettings()
        saveSettings({ ...settings, instrument })
        navigate(`/c/${encodeURIComponent(id)}`)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
      } finally {
        setSaving(false)
      }
    })()
  }

  const chooseInstrument = (next: InstrumentId) => {
    if (song && songToMarkdown(draft).trim() !== (song.sourceText ?? '').trim()) {
      if (!window.confirm('Hay cambios sin guardar. ¿Cambiar de instrumento y descartarlos?')) return
    }
    const settings = loadSettings()
    saveSettings({ ...settings, instrument: next })
    hydrated.current = ''
    setSearchParams({ inst: next })
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

  if (state.status === 'loading' || waiting) {
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

  if (song && !song.editable) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4">
          {song.origin === 'catalog'
            ? 'El catálogo solo lo cambia un Admin o un Ayudante.'
            : 'Esta copia no es tuya.'}
        </p>
        <div className="flex justify-center gap-2">
          <Button
            onClick={() => {
              void copySong(song.id).then((id) => navigate(`/c/${encodeURIComponent(id)}`))
            }}
          >
            Crear mi copia
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/c/${encodeURIComponent(song.id)}`}>Volver</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh pb-32">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" asChild aria-label="Volver" title="Sale del editor.">
            <Link to={song ? `/c/${encodeURIComponent(song.id)}` : '/'}>
              <ArrowLeft />
            </Link>
          </Button>
          <ShortcutLegend items={[{ id: 'back', keys: <Kbd>Esc</Kbd>, label: 'Atrás' }]} />
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {draft.title.trim() || (song ? 'Editar canción' : 'Nueva canción')}
          </h1>
          <UserBadge />
          {songId ? <InstrumentSwitch value={instrument} onChange={chooseInstrument} /> : null}
          <div className="flex rounded-lg border p-0.5">
            <Button size="sm" variant={mode === 'edit' ? 'default' : 'ghost'} title="Vuelve a los campos de la cifra." onClick={() => setMode('edit')}>
              Editar
            </Button>
            <Button size="sm" variant={mode === 'preview' ? 'default' : 'ghost'} title="Muestra la cifra como se ve en la canción." onClick={() => setMode('preview')}>
              Vista previa
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[70.4rem] flex-col gap-4 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {songId
            ? 'La letra se copia a los otros instrumentos. Los acordes y las notas de ejecución se quedan en este.'
            : 'Al guardar, los cinco instrumentos empiezan con esta cifra.'}
        </p>
        {!songId ? <SongMediaInfoBanner /> : null}
        {status && <p className="text-sm text-primary">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {mode === 'preview' ? (
          <ChartPreview song={draft} />
        ) : (
          <>
            <EditorHelp open={help.open} onOpenChange={help.setOpen} />
            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <Input aria-label="Título" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </Field>
              <Field label="Artista">
                <Combobox
                  aria-label="Artista"
                  value={draft.artist}
                  suggestions={artists}
                  onChange={(artist) => setDraft((current) => ({ ...current, artist, composer: '' }))}
                />
              </Field>
              <div className="flex flex-nowrap items-end gap-3 sm:col-span-2">
                <KeyStepper
                  label="Tono de edición"
                  value={draft.key}
                  onStep={(delta) => setDraft((current) => applyEditingKey(current, neighborKey(current.key, delta)))}
                />
                <KeyStepper
                  label="Tono original"
                  value={draft.originalKey || draft.key}
                  onStep={(delta) =>
                    setDraft((current) => applyOriginalKey(current, neighborKey(current.originalKey || current.key, delta)))
                  }
                />
              </div>
              <SongMediaEditor
                songId={songId}
                draft={draft}
                onChange={setDraft}
                onSearchStatus={setLookupText}
              />
              {lookupText ? (
                <p className="sm:col-span-2 text-xs text-muted-foreground" aria-live="polite">
                  {lookupText}
                </p>
              ) : null}
              <div className="sm:col-span-2 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Referencias y tutoriales</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title="Agrega otro enlace (cifra, letra…). YouTube va arriba."
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        sources: [...current.sources, { url: '', label: '' }],
                      }))
                    }
                  >
                    <Plus /> Enlace
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Cifras, letras y tutoriales. Los videos de YouTube se editan arriba.</p>
                {referenceRows.map(({ item, index }) => (
                    <div key={`source-${index}`} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                      <Input
                        value={item.url}
                        onBlur={() => {
                          const label = guessSourceLabel(item.url)
                          if (label && !item.label.trim()) setSourceLabel(index, label)
                        }}
                        onChange={(event) => {
                          const url = event.target.value
                          setDraft((current) => {
                            const sources = (current.sources.length
                              ? current.sources
                              : [{ url: current.source, label: '' }]
                            ).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, url } : entry,
                            )
                            return {
                              ...current,
                              sources,
                              source: sources[0]?.url ?? '',
                            }
                          })
                        }}
                        placeholder="https://cifraclub.com/... o tutorial"
                        inputMode="url"
                        title="Dirección del tutorial o de la cifra."
                        aria-label={`URL de referencia ${index + 1}`}
                      />
                      <Combobox
                        value={item.label}
                        onChange={(label) => setSourceLabel(index, label)}
                        suggestions={[guessSourceLabel(item.url), ...SOURCE_LABELS.filter((label) => label !== 'YouTube')]}
                        placeholder={guessSourceLabel(item.url) || 'Cifra, letra…'}
                        title="Nombre corto del enlace, como Cifra o Letra."
                        aria-label={`Etiqueta de referencia ${index + 1}`}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Quita este enlace."
                        aria-label={`Quitar referencia ${index + 1}`}
                        onClick={() =>
                          setDraft((current) => {
                            const sources = (current.sources.length
                              ? current.sources
                              : [{ url: current.source, label: '' }]
                            ).filter((_, entryIndex) => entryIndex !== index)
                            return {
                              ...current,
                              sources,
                              source: sources[0]?.url ?? '',
                            }
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
              </div>
            </section>

            <details className="rounded-xl border bg-card px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Traer de un enlace</summary>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.cifraclub.com/..."
                  inputMode="url"
                  title="Enlace de Cifra Club, La Cuerda u otra cifra."
                  aria-label="Enlace de la cifra"
                />
                <Button title="Lee el enlace y reemplaza el borrador." onClick={() => void convert()} disabled={busy || !url.trim()}>
                  {busy ? 'Convirtiendo…' : 'Convertir'}
                </Button>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Partes</h2>
                <button
                  type="button"
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Cómo usar las partes"
                  aria-label="Cómo usar las partes"
                  onClick={() => help.show(HELP_PARTES)}
                >
                  i
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                title="Agrega una parte vacía al final."
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

            {song?.overridden && song.origin === 'catalog' && song.editable && (
              <Button
                variant="outline"
                title="Vuelve a la cifra del archivo y descarta el cambio de la base."
                onClick={() => {
                  void restoreSong(song.id)
                  navigate(`/c/${encodeURIComponent(song.id)}`)
                }}
              >
                Restaurar original
              </Button>
            )}
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-8 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] flex-wrap gap-2">
          {(!songId || song?.editable) && (
            <Button title="Guarda la cifra en el cancionero." onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          )}
          <Button variant="outline" title="Baja un archivo .song.md de este borrador." onClick={download}>
            Descargar .song.md
          </Button>
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
          title="Verso, coro, puente u otro nombre."
          onChange={(event) => onChange({ ...section, label: event.target.value })}
          className="max-w-xs font-semibold"
        />
        <span className="flex items-center gap-1 text-sm" title="Cuántas veces se toca esta parte.">
          <span aria-hidden>×</span>
          <Stepper
            size="sm"
            value={section.repeat}
            min={1}
            max={99}
            label="Repeticiones"
            onChange={(repeat) => onChange({ ...section, repeat: repeat ?? 1 })}
          />
        </span>
        <Button size="icon" variant="ghost" aria-label="Subir parte" title="Mueve la parte hacia arriba." onClick={() => onMove(-1)}>
          <ChevronUp />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Bajar parte" title="Mueve la parte hacia abajo." onClick={() => onMove(1)}>
          <ChevronDown />
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleFold} aria-pressed={folded} title="Esconde o muestra el contenido de la parte.">
          {folded ? <Eye /> : <EyeOff />}
          {folded ? 'Mostrar' : 'Plegar'}
        </Button>
        <Button size="sm" variant={included ? 'outline' : 'default'} title="Incluye o quita esta parte de la versión." onClick={onToggleIncluded}>
          {included ? `En ${versionLabel ?? 'la versión'}` : 'Oculta'}
        </Button>
        <Button size="sm" variant="ghost" title="Copia esta parte al final." onClick={onDuplicate}>
          Duplicar
        </Button>
        <Button size="icon" variant="ghost" aria-label="Quitar parte" title="Elimina esta parte." onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      {!folded && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Id">
              <Input
                value={section.id}
                aria-label="Id de la parte"
                onChange={(event) => onRenameId(slugify(event.target.value))}
                className="font-mono"
              />
            </Field>
            <Field label="Igual que">
              <Select
                value={section.sameAs ?? ''}
                aria-label="Igual que"
                title="Muestra la letra de otra parte en lugar de escribirla de nuevo."
                onValueChange={(sameAs) => onChange({ ...section, sameAs: sameAs || undefined })}
                options={[
                  { value: '', label: 'Letra propia' },
                  ...others.map((item) => ({ value: item.id, label: item.label || item.id })),
                ]}
              />
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
              <Button size="sm" variant="outline" title="Agrega una línea a esta parte." onClick={() => onChange({ ...section, lines: [...section.lines, blankLine()] })}>
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
          <span key={`chord-${index}`} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1 py-0.5">
            <input
              value={chord.raw}
              aria-label="Acorde"
              title="Símbolo del acorde, como G o D/F#."
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
            <Stepper
              size="xs"
              value={chord.column}
              min={0}
              label="Columna del acorde"
              title="En qué letra de la línea cae el acorde. 0 es el inicio."
              decreaseIcon={<ChevronLeft />}
              increaseIcon={<ChevronRight />}
              decreaseLabel="Mover acorde a la izquierda"
              increaseLabel="Mover acorde a la derecha"
              onChange={(column) =>
                onChange({
                  ...line,
                  chords: line.chords.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, column: column ?? 0 } : item,
                  ),
                })
              }
              className="border-transparent bg-transparent"
            />
            <button
              type="button"
              aria-label="Quitar acorde"
              title="Quita este acorde."
              className="px-1 text-muted-foreground"
              onClick={() => onChange({ ...line, chords: line.chords.filter((_, itemIndex) => itemIndex !== index) })}
            >
              ×
            </button>
            <NoteList
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
          title="Agrega un acorde donde está el cursor de la letra."
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
          title="Texto que se canta en esta línea."
          onChange={(event) => onChange({ ...line, lyric: event.target.value })}
          className="w-full bg-transparent font-mono text-base outline-none"
          placeholder="Letra"
        />
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          title={instrumental ? 'Vuelve a poner letra en esta línea.' : 'Deja la línea solo con acordes.'}
          onClick={() => onChange({ ...line, lyric: instrumental ? '' : null })}
        >
          {instrumental ? 'Con letra' : 'Sin letra'}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Subir línea" title="Mueve la línea hacia arriba." onClick={() => onMove(-1)}>
          <ChevronUp />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Bajar línea" title="Mueve la línea hacia abajo." onClick={() => onMove(1)}>
          <ChevronDown />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Quitar línea" title="Elimina esta línea." onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <NoteList label="Notas de la línea" notes={line.notes} onChange={(notes) => onChange({ ...line, notes })} />
    </div>
  )
}

function NoteList({
  label = '',
  notes,
  onChange,
  compact = false,
}: {
  label?: string
  notes: SongNote[]
  onChange: (notes: SongNote[]) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? '' : 'flex flex-col gap-1'}>
      {notes.map((note) => (
        <div key={note.id} className="flex flex-wrap items-center gap-1">
          <Select
            size="sm"
            value={note.type}
            aria-label="Tipo de nota"
            title="Entrada, cómo tocarlo, repetición, arreglo o nota libre."
            options={NOTE_OPTIONS}
            onValueChange={(type) => onChange(notes.map((item) => (item.id === note.id ? { ...item, type } : item)))}
            className="w-28"
          />
          <Input
            value={note.text}
            aria-label="Texto de la nota"
            title="Lo que dice la marca."
            onChange={(event) =>
              onChange(notes.map((item) => (item.id === note.id ? { ...item, text: event.target.value } : item)))
            }
            className="h-8 min-w-40 flex-1 text-sm"
          />
          <button
            type="button"
            aria-label="Quitar nota"
            title="Elimina esta marca."
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
        title={label ? `Agrega ${label.toLowerCase()}.` : 'Agrega una marca sobre el acorde.'}
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
          title="Agrega una versión con el orden de las partes."
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
              title="Nombre de esta presentación."
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
              title="Elimina esta versión."
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
                  title={`Muestra u oculta «${NOTE_LABEL[type]}» al empezar.`}
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
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs [&_svg]:size-3 ${on ? 'border-primary bg-primary/15' : 'text-muted-foreground'}`}
                >
                  {NOTE_OPTIONS.find((option) => option.value === type)?.icon}
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
                    title="Sube esta parte en el orden de la versión."
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
                    title="Baja esta parte en el orden de la versión."
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

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${className}`}>
      {label}
      {children}
    </label>
  )
}

function neighborKey(key: string, delta: -1 | 1): string {
  const base = key.trim()
  if (!base || !parseKey(base).valid) return delta > 0 ? 'C' : 'B'
  return transposeKeyName(base, delta)
}

/** Same − / tono / + group as the song page. */
function KeyStepper({
  label,
  value,
  onStep,
}: {
  label: string
  value: string
  onStep: (delta: -1 | 1) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-sm font-medium">
      <span>{label}</span>
      <div role="group" aria-label={label} className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Bajar ${label}`}
          title="Baja un semitono."
          onClick={() => onStep(-1)}
        >
          <Minus />
        </Button>
        <span className="min-w-16 text-center text-sm font-semibold" aria-live="polite">
          {value.trim() || '—'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Subir ${label}`}
          title="Sube un semitono."
          onClick={() => onStep(1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function songFromSource(text: string, id: string): Song {
  const ext = text.trimStart().startsWith('---') ? 'song.md' : 'cho'
  return foldComposerIntoArtist(parseChart(text, `${id}.${ext}`))
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
