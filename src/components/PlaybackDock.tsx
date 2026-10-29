import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Play, SlidersHorizontal, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/KeyHint'
import type { Playback } from '@/hooks/usePlayback'
import {
  formatClock,
  type PlaybackAudio,
  type PlaybackSettings,
  type SongMediaSources,
  type Timeline,
} from '@/lib/playback'
import { formatDurationMmSs, parseDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

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
  canEditDuration?: boolean
  /** Persist duration (ms) while playing or from the panel. */
  onDurationChange?: (durationMs: number | null) => void
}) {
  // Hover opens the panel for a mouse; the settings button pins it for touch and keyboard.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const closeTimer = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const [durationDraft, setDurationDraft] = useState(() => formatDurationMmSs(media.durationMs))

  useEffect(() => {
    setDurationDraft(formatDurationMmSs(media.durationMs))
  }, [media.durationMs])

  const openNow = () => {
    window.clearTimeout(closeTimer.current)
    setHovered(true)
  }
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHovered(false), 280)
  }

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setHovered(false)
      setPinned(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const { playing, status } = playback
  // Duration mode uses the song's duration_ms (or a length you set). Audio is optional.
  const hasLength = Boolean(media.durationMs || playback.mediaMs)
  const commitDuration = () => {
    if (!onDurationChange) return
    const next = parseDurationMmSs(durationDraft)
    onDurationChange(next)
  }

  return (
    <div
      ref={rootRef}
      className="fixed right-3 z-30 flex flex-col items-end gap-2 font-sans sm:right-5"
      style={{ bottom }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') openNow()
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') closeSoon()
      }}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Ajustes de reproducción"
          className="w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border bg-card p-3.5 text-sm text-card-foreground shadow-md"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-base font-semibold">Reproducción</p>
            <p className="text-xs text-muted-foreground tabular-nums">{basisText(timeline)}</p>
          </div>
          <p className="mb-3 text-xs leading-snug text-muted-foreground">
            Avanza solo por las partes de esta vista. El modo Duración usa el tiempo de la canción y no necesita
            YouTube ni MP3. Elegir una parte a mano la para.
            {!playing && startLabel ? (
              <>
                {' '}
                Empieza en <span className="font-medium text-foreground">{startLabel}</span>.
              </>
            ) : null}
          </p>

          <Field label="Ritmo">
            <Segmented
              value={hasLength ? settings.pace : settings.pace === 'duration' && !hasLength ? 'parts' : settings.pace}
              onChange={(pace) => onSettings({ pace })}
              options={[
                {
                  value: 'duration',
                  label: 'Duración',
                  disabled: !hasLength,
                  title: hasLength
                    ? 'Reparte la duración de la canción entre las partes. No hace falta audio.'
                    : 'Pon una duración (m:ss) abajo para usar este modo sin audio.',
                },
                {
                  value: 'parts',
                  label: 'Partes',
                  title: 'Cada línea dura lo mismo (o sus compases, con BPM). No usa la duración.',
                },
              ]}
            />
          </Field>

          <Field label="Duración">
            <div className="flex items-center gap-1.5">
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
                disabled={!canEditDuration && !onDurationChange}
                placeholder="4:00"
                inputMode="numeric"
                className="h-8 w-[5.5rem] text-center tabular-nums"
                title={
                  canEditDuration
                    ? 'Edita mientras reproduces. Se guarda en la canción (m:ss).'
                    : 'Duración de la canción (m:ss).'
                }
              />
              {onDurationChange ? (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={commitDuration}>
                  Aplicar
                </Button>
              ) : null}
            </div>
          </Field>

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

          <Field label="Audio">
            <Segmented
              value={audio}
              onChange={(next) => onSettings({ audio: next })}
              options={[
                { value: 'off', label: 'Sin audio', title: 'Solo avanza la cifra, en silencio. Compatible con Duración.' },
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

          <Field label="Resaltar">
            <Toggle
              on={settings.highlights}
              onClick={() => onSettings({ highlights: !settings.highlights })}
              title="Ilumina la línea y el acorde que van sonando."
            >
              Línea y acorde
            </Toggle>
          </Field>

          {playback.error && <p className="mt-2 text-xs text-destructive">{playback.error}</p>}
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Kbd>P</Kbd> reproduce o para
          </p>
        </div>
      )}

      {audio === 'youtube' && (
        <div
          ref={playback.youtubeHost}
          className="aspect-video w-64 overflow-hidden rounded-lg border bg-black shadow-md sm:w-72 [&_iframe]:size-full"
        />
      )}

      <div className="flex items-center gap-2.5">
        {playing && <PlaybackClock playback={playback} timeline={timeline} />}
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-11 rounded-md border bg-card shadow-sm"
          aria-label="Ajustes de reproducción"
          aria-expanded={open}
          title="Ajustes de reproducción"
          onClick={() => {
            if (pinned) setHovered(false)
            setPinned(!pinned)
          }}
        >
          <SlidersHorizontal className="size-5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={playing ? 'secondary' : 'default'}
          aria-label={playing ? 'Parar la reproducción' : `Reproducir desde ${startLabel || 'el inicio'}`}
          aria-pressed={playing}
          aria-keyshortcuts="P"
          title={playing ? 'Parar' : 'Reproducir'}
          onClick={onToggle}
          className={cn(
            'size-16 rounded-md shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/60',
            playing && 'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          {status === 'loading' ? (
            <Loader2 className="size-7 animate-spin" />
          ) : playing ? (
            <Square className="size-6 fill-current" />
          ) : (
            <Play className="ml-0.5 size-7 fill-current" />
          )}
        </Button>
      </div>
    </div>
  )
}

function PlaybackClock({ playback, timeline }: { playback: Playback; timeline: Timeline }) {
  const [now, setNow] = useState(() => ({ second: -1, beat: false }))
  const { elapsed } = playback
  const beatMs = timeline.bpm ? 60_000 / timeline.bpm : 0

  useEffect(() => {
    let frame = 0
    const step = () => {
      const t = elapsed()
      const second = Math.floor(t / 1000)
      const beat = beatMs > 0 && t % beatMs < Math.min(140, beatMs / 3)
      setNow((prev) => (prev.second === second && prev.beat === beat ? prev : { second, beat }))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [beatMs, elapsed])

  return (
    <span
      className="inline-flex h-11 items-center gap-2 rounded-md border bg-card px-3.5 text-base font-semibold shadow-sm tabular-nums"
      aria-label="Tiempo de reproducción"
      role="timer"
    >
      {beatMs > 0 && (
        <span
          aria-hidden
          className={cn('size-2.5 rounded-full transition-colors duration-75', now.beat ? 'bg-primary' : 'bg-muted-foreground/30')}
        />
      )}
      {formatClock(Math.max(0, now.second) * 1000)}
      <span className="font-normal text-muted-foreground">/ {formatClock(timeline.totalMs)}</span>
    </span>
  )
}

function basisText(timeline: Timeline): string {
  const total = formatClock(timeline.totalMs)
  if (timeline.basis === 'media') return `${total} del audio`
  if (timeline.basis === 'duration') return timeline.bpm ? `${total} · ${timeline.bpm} BPM` : total
  if (timeline.basis === 'bpm') return `≈ ${total} · ${timeline.bpm} BPM`
  return `≈ ${total}`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
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
        'rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50',
        on ? 'border-primary bg-primary/15 text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; title: string; disabled?: boolean }[]
}) {
  return (
    <span className="inline-flex rounded-md border bg-card p-0.5" role="group">
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
              'rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40',
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
