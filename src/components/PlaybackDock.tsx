import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Flag, Loader2, Minus, Play, Plus, SlidersHorizontal, Square, X } from 'lucide-react'
import { Kbd } from '@/components/KeyHint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFrameTime, type Playback } from '@/hooks/usePlayback'
import {
  cueIndexAt,
  formatClock,
  formatLead,
  impliedBpm,
  NUDGE_MS,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type Cue,
  type MediaOption,
  type PlaybackAudio,
  type PlaybackSettings,
  type SongMediaSources,
  type Timeline,
} from '@/lib/playback'
import { formatDurationMmSs, parseDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'
import { AnalysisSummary } from '@/components/AnalysisSummary'
import { Waveform, type WaveMark } from '@/components/Waveform'
import { beatAt, type AudioAnalysis, type BeatGrid } from '@/lib/audioAnalysis'

/** Calibration in progress: media times tapped at each part start, then the end. */
export type Marking = { phase: 'marking' | 'review'; starts: number[]; endMs: number | null }

type Sync = {
  leadMs: number
  speed: number
  /** Lead or speed differ from what the song has saved. */
  dirty: boolean
  canSave: boolean
  onLead: (ms: number) => void
  onSpeed: (speed: number) => void
  onSave: () => void
}

type Marks = {
  state: Marking | null
  canMark: boolean
  measured: number
  total: number
  /** Saved marks belong to another video or MP3. */
  stale: boolean
  /** Part the next tap marks; null means the next tap marks the end. */
  nextLabel: string | null
  onStart: () => void
  onMark: () => void
  onUndo: () => void
  onDone: () => void
  onSave: () => void
  onDiscard: () => void
  onClear: () => void
}

/** Reading the MP3: tempo, bars and part boundaries from the sound. */
export type Tune = {
  analysis: AudioAnalysis | null
  running: boolean
  progress: number
  error: string
  /** Bar lines to draw and pulse on: the saved grid, or the proposal's while previewing. */
  grid: BeatGrid | null
  /** Parts cut on bar lines, waiting to be saved. */
  proposal: { bars: number[]; quality: number } | null
  marks: WaveMark[]
  canEdit: boolean
  bpm: number | null
  durationMs: number | null
  onAnalyze: () => void
  onAlign: () => void
  onSave: () => void
  onDiscard: () => void
  onRetempo: (bpm: number) => void
  onBpm?: (bpm: number) => void
  onDuration?: (ms: number) => void
}

const OPEN_DELAY_MS = 450
const CHIP_DELAY_MS = 100
const CLOSE_DELAY_MS = 280
const RING_R = 30
const RING_LENGTH = 2 * Math.PI * RING_R

export function PlaybackDock({
  playback,
  settings,
  onSettings,
  media,
  audio,
  timeline,
  startLabel,
  bottom,
  onToggle,
  cues,
  sync,
  marks,
  escapeRef,
  canEditDuration,
  onDurationChange,
  onPickSource,
  onMakeSelected,
  makingSelected,
  tune,
}: {
  tune?: Tune
  playback: Playback
  settings: PlaybackSettings
  onSettings: (patch: Partial<PlaybackSettings>) => void
  media: SongMediaSources
  /** Audio that will really play, after falling back for missing sources. */
  audio: PlaybackAudio
  timeline: Timeline
  startLabel: string
  /** Distance from the bottom of the viewport, above the part footer. */
  bottom: number
  onToggle: () => void
  cues: Cue[]
  sync: Sync
  marks: Marks
  /** SongView's Escape asks the dock first; true means the dock used it. */
  escapeRef: MutableRefObject<(() => boolean) | null>
  canEditDuration?: boolean
  /** Sets the song length (ms); saved to the song when the reader can edit it. */
  onDurationChange?: (durationMs: number | null) => void
  /** Session pick of which YouTube drives audio when there are several. */
  onPickSource?: (url: string) => void
  /** Persist the active pick as the song's principal YouTube. */
  onMakeSelected?: (url: string) => void
  makingSelected?: boolean
}) {
  // Hover opens the panel for a mouse after a pause; the chip pins it for touch and keyboard.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const open = hovered || pinned
  const timer = useRef(0)
  const holdHover = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const marking = marks.state
  const { playing, status, error } = playback

  const hoverOpen = (delay: number) => {
    window.clearTimeout(timer.current)
    if (holdHover.current || playing || marking) return
    timer.current = window.setTimeout(() => setHovered(true), delay)
  }
  const closeSoon = () => {
    window.clearTimeout(timer.current)
    holdHover.current = false
    timer.current = window.setTimeout(() => setHovered(false), CLOSE_DELAY_MS)
  }
  const close = () => {
    window.clearTimeout(timer.current)
    setHovered(false)
    if (pinned) chipRef.current?.focus()
    setPinned(false)
  }

  escapeRef.current = () => {
    if (!open) return false
    close()
    return true
  }

  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setHovered(false)
      setPinned(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open])

  // A click on the chip moves focus into the panel; hover never steals it.
  useEffect(() => {
    if (pinned) panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  }, [pinned])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const hasLength = Boolean(media.durationMs || playback.mediaMs || timeline.measured)
  const fellBack = settings.pace === 'duration' && (timeline.basis === 'bpm' || timeline.basis === 'estimate')
  const showError = error && error !== dismissedError && !open
  const showVideo = audio === 'youtube' && (playing || Boolean(marking))

  return (
    <div
      ref={rootRef}
      className="fixed right-3 z-30 flex flex-col items-end gap-2 font-sans sm:right-5"
      style={{ bottom }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') hoverOpen(OPEN_DELAY_MS)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') closeSoon()
      }}
    >
      {open && !marking && (
        <SettingsPanel
          panelRef={panelRef}
          playback={playback}
          settings={settings}
          onSettings={onSettings}
          media={media}
          audio={audio}
          timeline={timeline}
          startLabel={startLabel}
          hasLength={hasLength}
          fellBack={fellBack}
          sync={sync}
          marks={marks}
          canEditDuration={canEditDuration}
          onDurationChange={onDurationChange}
          onPickSource={onPickSource}
          onMakeSelected={onMakeSelected}
          makingSelected={makingSelected}
          tune={tune}
        />
      )}

      {showError && (
        <p
          role="alert"
          className="flex max-w-[min(24rem,calc(100vw-1.5rem))] items-start gap-2 rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive shadow-md"
        >
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Cerrar aviso" className="text-muted-foreground" onClick={() => setDismissedError(error)}>
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {marking && <MarkBar marks={marks} />}

      {/* YouTube must stay visible while it plays; when stopped it keeps loading, out of sight. */}
      {audio === 'youtube' && (
        <div
          ref={playback.youtubeHost}
          className={cn(
            'overflow-hidden rounded-lg border bg-black shadow-lg [&_iframe]:size-full',
            showVideo ? 'size-[200px]' : 'pointer-events-none invisible absolute size-[200px]',
          )}
        />
      )}

      <div className="flex items-center gap-2">
        {playing && <PlaybackClock playback={playback} timeline={timeline} marking={Boolean(marking)} grid={tune?.grid ?? null} />}
        <div className="relative size-20">
          {playing && !marking && <CueRing elapsed={playback.elapsed} cues={cues} totalMs={timeline.totalMs} />}
          <button
            type="button"
            aria-label={
              marking
                ? marking.phase === 'review'
                  ? 'Revisa las marcas'
                  : marks.nextLabel
                    ? `Marcar el inicio de ${marks.nextLabel}`
                    : 'Marcar el final'
                : status === 'loading'
                  ? 'Cargando audio; toca para cancelar'
                  : playing
                    ? 'Parar la reproducción'
                    : `Reproducir desde ${startLabel || 'el inicio'}`
            }
            aria-pressed={playing && !marking}
            aria-busy={status === 'loading'}
            aria-keyshortcuts={marking ? 'M' : 'P'}
            disabled={marking?.phase === 'review'}
            title={marking ? 'Marcar' : playing ? 'Parar' : 'Reproducir'}
            onPointerDown={() => {
              // Reaching for play should not pop the panel over the chart.
              window.clearTimeout(timer.current)
              holdHover.current = true
            }}
            onClick={marking ? marks.onMark : onToggle}
            className={cn(
              'absolute inset-1 inline-flex items-center justify-center rounded-full shadow-lg transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none',
              marking
                ? 'bg-destructive text-white'
                : playing || status === 'loading'
                  ? 'bg-foreground text-background'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {marking ? (
              <Flag className="size-7" />
            ) : status === 'loading' ? (
              <Loader2 className="size-7 animate-spin motion-reduce:animate-none" />
            ) : playing ? (
              <Square className="size-6 fill-current" />
            ) : (
              <Play className="ml-0.5 size-8 fill-current" />
            )}
          </button>
          {!marking && (
            <button
              ref={chipRef}
              type="button"
              aria-label="Ajustes de reproducción"
              aria-expanded={open}
              title="Ajustes de reproducción"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') {
                  holdHover.current = false
                  hoverOpen(CHIP_DELAY_MS)
                }
              }}
              onClick={() => {
                if (pinned) close()
                else setPinned(true)
              }}
              className="absolute -top-1 -left-1 inline-flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground shadow after:absolute after:-inset-1.5 after:content-[''] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsPanel({
  panelRef,
  playback,
  settings,
  onSettings,
  media,
  audio,
  timeline,
  startLabel,
  hasLength,
  fellBack,
  sync,
  marks,
  canEditDuration,
  onDurationChange,
  onPickSource,
  onMakeSelected,
  makingSelected,
  tune,
}: {
  tune?: Tune
  panelRef: MutableRefObject<HTMLDivElement | null>
  playback: Playback
  settings: PlaybackSettings
  onSettings: (patch: Partial<PlaybackSettings>) => void
  media: SongMediaSources
  audio: PlaybackAudio
  timeline: Timeline
  startLabel: string
  hasLength: boolean
  fellBack: boolean
  sync: Sync
  marks: Marks
  canEditDuration?: boolean
  onDurationChange?: (durationMs: number | null) => void
  onPickSource?: (url: string) => void
  onMakeSelected?: (url: string) => void
  makingSelected?: boolean
}) {
  const [durationDraft, setDurationDraft] = useState(() => formatDurationMmSs(media.durationMs))
  useEffect(() => setDurationDraft(formatDurationMmSs(media.durationMs)), [media.durationMs])
  const commitDuration = () => {
    const next = parseDurationMmSs(durationDraft)
    // Only an empty field clears the length; text that is not m:ss goes back.
    if (next == null && durationDraft.trim()) {
      setDurationDraft(formatDurationMmSs(media.durationMs))
      return
    }
    if (next !== (media.durationMs ?? null)) onDurationChange?.(next)
  }
  const missing =
    settings.audio === 'youtube' && audio === 'off'
      ? 'Esta canción no tiene YouTube: suena sin audio.'
      : settings.audio === 'mp3' && audio === 'off'
        ? 'Esta canción no tiene MP3: suena sin audio.'
        : null
  const bpm = impliedBpm(timeline)
  const perLine = timeline.weighs === 'lines' ? (timeline.unitMs / 1000).toFixed(1).replace('.', ',') : null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Ajustes de reproducción"
      className="max-h-[calc(100svh-14rem)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold">Reproducción</p>
        <p className="text-sm text-muted-foreground tabular-nums">{basisText(timeline)}</p>
      </div>
      <p className="mb-4 text-sm leading-snug text-muted-foreground">
        Avanza sola por las partes de esta vista. Elegir una parte a mano la para.
        {!playback.playing && startLabel ? (
          <>
            {' '}
            Empieza en <span className="font-medium text-foreground">{startLabel}</span>.
          </>
        ) : null}
      </p>

      <Field label="Audio">
        <Segmented
          label="Audio"
          value={audio}
          onChange={(next) => onSettings({ audio: next })}
          options={[
            { value: 'off', label: 'Sin audio', title: 'Solo avanza la cifra, en silencio.' },
            {
              value: 'youtube',
              label: 'YouTube',
              disabled: !media.youtubeId,
              title: media.youtubeId ? 'Suena el video de YouTube, al mismo reloj.' : 'Esta canción no tiene YouTube.',
            },
            {
              value: 'mp3',
              label: 'MP3',
              disabled: !media.audioUrl,
              title: media.audioUrl ? 'Suena el MP3 de la canción, al mismo reloj.' : 'Esta canción no tiene MP3.',
            },
          ]}
        />
      </Field>
      {missing && <Note>{missing}</Note>}
      {media.options.length > 1 && onPickSource ? (
        <Field label="Fuente">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Video que manda en la reproducción"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              value={media.activeKey ?? ''}
              onChange={(event) => {
                const option = media.options.find((item) => item.key === event.target.value)
                if (option) onPickSource(option.url)
              }}
            >
              {media.options.map((option, index) => (
                <option key={option.key} value={option.key}>
                  {optionLabel(option, index)}
                  {option.selected ? ' · principal' : ''}
                  {option.audioUrl ? ' · MP3' : ''}
                </option>
              ))}
            </select>
            {onMakeSelected &&
            media.options.some((item) => item.key === media.activeKey && !item.selected) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={makingSelected}
                title="Guarda este video como el principal de la canción."
                onClick={() => {
                  const active = media.options.find((item) => item.key === media.activeKey)
                  if (active) onMakeSelected(active.url)
                }}
              >
                {makingSelected ? <Loader2 className="animate-spin" /> : null}
                Principal
              </Button>
            ) : null}
          </div>
        </Field>
      ) : null}

      <Field label="Ritmo">
        <Segmented
          label="Ritmo"
          value={settings.pace}
          onChange={(pace) => onSettings({ pace })}
          options={[
            {
              value: 'duration',
              label: 'Duración',
              disabled: !hasLength,
              title: hasLength
                ? 'Reparte la duración (o las marcas) entre las partes, según líneas y repeticiones.'
                : 'Esta canción no tiene duración todavía.',
            },
            {
              value: 'tempo',
              label: 'Pulso',
              title: 'Tempo fijo: cada línea dura sus compases al BPM (72 si no hay). No usa la duración ni las marcas.',
            },
          ]}
        />
      </Field>
      {fellBack && <Note>Sin duración: avanza a pulso.</Note>}
      {onDurationChange && (
        <Field label="Duración">
          <Input
            aria-label="Duración en minutos y segundos"
            value={durationDraft}
            onChange={(event) => setDurationDraft(event.target.value)}
            onBlur={commitDuration}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitDuration()
              }
            }}
            placeholder="4:00"
            inputMode="numeric"
            className="h-8 w-20 text-center tabular-nums"
            title={canEditDuration ? 'Duración de la canción (m:ss). Se guarda en la canción.' : 'Duración (m:ss), solo esta vez.'}
          />
        </Field>
      )}
      <Note>{bpm ? `Ritmo calculado ≈ ${bpm} BPM` : perLine ? `≈ ${perLine} s por línea` : null}</Note>

      <Field label="BPM">
        <Toggle
          on={settings.useBpm && Boolean(media.bpm)}
          disabled={!media.bpm}
          onClick={() => onSettings({ useBpm: !settings.useBpm })}
          title={
            media.bpm
              ? 'Usa el BPM para medir cada línea en compases y marcar el pulso.'
              : 'Esta canción no tiene BPM todavía.'
          }
        >
          {media.bpm ? `Usar ${media.bpm} BPM` : 'Sin BPM'}
        </Toggle>
      </Field>

      <Field label="Resaltar">
        <Toggle
          on={settings.highlights}
          onClick={() => onSettings({ highlights: !settings.highlights })}
          title="Ilumina la línea y el acorde que van sonando."
        >
          Línea y acorde
        </Toggle>
      </Field>

      {tune && audio === 'mp3' && <TuneSection tune={tune} playback={playback} />}

      <div className="mt-4 border-t pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Esta canción</p>
        {audio !== 'off' ? (
          <>
            <Field label="Entrada" title="Lo que suena antes de la primera parte. − y + la ajustan ¼ s.">
              <Stepper
                label="Entrada"
                value={formatLead(sync.leadMs)}
                onStep={(sign) => sync.onLead(sync.leadMs + sign * NUDGE_MS)}
                canDown
                canUp
              />
            </Field>
            <Field label="Partes medidas">
              <span className="flex items-center gap-1.5">
                <span className="text-xs tabular-nums">
                  {marks.measured}/{marks.total}
                </span>
                {marks.canMark && (
                  <SmallButton
                    onClick={marks.onStart}
                    title="Suena el audio desde el inicio. Toca al empezar cada parte y se guarda lo que dura."
                  >
                    Marcar partes
                  </SmallButton>
                )}
                {sync.canSave && (marks.measured > 0 || marks.stale) && (
                  <SmallButton onClick={marks.onClear} title="Borra las marcas guardadas de este audio.">
                    Borrar
                  </SmallButton>
                )}
              </span>
            </Field>
            {marks.stale && <Note>Las marcas eran de otro video.</Note>}
          </>
        ) : (
          <Field label="Velocidad" title="Sin audio: acelera o frena la cifra para seguir a la banda.">
            <Stepper
              label="Velocidad"
              value={`×${sync.speed.toFixed(2).replace('.', ',')}`}
              onStep={(sign) => sync.onSpeed(Math.min(SPEED_MAX, Math.max(SPEED_MIN, sync.speed + sign * SPEED_STEP)))}
              canDown={sync.speed > SPEED_MIN + 0.001}
              canUp={sync.speed < SPEED_MAX - 0.001}
            />
          </Field>
        )}
        {sync.dirty &&
          (sync.canSave ? (
            <button
              type="button"
              onClick={sync.onSave}
              className="mt-1 min-h-10 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Guardar en la canción
            </button>
          ) : (
            <Note>Solo esta vez.</Note>
          ))}
      </div>

      {playback.error && <p className="mt-2 text-sm text-destructive">{playback.error}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Kbd>P</Kbd> reproduce o para · <Kbd>⇧←</Kbd>
        <Kbd>⇧→</Kbd> estamos aquí · <Kbd>−</Kbd>
        <Kbd>+</Kbd> entrada
      </p>
    </div>
  )
}

