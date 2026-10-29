import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Flag, Loader2, Minus, Play, Plus, SlidersHorizontal, Square, X } from 'lucide-react'
import { Kbd } from '@/components/KeyHint'
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
  type PlaybackAudio,
  type PlaybackSettings,
  type SongMediaSources,
  type Timeline,
} from '@/lib/playback'
import { formatDurationMmSs, parseDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

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
}: {
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
        />
      )}

      {showError && (
        <p
          role="alert"
          className="flex max-w-[min(19rem,calc(100vw-1.5rem))] items-start gap-2 rounded-lg border border-destructive/40 bg-card px-3 py-2 text-xs text-destructive shadow-md"
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
        {playing && <PlaybackClock playback={playback} timeline={timeline} marking={Boolean(marking)} />}
        <div className="relative size-16">
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
              <Flag className="size-6" />
            ) : status === 'loading' ? (
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
            ) : playing ? (
              <Square className="size-5 fill-current" />
            ) : (
              <Play className="ml-0.5 size-6 fill-current" />
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
              className="absolute -top-1 -left-1 inline-flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <SlidersHorizontal className="size-3.5" />
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
}: {
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
      className="max-h-[calc(100svh-14rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-semibold">Reproducción</p>
        <p className="text-xs text-muted-foreground tabular-nums">{basisText(timeline)}</p>
      </div>
      <p className="mb-3 text-xs leading-snug text-muted-foreground">
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

      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Esta canción</p>
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
              className="mt-1 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Guardar en la canción
            </button>
          ) : (
            <Note>Solo esta vez.</Note>
          ))}
      </div>

      {playback.error && <p className="mt-2 text-xs text-destructive">{playback.error}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Kbd>P</Kbd> reproduce o para · <Kbd>⇧←</Kbd>
        <Kbd>⇧→</Kbd> estamos aquí · <Kbd>−</Kbd>
        <Kbd>+</Kbd> entrada
      </p>
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

function PlaybackClock({ playback, timeline, marking }: { playback: Playback; timeline: Timeline; marking: boolean }) {
  const [now, setNow] = useState(() => ({ second: 0, beat: false }))
  const { elapsed, mediaTime } = playback
  const beatMs = timeline.bpm && !marking ? 60_000 / timeline.bpm : 0

  useEffect(() => {
    let frame = 0
    const step = () => {
      const t = marking ? (mediaTime() ?? elapsed()) : elapsed()
      // Count the intro down in whole seconds: −0:04, −0:03…
      const second = t < 0 ? -Math.ceil(-t / 1000) : Math.floor(t / 1000)
      const beat = beatMs > 0 && t >= 0 && t % beatMs < Math.min(140, beatMs / 3)
      setNow((prev) => (prev.second === second && prev.beat === beat ? prev : { second, beat }))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [beatMs, elapsed, marking, mediaTime])

  return (
    <span
      className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold shadow-md tabular-nums"
      aria-label="Tiempo de reproducción"
      role="timer"
    >
      {beatMs > 0 && (
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full transition-colors duration-75 motion-reduce:transition-none',
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

function Field({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3" title={title}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="-mt-1 mb-2 text-right text-[11px] text-muted-foreground">{children}</p>
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
        'rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40',
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
  const step = 'relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-1 after:content-[""] hover:text-foreground disabled:opacity-40'
  return (
    <span className="inline-flex items-center rounded-full border" role="group" aria-label={label}>
      <button type="button" className={step} aria-label={`Menos ${label.toLowerCase()}`} disabled={!canDown} onClick={() => onStep(-1)}>
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-14 text-center text-xs font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={step} aria-label={`Más ${label.toLowerCase()}`} disabled={!canUp} onClick={() => onStep(1)}>
        <Plus className="size-3.5" />
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
        'rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50',
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
              'rounded-full px-2.5 py-0.5 text-xs font-medium disabled:opacity-40',
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
