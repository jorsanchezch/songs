import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Play, SlidersHorizontal, Square } from 'lucide-react'
import { Kbd } from '@/components/KeyHint'
import type { Playback } from '@/hooks/usePlayback'
import {
  formatClock,
  type PlaybackAudio,
  type PlaybackSettings,
  type SongMediaSources,
  type Timeline,
} from '@/lib/playback'
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
}) {
  // Hover opens the panel for a mouse; the settings button pins it for touch and keyboard.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const closeTimer = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)

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
  const hasLength = Boolean(media.durationMs || playback.mediaMs)

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
          className="w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-semibold">Reproducción</p>
            <p className="text-xs text-muted-foreground tabular-nums">{basisText(timeline)}</p>
          </div>
          <p className="mb-3 text-xs leading-snug text-muted-foreground">
            Avanza solo por las partes de esta vista, sin sonido salvo que elijas audio. Elegir una parte a mano la para.
            {!playing && startLabel ? (
              <>
                {' '}
                Empieza en <span className="font-medium text-foreground">{startLabel}</span>.
              </>
            ) : null}
          </p>

          <Field label="Ritmo">
            <Segmented
              value={hasLength ? settings.pace : 'parts'}
              onChange={(pace) => onSettings({ pace })}
              options={[
                {
                  value: 'duration',
                  label: 'Duración',
                  disabled: !hasLength,
                  title: hasLength
                    ? 'Reparte la duración de la canción entre las partes, según líneas y repeticiones.'
                    : 'Esta canción no tiene duración todavía.',
                },
                {
                  value: 'parts',
                  label: 'Partes',
                  title: 'Cada línea dura lo mismo (o sus compases, con BPM). No usa la duración.',
                },
              ]}
            />
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
          className="aspect-video w-56 overflow-hidden rounded-lg border bg-black shadow-lg sm:w-64 [&_iframe]:size-full"
        />
      )}

      <div className="flex items-center gap-2">
        {playing && <PlaybackClock playback={playback} timeline={timeline} />}
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
          aria-label="Ajustes de reproducción"
          aria-expanded={open}
          title="Ajustes de reproducción"
          onClick={() => {
            if (pinned) setHovered(false)
            setPinned(!pinned)
          }}
        >
          <SlidersHorizontal className="size-4" />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Parar la reproducción' : `Reproducir desde ${startLabel || 'el inicio'}`}
          aria-pressed={playing}
          aria-keyshortcuts="P"
          title={playing ? 'Parar' : 'Reproducir'}
          onClick={onToggle}
          className={cn(
            'relative inline-flex size-14 items-center justify-center rounded-full shadow-lg ring-offset-2 ring-offset-background transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none motion-reduce:transition-none',
            playing ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {status === 'loading' ? (
            <Loader2 className="size-6 animate-spin" />
          ) : playing ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Play className="ml-0.5 size-6 fill-current" />
          )}
        </button>
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
      className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold shadow-md tabular-nums"
      aria-label="Tiempo de reproducción"
      role="timer"
    >
      {beatMs > 0 && (
        <span
          aria-hidden
          className={cn('size-2 rounded-full transition-colors duration-75', now.beat ? 'bg-primary' : 'bg-muted-foreground/30')}
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
    <div className="mb-2 flex items-center justify-between gap-3">
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
        'rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50',
        on ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
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
    <span className="inline-flex rounded-full border p-0.5" role="group">
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