function TuneSection({ tune, playback }: { tune: Tune; playback: Playback }) {
  const { analysis } = tune
  const mediaTime = playback.mediaTime
  const time = useFrameTime(() => mediaTime() ?? 0, playback.playing, 80) ?? 0
  return (
    <div className="mt-4 border-t pt-4">
      <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Compás y onda</p>
      {analysis ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border bg-muted/30 p-2">
            <Waveform
              peaks={analysis.peaks}
              durationMs={analysis.durationMs}
              timeMs={time}
              grid={tune.grid ?? analysis.grid}
              marks={tune.marks}
              height={72}
            />
            <p className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatClock(time)}</span>
              <span>{formatClock(analysis.durationMs)}</span>
            </p>
          </div>
          <AnalysisSummary
            analysis={analysis}
            bpm={tune.bpm}
            durationMs={tune.durationMs}
            onBpm={tune.canEdit ? tune.onBpm : undefined}
            onDuration={tune.canEdit ? tune.onDuration : undefined}
            onRetempo={tune.onRetempo}
          />
          {tune.proposal ? (
            <>
              <p className="text-sm text-muted-foreground">
                Propuesta: {tune.proposal.bars.join(' + ')} compases
                {tune.proposal.quality < 0.4 ? ' · los cortes no se ven claros, revisa al escuchar' : ''}. Dale a reproducir
                para probarla.
              </p>
              <span className="flex flex-wrap items-center gap-2">
                {tune.canEdit ? (
                  <SmallButton primary onClick={tune.onSave} title="Guarda los compases, la entrada y el largo de cada parte en la canción.">
                    Guardar alineación
                  </SmallButton>
                ) : (
                  <Note>Solo esta vez.</Note>
                )}
                <SmallButton onClick={tune.onDiscard} title="Vuelve a lo que tenía la canción.">
                  Descartar
                </SmallButton>
              </span>
            </>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <SmallButton
                disabled={tune.running}
                onClick={tune.onAlign}
                title="Corta las partes en los compases donde cambia el sonido y alinea la entrada."
              >
                {tune.grid ? 'Volver a alinear' : 'Alinear partes'}
              </SmallButton>
              {tune.grid && <span className="text-xs text-muted-foreground">Compases guardados</span>}
            </span>
          )}
        </div>
      ) : (
        <span className="flex items-center gap-2">
          <SmallButton
            disabled={tune.running}
            onClick={tune.onAnalyze}
            title="Lee el audio: onda, BPM, compases y duración real. Se hace en tu navegador."
          >
            {tune.running ? `Analizando ${Math.round(tune.progress * 100)} %` : 'Analizar audio'}
          </SmallButton>
          <span className="text-xs text-muted-foreground">Se hace aquí, sin enviar nada.</span>
        </span>
      )}
      {tune.error && <p className="mt-2 text-sm text-destructive">{tune.error}</p>}
    </div>
  )
}

