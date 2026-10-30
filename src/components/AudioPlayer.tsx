import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AudioWaveform, Loader2, Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { AnalysisSummary } from '@/components/AnalysisSummary'
import { Waveform } from '@/components/Waveform'
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis'
import { Button } from '@/components/ui/button'
import { audioSource } from '@/lib/api'
import { songMediaSources } from '@/lib/playback'
import { formatDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

const SPEEDS = [0.75, 1, 1.25, 1.5]
const SKIP_S = 10

const clock = (seconds: number) => formatDurationMmSs(seconds * 1000) || '0:00'

/** Preview player for a stored MP3: seek bar, skip, speed, loop and volume. Loads only when played. */
export function AudioPlayer({
  url,
  className,
  bpm = null,
  durationMs = null,
  onBpm,
  onDuration,
}: {
  url: string
  className?: string
  /** What the song stores now; with the setters, lets the analysis correct them. */
  bpm?: number | null
  durationMs?: number | null
  onBpm?: (bpm: number) => void
  onDuration?: (ms: number) => void
}) {
  const analysis = useAudioAnalysis(url)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const scrubbing = useRef(false)

  useEffect(() => {
    setState('idle')
    setPlaying(false)
    setTime(0)
    setLength(0)
    return () => {
      audio.current?.pause()
      audio.current = null
    }
  }, [url])

  // timeupdate fires a few times a second; follow the clock every frame for the waveform.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const step = () => {
      const element = audio.current
      if (element && !scrubbing.current) setTime(element.currentTime)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const create = useCallback(async () => {
    const src = songMediaSources({ sources: [], audioUrl: url, bpm: null, durationMs: null }).audioUrl
    if (!src) throw new Error('sin audio')
    const element = new Audio()
    element.preload = 'metadata'
    element.onplay = () => setPlaying(true)
    element.onpause = () => setPlaying(false)
    element.onended = () => setPlaying(false)
    element.onwaiting = () => setState('loading')
    element.oncanplay = () => setState('ready')
    element.onloadedmetadata = () => setLength(Number.isFinite(element.duration) ? element.duration : 0)
    element.ondurationchange = () => setLength(Number.isFinite(element.duration) ? element.duration : 0)
    element.ontimeupdate = () => {
      if (!scrubbing.current) setTime(element.currentTime)
    }
    element.onerror = () => {
      setState('failed')
      setPlaying(false)
    }
    element.loop = loop
    element.volume = volume
    element.muted = muted
    element.playbackRate = speed
    audio.current = element
    element.src = await audioSource(src)
    return element
  }, [url])

  const toggle = async () => {
    try {
      let element = audio.current
      if (!element) {
        setState('loading')
        element = await create()
      }
      if (element.paused) {
        const started = element.play()
        if (!analysis.result && !analysis.running) void analysis.run()
        await started
      } else element.pause()
      setState((now) => (now === 'failed' ? 'ready' : now))
    } catch {
      setState('failed')
    }
  }

  const seek = (seconds: number) => {
    const element = audio.current
    if (!element) return
    const to = Math.min(Math.max(seconds, 0), length || element.duration || seconds)
    element.currentTime = to
    setTime(to)
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') seek(time - 5)
    else if (event.key === 'ArrowRight') seek(time + 5)
    else if (event.key === ' ' && event.target === event.currentTarget) void toggle()
    else return
    event.preventDefault()
  }

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1
    setSpeed(next)
    if (audio.current) audio.current.playbackRate = next
  }

  const ready = Boolean(audio.current) && length > 0
  const loading = state === 'loading'

  return (
    <div
      className={cn('flex flex-col gap-2 rounded-md border bg-muted/30 p-2 font-normal', className)}
      role="group"
      aria-label="Reproductor de audio"
      onKeyDown={onKey}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0 rounded-full"
          aria-pressed={playing}
          aria-label={playing ? 'Pausar audio' : 'Escuchar audio'}
          title={playing ? 'Pausa (espacio).' : 'Prueba el audio aquí (espacio).'}
          onClick={() => void toggle()}
        >
          {loading && !playing ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
        </Button>
        {analysis.result ? (
          <div className="min-w-0 flex-1">
            <Waveform
              peaks={analysis.result.peaks}
              durationMs={analysis.result.durationMs}
              timeMs={time * 1000}
              grid={analysis.result.confidence >= 0.5 ? analysis.result.grid : null}
              height={44}
              onSeek={(ms) => (audio.current ? seek(ms / 1000) : void toggle().then(() => seek(ms / 1000)))}
            />
          </div>
        ) : (
        <input
          type="range"
          min={0}
          max={length || 1}
          step={0.1}
          value={Math.min(time, length || 1)}
          disabled={!ready}
          aria-label="Posición"
          aria-valuetext={`${clock(time)} de ${clock(length)}`}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-50"
          onPointerDown={() => (scrubbing.current = true)}
          onChange={(event) => setTime(Number(event.target.value))}
          onPointerUp={(event) => {
            scrubbing.current = false
            seek(Number((event.target as HTMLInputElement).value))
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => {
            if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
              seek(Number((event.target as HTMLInputElement).value))
            }
          }}
        />
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-hidden>
          {clock(time)} / {length || analysis.result ? clock(length || analysis.result!.durationMs / 1000) : '--:--'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={!ready} aria-label={`Atrasar ${SKIP_S} segundos`} title={`−${SKIP_S} s`} onClick={() => seek(time - SKIP_S)}>
          <RotateCcw />
          {SKIP_S}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!ready} aria-label={`Adelantar ${SKIP_S} segundos`} title={`+${SKIP_S} s`} onClick={() => seek(time + SKIP_S)}>
          {SKIP_S}
          <RotateCw />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-w-14 tabular-nums" aria-label={`Velocidad ${speed}x`} title="Cambia la velocidad." onClick={changeSpeed}>
          {speed}×
        </Button>
        <Button
          type="button"
          size="sm"
          variant={loop ? 'secondary' : 'ghost'}
          aria-pressed={loop}
          aria-label="Repetir"
          title={loop ? 'Repetir: activado.' : 'Repetir la canción.'}
          onClick={() => {
            setLoop(!loop)
            if (audio.current) audio.current.loop = !loop
          }}
        >
          <Repeat />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={analysis.result ? 'secondary' : 'ghost'}
          disabled={analysis.running}
          title="Lee el audio: onda, BPM, compases y duración real."
          onClick={() => void analysis.run()}
        >
          {analysis.running ? <Loader2 className="animate-spin" /> : <AudioWaveform />}
          {analysis.running ? `${Math.round(analysis.progress * 100)} %` : analysis.result ? 'Analizado' : 'Analizar'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={muted}
            aria-label={muted ? 'Quitar silencio' : 'Silenciar'}
            title={muted ? 'Quitar silencio.' : 'Silenciar.'}
            onClick={() => {
              setMuted(!muted)
              if (audio.current) audio.current.muted = !muted
            }}
          >
            {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volumen"
            className="h-1.5 w-20 cursor-pointer accent-primary"
            onChange={(event) => {
              const next = Number(event.target.value)
              setVolume(next)
              setMuted(false)
              if (audio.current) {
                audio.current.volume = next
                audio.current.muted = false
              }
            }}
          />
        </div>
      </div>
      {analysis.result ? (
        <AnalysisSummary
          analysis={analysis.result}
          bpm={bpm}
          durationMs={durationMs}
          onBpm={onBpm}
          onDuration={onDuration}
          onRetempo={onBpm ? (next) => void analysis.run({ bpm: next }) : undefined}
        />
      ) : null}
      {analysis.error ? <span className="text-xs text-destructive">{analysis.error}</span> : null}
      {state === 'failed' ? <span className="text-xs text-destructive">No se pudo reproducir.</span> : null}
    </div>
  )
}
