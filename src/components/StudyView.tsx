import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, Play, Shuffle } from 'lucide-react'
import { ChordDiagram, shapeLabel } from '@/components/ChordDiagrams'
import { Kbd, ShortcutLegend } from '@/components/KeyHint'
import { Fretboard, PianoKeys } from '@/components/StudyDiagrams'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { useSongs } from '@/hooks/useSongs'
import { parseKey, prefersFlats, spellPitch } from '@/lib/chords'
import { diagramFor, shapesFor } from '@/lib/guitar'
import { loadSettings } from '@/lib/settings'
import { guitarMidis, pianoMidis, playNotes, playSequence } from '@/lib/sound'
import {
  borrowedChords,
  chordName,
  chordTonesText,
  circleKeys,
  diatonicChords,
  INVERSION_LABEL,
  intervalText,
  keyFlats,
  keyName,
  mod12,
  noteLabel,
  parseStudyKey,
  pianoVoicings,
  QUALITIES,
  qualityById,
  scaleById,
  SCALES,
  signature,
  type StudyChord,
  type StudyKey,
} from '@/lib/theory'
import { sectionProgressions, spellProgression } from '@/lib/sectionProgression'
import { cn } from '@/lib/utils'

type StudyInstrument = 'guitarra' | 'piano'
type Labels = 'notes' | 'degrees'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

const TABS = [
  { id: 'tono', label: 'Tonalidad' },
  { id: 'progresiones', label: 'Progresiones' },
  { id: 'escalas', label: 'Escalas' },
  { id: 'diccionario', label: 'Diccionario' },
  { id: 'repaso', label: 'Repaso' },
] as const

type TabId = (typeof TABS)[number]['id']

const MINOR_QUALITIES = ['m', 'm7', 'dim', 'm7b5']

export function StudyIndex() {
  const { search } = useLocation()
  const instrument = loadSettings().instrument === 'piano' ? 'piano' : 'guitarra'
  return <Navigate to={{ pathname: `/estudio/${instrument}`, search }} replace />
}