function MarkBar({ marks }: { marks: Marks }) {
  const state = marks.state!
  const done = state.starts.length
  if (state.phase === 'review') {
    return (
      <div className="w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-3 text-sm shadow-lg" role="group" aria-label="Marcas">
        <p className="font-semibold">
          {done} {done === 1 ? 'parte medida' : 'partes medidas'}
          {done > 0 && <span className="font-normal text-muted-foreground"> · Entrada {formatLead(state.starts[0]!)}</span>}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <SmallButton onClick={marks.onDiscard} title="Olvida estas marcas.">
            Descartar
          </SmallButton>
          <SmallButton primary disabled={done === 0} onClick={marks.onSave} title="Guarda lo que dura cada parte.">
            Guardar
          </SmallButton>
        </div>
      </div>
    )
  }
  return (
    <div className="w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border border-destructive/50 bg-popover p-3 text-sm shadow-lg" role="group" aria-label="Marcando partes">
      <p className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Marcando partes</span>
        <span className="tabular-nums">
          {done}/{marks.total}
        </span>
      </p>
      <p className="mt-1 text-base">
        {marks.nextLabel ? (
          <>
            Toca al empezar: <span className="font-semibold">{marks.nextLabel}</span>
          </>
        ) : (
          'Toca al terminar la canción'
        )}
      </p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Kbd>M</Kbd> o <Kbd>→</Kbd> marca · <Kbd>←</Kbd> deshace
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <SmallButton disabled={done === 0 && state.endMs == null} onClick={marks.onUndo} title="Quita la última marca.">
          Deshacer
        </SmallButton>
        <SmallButton primary onClick={marks.onDone} title="Para y revisa las marcas.">
          Listo
        </SmallButton>
      </div>
    </div>
  )
}

/** Progress toward the next part or pass: the change is coming. */
function CueRing({ elapsed, cues, totalMs }: { elapsed: () => number; cues: Cue[]; totalMs: number }) {
  const t = useFrameTime(elapsed, true, 100) ?? 0
  const index = cueIndexAt(cues, t)
  const from = index < 0 ? 0 : cues[index]!.at
  const to = cues[index + 1]?.at ?? totalMs
  const fraction = index < 0 || to <= from ? 0 : Math.min(1, Math.max(0, (t - from) / (to - from)))
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
      <circle cx="32" cy="32" r={RING_R} fill="none" strokeWidth="3" className="stroke-muted-foreground/25" />
      <circle
        cx="32"
        cy="32"
        r={RING_R}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - fraction)}
        className="stroke-primary"
      />
    </svg>
  )
}

function PlaybackClock({
  playback,
  timeline,
  marking,
  grid,
}: {
  playback: Playback
  timeline: Timeline
  marking: boolean
  grid: BeatGrid | null
}) {
  const [now, setNow] = useState(() => ({ second: 0, beat: false, down: false }))
  const { elapsed, mediaTime } = playback
  // With a measured grid the pulse follows the audio's real beats; otherwise the song's BPM.
  const beatMs = grid && !marking ? 60_000 / grid.bpm : timeline.bpm && !marking ? 60_000 / timeline.bpm : 0

  useEffect(() => {
    let frame = 0
    const step = () => {
      const t = marking ? (mediaTime() ?? elapsed()) : elapsed()
      // Count the intro down in whole seconds: −0:04, −0:03…
      const second = t < 0 ? -Math.ceil(-t / 1000) : Math.floor(t / 1000)
      let beat = beatMs > 0 && t >= 0 && t % beatMs < Math.min(140, beatMs / 3)
      let down = false
      const media = grid && !marking ? mediaTime() : null
      if (grid && media != null) {
        const at = beatAt(grid, media)
        beat = media >= 0 && at.since < Math.min(140, beatMs / 3)
        down = beat && at.downbeat
      }
      setNow((prev) => (prev.second === second && prev.beat === beat && prev.down === down ? prev : { second, beat, down }))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [beatMs, elapsed, grid, marking, mediaTime])

  return (
    <span
      className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-base font-semibold shadow-md tabular-nums"
      aria-label="Tiempo de reproducción"
      role="timer"
    >
      {beatMs > 0 && (
        <span
          aria-hidden
          className={cn(
            'rounded-full transition-all duration-75 motion-reduce:transition-none',
            now.down ? 'size-3' : 'size-2',
            now.beat ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        />
      )}
      {formatClock(now.second * 1000)}
      {!marking && <span className="font-normal text-muted-foreground">/ {formatClock(timeline.totalMs)}</span>}
    </span>
  )
}

function basisText(timeline: Timeline): string {
  const total = formatClock(timeline.totalMs)
  if (timeline.basis === 'marks') {
    return timeline.measured === timeline.blocks.length
      ? `${total} · marcas`
      : `${total} · ${timeline.measured}/${timeline.blocks.length} medidas`
  }
  if (timeline.basis === 'media') return `${total} del audio`
  if (timeline.basis === 'duration') return timeline.bpm ? `${total} · ${timeline.bpm} BPM` : total
  if (timeline.basis === 'bpm') return `≈ ${total} · ${timeline.bpm} BPM`
  return `≈ ${total}`
}

function optionLabel(option: MediaOption, index: number): string {
  const name = option.label.trim()
  if (!name || /^youtube$/i.test(name)) return `YouTube ${index + 1}`
  return `${index + 1}. ${name}`
}

function Field({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-10 items-center justify-between gap-3" title={title}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="-mt-1 mb-3 text-right text-xs text-muted-foreground">{children}</p>
}

function SmallButton({
  onClick,
  title,
  primary,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  primary?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium disabled:opacity-40',
        primary ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Stepper({
  label,
  value,
  onStep,
  canDown,
  canUp,
}: {
  label: string
  value: string
  onStep: (sign: -1 | 1) => void
  canDown: boolean
  canUp: boolean
}) {
  const step = 'relative inline-flex size-10 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-0.5 after:content-[""] hover:text-foreground disabled:opacity-40'
  return (
    <span className="inline-flex items-center rounded-full border" role="group" aria-label={label}>
      <button type="button" className={step} aria-label={`Menos ${label.toLowerCase()}`} disabled={!canDown} onClick={() => onStep(-1)}>
        <Minus className="size-4" />
      </button>
      <span className="min-w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={step} aria-label={`Más ${label.toLowerCase()}`} disabled={!canUp} onClick={() => onStep(1)}>
        <Plus className="size-4" />
      </button>
    </span>
  )
}

function Toggle({
  on,
  disabled,
  onClick,
  title,
  children,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium disabled:opacity-50',
        on ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; title: string; disabled?: boolean }[]
}) {
  return (
    <span className="inline-flex rounded-full border p-0.5" role="group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-9 rounded-full px-3.5 py-1.5 text-sm font-medium disabled:opacity-40',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </span>
  )
}