export function StudyView() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const instrument: StudyInstrument = params.instrumento === 'piano' ? 'piano' : 'guitarra'
  const studyKey = parseStudyKey(search.get('tono')) ?? { pc: 0, minor: false }
  const tab: TabId = TABS.find((item) => item.id === search.get('ver'))?.id ?? 'tono'
  const sevenths = search.get('siete') === '1'
  const [labels, setLabels] = useState<Labels>('notes')

  const setParam = (name: string, value: string | null) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        if (value == null) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )
  }
  const setKey = (key: StudyKey) => setParam('tono', keyName(key))

  const keyRef = useRef({ studyKey, setKey })
  keyRef.current = { studyKey, setKey }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
      event.preventDefault()
      const { studyKey: current, setKey: change } = keyRef.current
      const ring = circleKeys(current.minor)
      const index = ring.findIndex((key) => key.pc === current.pc)
      const step = event.key === 'ArrowRight' ? 1 : -1
      const next = ring[(index + step + ring.length) % ring.length]
      if (next) change(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-svh pb-16">
      <header className="border-b bg-card/80">
        <div className={`${page} flex flex-wrap items-center gap-3 py-4`}>
          <span className="inline-flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild aria-label="Volver" aria-keyshortcuts="Escape">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <Kbd>Esc</Kbd>
          </span>
          <h1 className="text-lg font-semibold">Estudio</h1>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Instrumento">
            {(['guitarra', 'piano'] as const).map((id) => (
              <Button
                key={id}
                asChild
                size="sm"
                variant={instrument === id ? 'default' : 'ghost'}
                aria-pressed={instrument === id}
              >
                <Link to={{ pathname: `/estudio/${id}`, search: search.toString() }} replace>
                  {id === 'guitarra' ? 'Guitarra' : 'Piano'}
                </Link>
              </Button>
            ))}
          </div>
          <div className="ml-auto">
            <UserBadge />
          </div>
        </div>
      </header>

      <main className={`${page} flex flex-col gap-4 py-4`}>
        <KeyPicker value={studyKey} onChange={setKey} />

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex w-full gap-0.5 rounded-lg border p-0.5 sm:w-auto" aria-label="Secciones">
            {TABS.map((item) => (
              <Button
                key={item.id}
                size="sm"
                className="flex-1 px-1.5 text-xs sm:flex-none sm:px-3 sm:text-sm"
                variant={tab === item.id ? 'default' : 'ghost'}
                aria-pressed={tab === item.id}
                onClick={() => setParam('ver', item.id === 'tono' ? null : item.id)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex rounded-lg border p-0.5" role="group" aria-label="Etiquetas">
            {(['notes', 'degrees'] as const).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={labels === id ? 'secondary' : 'ghost'}
                aria-pressed={labels === id}
                title={id === 'notes' ? 'Muestra el nombre de cada nota.' : 'Muestra el grado o intervalo de cada nota.'}
                onClick={() => setLabels(id)}
              >
                {id === 'notes' ? 'Notas' : 'Grados'}
              </Button>
            ))}
          </div>
        </div>

        {tab === 'tono' && (
          <KeyTab
            instrument={instrument}
            studyKey={studyKey}
            sevenths={sevenths}
            onSevenths={(on) => setParam('siete', on ? '1' : null)}
            labels={labels}
            onKey={setKey}
          />
        )}
        {tab === 'progresiones' && (
          <ProgressionsTab instrument={instrument} studyKey={studyKey} labels={labels} />
        )}
        {tab === 'escalas' && (
          <ScalesTab
            instrument={instrument}
            studyKey={studyKey}
            scaleId={search.get('escala')}
            onScale={(id) => setParam('escala', id)}
            labels={labels}
          />
        )}
        {tab === 'diccionario' && (
          <DictionaryTab
            instrument={instrument}
            qualityId={search.get('tipo') ?? ''}
            onQuality={(id) => setParam('tipo', id || null)}
            labels={labels}
          />
        )}
        {tab === 'repaso' && <ReviewTab instrument={instrument} studyKey={studyKey} sevenths={sevenths} />}

        <ShortcutLegend
          className="mt-2"
          items={[
            { id: 'key', keys: <Kbd>← →</Kbd>, label: 'Tonalidad anterior o siguiente (círculo de quintas)' },
            ...(tab === 'repaso'
              ? [
                  { id: 'show', keys: <Kbd>Espacio</Kbd>, label: 'Mostrar' },
                  { id: 'next', keys: <Kbd>Enter</Kbd>, label: 'Otro acorde' },
                ]
              : []),
          ]}
        />
      </main>
    </div>
  )
}

function KeyPicker({ value, onChange }: { value: StudyKey; onChange: (key: StudyKey) => void }) {
  const { state } = useSongs()
  const songs = state.status === 'ready' ? state.songs : []
  const inKey = songs.filter((song) => {
    const parsed = parseKey(song.key)
    return parsed.valid && parsed.pc === value.pc && parsed.minor === value.minor
  })
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const song of songs) {
      const parsed = parseKey(song.key)
      if (!parsed.valid) continue
      const id = `${parsed.pc}:${parsed.minor}`
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [songs])
  const relative: StudyKey = value.minor ? { pc: mod12(value.pc + 3), minor: false } : { pc: mod12(value.pc + 9), minor: true }

  return (
    <section className="rounded-xl border bg-card/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Modo">
          {[false, true].map((minor) => (
            <Button
              key={String(minor)}
              size="sm"
              variant={value.minor === minor ? 'default' : 'ghost'}
              aria-pressed={value.minor === minor}
              onClick={() => onChange(minor ? { pc: mod12(value.pc + 9), minor } : { pc: mod12(value.pc + 3), minor })}
            >
              {minor ? 'Menor' : 'Mayor'}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{keyName(value)}</span> · armadura {signature(value)} ·
          relativa{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange(relative)}>
            {keyName(relative)}
          </button>
        </p>
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-12" role="group" aria-label="Tonalidad">
        {circleKeys(value.minor).map((key) => {
          const selected = key.pc === value.pc
          const count = counts.get(`${key.pc}:${key.minor}`) ?? 0
          return (
            <button
              key={key.pc}
              type="button"
              aria-pressed={selected}
              title={count ? `${count} canciones en ${keyName(key)}` : undefined}
              onClick={() => onChange(key)}
              className={cn(
                'relative flex flex-col items-center rounded-lg border py-1.5 leading-tight',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
              )}
            >
              <span className="text-sm font-semibold">{keyName(key)}</span>
              <span className={cn('text-[10px]', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {signature(key)}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    'absolute top-0.5 right-1 text-[9px] font-semibold',
                    selected ? 'text-primary-foreground' : 'text-chart-chord',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {inKey.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Tus canciones en {keyName(value)}:</span>
          {inKey.map((song) => (
            <Link
              key={song.id}
              to={`/c/${encodeURIComponent(song.id)}`}
              className="rounded-full border bg-background px-2 py-0.5 hover:bg-accent"
            >
              {song.title}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function SeventhsToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex rounded-lg border p-0.5" role="group" aria-label="Acordes">
      {[false, true].map((on) => (
        <Button
          key={String(on)}
          size="sm"
          variant={value === on ? 'secondary' : 'ghost'}
          aria-pressed={value === on}
          onClick={() => onChange(on)}
        >
          {on ? 'Con séptima' : 'Tríadas'}
        </Button>
      ))}
    </div>
  )
}

function playChord(instrument: StudyInstrument, chord: { root: number; quality: string; name: string }) {
  if (instrument === 'guitarra') {
    const diagram = diagramFor(chord.name)
    if (diagram) playNotes(guitarMidis(diagram.frets), { strum: 0.035 })
    return
  }
  const voicing = pianoVoicings(chord.root, qualityById(chord.quality).intervals)[0] ?? []
  playNotes(pianoMidis(voicing))
}

function chordMidis(instrument: StudyInstrument, chord: StudyChord): number[] {
  if (instrument === 'guitarra') {
    const diagram = diagramFor(chord.name)
    return diagram ? guitarMidis(diagram.frets) : []
  }
  return pianoMidis(pianoVoicings(chord.root, qualityById(chord.quality).intervals)[0] ?? [])
}

function ChordCard({
  instrument,
  chord,
  selected,
  onSelect,
  hideName = false,
}: {
  instrument: StudyInstrument
  chord: StudyChord
  selected?: boolean
  onSelect?: () => void
  hideName?: boolean
}) {
  const diagram = instrument === 'guitarra' ? diagramFor(chord.name) : null
  const voicing = pianoVoicings(chord.root, qualityById(chord.quality).intervals)[0] ?? []
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={hideName ? 'Acorde oculto' : `${chord.name}${chord.degree ? `, grado ${chord.degree}` : ''}`}
      onClick={() => {
        playChord(instrument, chord)
        onSelect?.()
      }}
      className={cn(
        'flex shrink-0 flex-col items-center rounded-xl border bg-background px-2 pt-1.5 pb-2 text-center hover:bg-accent/60',
        selected && 'ring-2 ring-primary',
      )}
    >
      {chord.degree && <span className="text-[11px] font-semibold text-muted-foreground">{chord.degree}</span>}
      {instrument === 'guitarra' ? (
        diagram ? (
          <ChordDiagram diagram={hideName ? { ...diagram, name: '?' } : diagram} size="lg" />
        ) : (
          <span className="py-10 text-xs text-muted-foreground">Sin forma</span>
        )
      ) : (
        <>
          <span className="text-sm font-semibold text-chart-chord">{hideName ? '?' : chord.name}</span>
          <PianoKeys
            marks={voicing.map((note, index) => ({ note, root: index === 0 && mod12(note) === chord.root }))}
            className="mt-1 h-[3.6rem] w-[8.5rem]"
            label={hideName ? 'Acorde oculto' : `Piano ${chord.name}`}
          />
        </>
      )}
      {chord.role && <span className="mt-1 text-[10px] text-muted-foreground">{chord.role}</span>}
    </button>
  )
}

function ChordDetail({
  instrument,
  chord,
  labels,
  flats,
}: {
  instrument: StudyInstrument
  chord: StudyChord
  labels: Labels
  flats: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [chord.name])
  const intervals = qualityById(chord.quality).intervals

  return (
    <section ref={ref} className="rounded-xl border bg-card/70 p-3" aria-label={`Detalle de ${chord.name}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold text-chart-chord">{chord.name}</h3>
        <span className="text-sm text-muted-foreground">{qualityById(chord.quality).label}</span>
        <span className="text-sm">{chordTonesText(chord.root, intervals, flats)}</span>
        <span className="text-sm text-muted-foreground">({intervalText(intervals)})</span>
      </div>
      {instrument === 'guitarra' ? (
        <div className="flex flex-wrap gap-2">
          {shapesFor(chord.name).map((shape) => (
            <button
              key={shape.id}
              type="button"
              className="rounded-lg border bg-background px-1 pb-1 hover:bg-accent/60"
              aria-label={`${shapeLabel(shape)} de ${chord.name}`}
              onClick={() => playNotes(guitarMidis(shape.frets), { strum: 0.035 })}
            >
              <ChordDiagram diagram={shape} size="lg" />
              <span className="block text-[10px] text-muted-foreground">{shapeLabel(shape)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {pianoVoicings(chord.root, intervals).map((voicing, index) => (
            <button
              key={index}
              type="button"
              className="rounded-lg border bg-background p-2 text-left hover:bg-accent/60"
              onClick={() => playNotes(pianoMidis(voicing))}
            >
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{INVERSION_LABEL[index]}</span>
              <PianoKeys
                marks={voicing.map((note) => ({
                  note,
                  root: mod12(note) === chord.root,
                  label: noteLabel(mod12(note), chord.root, labels, flats, true),
                }))}
                showLabels
                className="w-full"
                label={`${chord.name}, ${INVERSION_LABEL[index]}`}
              />
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Toca un diagrama para escucharlo.</p>
    </section>
  )
}

function ChordGrid({
  instrument,
  chords,
  labels,
  flats,
}: {
  instrument: StudyInstrument
  chords: StudyChord[]
  labels: Labels
  flats: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const active = chords.find((chord) => chord.name === selected)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chords.map((chord) => (
          <ChordCard
            key={`${chord.degree}-${chord.name}`}
            instrument={instrument}
            chord={chord}
            selected={chord.name === selected}
            onSelect={() => setSelected(chord.name === selected ? null : chord.name)}
          />
        ))}
      </div>
      {active && <ChordDetail instrument={instrument} chord={active} labels={labels} flats={flats} />}
    </>
  )
}

function KeyTab({
  instrument,
  studyKey,
  sevenths,
  onSevenths,
  labels,
  onKey,
}: {
  instrument: StudyInstrument
  studyKey: StudyKey
  sevenths: boolean
  onSevenths: (on: boolean) => void
  labels: Labels
  onKey: (key: StudyKey) => void
}) {
  const flats = keyFlats(studyKey)
  const chords = diatonicChords(studyKey, sevenths)
  const scale = scaleById(null, studyKey.minor)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Acordes de {keyName(studyKey)}</h2>
        <SeventhsToggle value={sevenths} onChange={onSevenths} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => playSequence(chords.map((chord) => chordMidis(instrument, chord)), { gap: 0.8, strum: 0.03 })}
        >
          <Play />
          Escuchar
        </Button>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Escala: {scale.intervals.map((interval) => spellPitch(studyKey.pc + interval, flats)).join(' · ')}
      </p>
      <ChordGrid key={`${keyName(studyKey)}-${sevenths}`} instrument={instrument} chords={chords} labels={labels} flats={flats} />

      <div>
        <h2 className="font-semibold">Fuera de la escala, pero comunes</h2>
        <p className="text-sm text-muted-foreground">Acordes prestados y dominantes secundarias que aparecen en muchas canciones.</p>
      </div>
      <ChordGrid
        key={`extra-${keyName(studyKey)}`}
        instrument={instrument}
        chords={borrowedChords(studyKey)}
        labels={labels}
        flats={flats}
      />

      <div>
        <h2 className="mb-2 font-semibold">Tonalidades vecinas</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { key: { pc: mod12(studyKey.pc + 5), minor: studyKey.minor }, label: 'Una quinta abajo' },
            { key: { pc: mod12(studyKey.pc + 7), minor: studyKey.minor }, label: 'Una quinta arriba' },
            {
              key: { pc: studyKey.pc, minor: !studyKey.minor },
              label: studyKey.minor ? 'Paralela mayor' : 'Paralela menor',
            },
            { key: { pc: mod12(studyKey.pc + 2), minor: studyKey.minor }, label: 'Un tono arriba' },
          ].map((item) => (
            <Button key={item.label} size="sm" variant="outline" onClick={() => onKey(item.key)}>
              <span className="font-semibold">{keyName(item.key)}</span>
              <span className="text-muted-foreground">{item.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProgressionsTab({
  instrument,
  studyKey,
  labels,
}: {
  instrument: StudyInstrument
  studyKey: StudyKey
  labels: Labels
}) {
  const { state } = useSongs()
  const songs = state.status === 'ready' ? state.songs : []
  const progressions = useMemo(() => sectionProgressions(songs), [songs])
  const flats = keyFlats(studyKey)
  const [selected, setSelected] = useState<{ row: number; index: number } | null>(null)
  const activeRow = selected ? progressions[selected.row] : undefined
  const active = activeRow ? chordsFor(activeRow.steps, studyKey)[selected?.index ?? -1] : undefined

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Progresiones de cada parte</h2>
        <p className="text-sm text-muted-foreground">
          Los grados salen de una parte de una canción guardada. Abajo, la misma progresión en otras tonalidades.
        </p>
      </div>
      {state.status === 'loading' && <p className="text-sm text-muted-foreground">Cargando canciones…</p>}
      {state.status === 'ready' && progressions.length === 0 && (
        <p className="text-sm text-muted-foreground">Ninguna parte tiene una progresión todavía.</p>
      )}
      {progressions.map((progression, row) => {
        const steps = chordsFor(progression.steps, studyKey)
        const played =
          progression.alternatives.length > 0
            ? progression.alternatives
            : otherKeys(progression.reference.key).map((key) => ({
                key: keyName(key),
                chords: spellProgression(progression.steps, key),
                songId: '',
                title: '',
                section: '',
              }))
        return (
          <section key={progression.degrees} className="rounded-xl border bg-card/70 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="font-semibold tracking-wide">{progression.degrees}</h3>
              <span className="text-sm text-muted-foreground">
                Ejemplo:{' '}
                <Link to={`/c/${encodeURIComponent(progression.reference.songId)}`} className="font-medium text-primary hover:underline">
                  {progression.reference.title}
                </Link>
                {' · '}
                {progression.reference.section}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() =>
                  playSequence(
                    [...steps, steps[0]!].map((chord) => chordMidis(instrument, chord)),
                    { gap: 1.1, strum: 0.035 },
                  )
                }
              >
                <Play />
                Escuchar
              </Button>
            </div>
            <p className="mb-2 text-sm text-chart-chord">En {keyName(studyKey)}: {spellProgression(progression.steps, studyKey)}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {steps.map((chord, index) => (
                <ChordCard
                  key={index}
                  instrument={instrument}
                  chord={chord}
                  selected={selected?.row === row && selected.index === index}
                  onSelect={() =>
                    setSelected(selected?.row === row && selected.index === index ? null : { row, index })
                  }
                />
              ))}
            </div>
            {played.length > 0 && (
              <div className="mt-3 flex flex-col gap-1 text-sm">
                <p className="text-muted-foreground">También se toca</p>
                {played.map((item) => (
                  <p key={`${item.key}-${item.songId}`}>
                    <span className="font-medium">En {item.key}:</span>{' '}
                    <span className="text-chart-chord">{item.chords}</span>
                    {item.songId && (
                      <>
                        {' · '}
                        <Link to={`/c/${encodeURIComponent(item.songId)}`} className="text-primary hover:underline">
                          {item.title}
                        </Link>
                        {' · '}
                        {item.section}
                      </>
                    )}
                  </p>
                ))}
              </div>
            )}
          </section>
        )
      })}
      {active && <ChordDetail instrument={instrument} chord={active} labels={labels} flats={flats} />}
    </div>
  )
}

function chordsFor(steps: string[], key: StudyKey): StudyChord[] {
  return steps.map((step) => {
    const match = step.match(/^(1|b2|2|b3|3|4|b5|5|b6|6|b7|7)(m|dim|aug)?$/)
    const offset = { '1': 0, b2: 1, '2': 2, b3: 3, '3': 4, '4': 5, b5: 6, '5': 7, b6: 8, '6': 9, b7: 10, '7': 11 }[match?.[1] ?? '1'] ?? 0
    const quality = match?.[2] ?? ''
    return {
      root: mod12(key.pc + offset),
      quality,
      name: spellStepName(step, key),
      degree: step,
    }
  })
}

function spellStepName(step: string, key: StudyKey): string {
  return spellProgression([step], key)
}

function otherKeys(referenceKey: string): StudyKey[] {
  const parsed = parseKey(referenceKey)
  const base = parsed.valid ? parsed.pc : 0
  const minor = parsed.valid ? parsed.minor : false
  return [
    { pc: mod12(base + 7), minor },
    { pc: mod12(base + 5), minor },
  ]
}

function ScalesTab({
  instrument,
  studyKey,
  scaleId,
  onScale,
  labels,
}: {
  instrument: StudyInstrument
  studyKey: StudyKey
  scaleId: string | null
  onScale: (id: string) => void
  labels: Labels
}) {
  const scale = scaleById(scaleId, studyKey.minor)
  const flats = keyFlats(studyKey)
  const tones = scale.intervals.map((interval) => mod12(studyKey.pc + interval))
  const [showAll, setShowAll] = useState(false)
  const label = (pc: number) => noteLabel(pc, studyKey.pc, labels, flats)
  const ascending = [...scale.intervals, 12].map((interval) => 60 + studyKey.pc + interval)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Escala">
        {SCALES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === scale.id}
            onClick={() => onScale(item.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium',
              item.id === scale.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">
          {spellPitch(studyKey.pc, flats)} {scale.label.toLowerCase()}
        </h2>
        <span className="text-sm text-chart-chord">{tones.map((pc) => spellPitch(pc, flats)).join(' · ')}</span>
        <span className="text-sm text-muted-foreground">
          ({tones.map((pc) => noteLabel(pc, studyKey.pc, 'degrees', flats)).join(' · ')})
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => playSequence([...ascending, ...ascending.slice(0, -1).reverse()].map((midi) => [midi]), { gap: 0.28, length: 0.5 })}
        >
          <Play />
          Escuchar
        </Button>
      </div>
      <section className="rounded-xl border bg-card/70 p-3">
        {instrument === 'piano' ? (
          <PianoKeys
            marks={Array.from({ length: 24 }, (_, note) => note)
              .filter((note) => tones.includes(note % 12))
              .map((note) => ({ note, root: note % 12 === studyKey.pc, label: label(note % 12) }))}
            showLabels
            className="w-full"
            label={`Escala ${scale.label} en piano`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Fretboard tones={tones} root={studyKey.pc} labelFor={label} showAll={showAll} />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              Mostrar también las notas fuera de la escala
            </label>
          </>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        La fundamental va en color ámbar; las demás notas de la escala, en azul.
      </p>
    </div>
  )
}

function DictionaryTab({
  instrument,
  qualityId,
  onQuality,
  labels,
}: {
  instrument: StudyInstrument
  qualityId: string
  onQuality: (id: string) => void
  labels: Labels
}) {
  const quality = qualityById(qualityId)
  const minorish = MINOR_QUALITIES.includes(quality.id)
  const chords: StudyChord[] = Array.from({ length: 12 }, (_, root) => ({
    root,
    quality: quality.id,
    name: chordName(root, quality.id, prefersFlats(root, minorish)),
    degree: '',
  }))
  const [selected, setSelected] = useState<string | null>(null)
  const active = chords.find((chord) => chord.name === selected)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo de acorde">
        {QUALITIES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === quality.id}
            onClick={() => {
              onQuality(item.id)
              setSelected(null)
            }}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium',
              item.id === quality.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {quality.label}: {intervalText(quality.intervals)}. Los doce, de C a B. Toca uno para ver{' '}
        {instrument === 'guitarra' ? 'todas sus formas' : 'sus inversiones'}.
      </p>
      <div className="flex flex-wrap gap-2">
        {chords.map((chord) => (
          <ChordCard
            key={chord.name}
            instrument={instrument}
            chord={chord}
            selected={chord.name === selected}
            onSelect={() => setSelected(chord.name === selected ? null : chord.name)}
          />
        ))}
      </div>
      {active && (
        <ChordDetail instrument={instrument} chord={active} labels={labels} flats={prefersFlats(active.root, minorish)} />
      )}
    </div>
  )
}

const REVIEW_QUALITIES = ['', 'm', '7', 'm7', 'maj7']

function ReviewTab({
  instrument,
  studyKey,
  sevenths,
}: {
  instrument: StudyInstrument
  studyKey: StudyKey
  sevenths: boolean
}) {
  const [pool, setPool] = useState<'key' | 'all'>('key')
  const [ask, setAsk] = useState<'name' | 'shape'>('name')
  const chords = useMemo<StudyChord[]>(() => {
    if (pool === 'key') return diatonicChords(studyKey, sevenths)
    return Array.from({ length: 12 }, (_, root) =>
      REVIEW_QUALITIES.map((quality) => ({
        root,
        quality,
        name: chordName(root, quality, prefersFlats(root, MINOR_QUALITIES.includes(quality))),
        degree: '',
      })),
    ).flat()
  }, [pool, studyKey, sevenths])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [seen, setSeen] = useState(0)
  const chord = chords[index % chords.length]

  const next = () => {
    if (chords.length < 2) return
    let pick = index
    while (pick === index) pick = Math.floor(Math.random() * chords.length)
    setIndex(pick)
    setRevealed(false)
    setSeen((count) => count + 1)
  }
  const nextRef = useRef(next)
  nextRef.current = next

  useEffect(() => {
    setIndex(Math.floor(Math.random() * chords.length))
    setRevealed(false)
  }, [chords])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button')) return
      if (event.key === ' ') {
        event.preventDefault()
        setRevealed((value) => !value)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        nextRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!chord) return null
  const showName = ask === 'name' || revealed
  const showShape = ask === 'shape' || revealed

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Acordes del repaso">
          {(['key', 'all'] as const).map((id) => (
            <Button key={id} size="sm" variant={pool === id ? 'secondary' : 'ghost'} aria-pressed={pool === id} onClick={() => setPool(id)}>
              {id === 'key' ? `Tonalidad ${keyName(studyKey)}` : 'Todas las tonalidades'}
            </Button>
          ))}
        </div>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Pregunta">
          {(['name', 'shape'] as const).map((id) => (
            <Button key={id} size="sm" variant={ask === id ? 'secondary' : 'ghost'} aria-pressed={ask === id} onClick={() => setAsk(id)}>
              {id === 'name' ? 'Veo el nombre' : 'Veo la forma'}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{seen} vistos</span>
      </div>

      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card/70 px-3 py-6">
        <p className="text-sm text-muted-foreground">
          {ask === 'name' ? '¿Cómo se toca?' : '¿Qué acorde es?'}
          {pool === 'key' && showName && chord.degree && <> · grado {chord.degree}</>}
        </p>
        <p className={cn('text-4xl font-semibold text-chart-chord', !showName && 'invisible')}>{chord.name}</p>
        <div className={cn(!showShape && 'invisible')}>
          <ChordCard instrument={instrument} chord={{ ...chord, degree: '', role: undefined }} hideName={!showName} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRevealed((value) => !value)} aria-keyshortcuts="Space">
            <Eye />
            {revealed ? 'Ocultar' : 'Mostrar'}
          </Button>
          <Button onClick={next} aria-keyshortcuts="Enter">
            <Shuffle />
            Otro
          </Button>
        </div>
      </section>
    </div>
  )
}
