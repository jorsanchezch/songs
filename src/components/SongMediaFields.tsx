import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Pause, Play, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Stepper } from '@/components/ui/stepper'
import { uploadAudioFile } from '@/lib/api'
import { songMediaSources, youtubeVideoId } from '@/lib/playback'
import { isAudioUrl } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

export const BPM_MIN = 40
export const BPM_MAX = 240

/** Label on top, then the controls. A div, so buttons inside don't steal the label. */
export function FieldBlock({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1 text-sm font-medium', className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}

export function YoutubeField({
  value,
  onChange,
  onSearch,
  searching,
  canSearch,
  status,
}: {
  value: string
  onChange: (url: string) => void
  onSearch: () => void
  searching: boolean
  canSearch: boolean
  status: string
}) {
  const id = youtubeVideoId(value)
  const invalid = Boolean(value.trim()) && !id
  return (
    <FieldBlock label="YouTube" htmlFor="editor-youtube">
      <div className="flex gap-2">
        <Input
          id="editor-youtube"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          inputMode="url"
          aria-invalid={invalid || undefined}
          aria-describedby="editor-youtube-status"
          title="Vídeo de YouTube. Se guarda en sources con etiqueta YouTube."
          className={cn(invalid && 'border-destructive')}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={searching || !canSearch}
          title={canSearch ? 'Busca el vídeo por título y artista.' : 'Escribe el título primero.'}
          onClick={onSearch}
        >
          {searching ? <Loader2 className="animate-spin" /> : <Search />}
          Buscar
        </Button>
      </div>
      <div id="editor-youtube-status" className="flex min-h-0 items-center gap-2 text-xs font-normal" aria-live="polite">
        {id ? (
          <a href={value} target="_blank" rel="noreferrer" className="shrink-0" title="Abre el vídeo en YouTube.">
            <img
              src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
              alt="Miniatura del vídeo"
              loading="lazy"
              className="h-12 w-[5.33rem] rounded border object-cover"
            />
          </a>
        ) : null}
        {invalid ? <span className="text-destructive">No es un enlace de YouTube válido.</span> : null}
        {status ? <span className="min-w-0 text-muted-foreground">{status}</span> : null}
      </div>
    </FieldBlock>
  )
}

/** Average of the last taps; starts over after two quiet seconds. */
function useTapTempo(onBpm: (bpm: number) => void) {
  const taps = useRef<number[]>([])
  const idle = useRef(0)
  const [count, setCount] = useState(0)
  useEffect(() => () => window.clearTimeout(idle.current), [])
  return {
    count,
    tap: () => {
      const now = performance.now()
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => {
        taps.current = []
        setCount(0)
      }, 2000)
      taps.current = [...taps.current, now].slice(-8)
      setCount(taps.current.length)
      if (taps.current.length < 2) return
      const span = taps.current.at(-1)! - taps.current[0]!
      const bpm = Math.round((60_000 * (taps.current.length - 1)) / span)
      onBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)))
    },
  }
}

export function BpmField({ value, onChange }: { value: number | null; onChange: (bpm: number | null) => void }) {
  const { count, tap } = useTapTempo(onChange)
  return (
    <FieldBlock label="BPM">
      <div className="flex items-center gap-2">
        <Stepper
          value={value}
          onChange={onChange}
          min={BPM_MIN}
          max={BPM_MAX}
          start={72}
          label="BPM"
          placeholder="—"
          title="Pulsaciones por minuto, de 40 a 240."
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 min-w-16 tabular-nums"
          title="Toca al ritmo. Promedia los últimos toques y se reinicia tras 2 s quieto."
          aria-label={count ? `Tap tempo, ${count} toques` : 'Tap tempo'}
          onClick={tap}
        >
          Tap{count ? ` ·${count}` : ''}
        </Button>
      </div>
    </FieldBlock>
  )
}

function AudioPreview({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setPlaying(false)
    setFailed(false)
    return () => {
      audio.current?.pause()
      audio.current = null
    }
  }, [url])

  const toggle = () => {
    if (playing) {
      audio.current?.pause()
      return
    }
    if (!audio.current) {
      const src = songMediaSources({ sources: [], audioUrl: url, bpm: null, durationMs: null }).audioUrl
      if (!src) return
      const element = new Audio(src)
      element.onplay = () => setPlaying(true)
      element.onpause = () => setPlaying(false)
      element.onerror = () => {
        setFailed(true)
        setPlaying(false)
      }
      audio.current = element
    }
    setFailed(false)
    void audio.current.play().catch(() => setFailed(true))
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={playing}
        aria-label={playing ? 'Pausar audio' : 'Escuchar audio'}
        title={playing ? 'Pausa la prueba.' : 'Prueba el audio aquí.'}
        onClick={toggle}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      {failed ? <span className="text-xs font-normal text-destructive">No se pudo reproducir.</span> : null}
    </>
  )
}

export function AudioUploadField({
  songId,
  audioUrl,
  onAudioUrl,
}: {
  songId: string
  audioUrl: string
  onAudioUrl: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const valid = isAudioUrl(audioUrl)
  const invalid = Boolean(audioUrl.trim()) && !valid

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const stored = await uploadAudioFile(file, songId || undefined)
      onAudioUrl(stored.audioUrl)
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'No pude subir el MP3.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <FieldBlock label="Audio (MP3)" htmlFor="editor-audio" className="sm:col-span-2">
      <div className="flex gap-2">
        <Input
          id="editor-audio"
          value={audioUrl}
          onChange={(event) => onAudioUrl(event.target.value)}
          placeholder="/api/audio/… o https://…/cancion.mp3"
          inputMode="url"
          aria-invalid={invalid || undefined}
          title="También puedes pegar una URL. Los archivos subidos quedan en R2 vía /api/audio/…"
          className={cn(invalid && 'border-destructive')}
        />
        {valid ? <AudioPreview url={audioUrl} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 font-normal">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/*,.mp3,.m4a,.wav,.ogg"
          className="sr-only"
          aria-label="Subir archivo MP3"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          title="Sube un MP3. Se guarda en R2 (o data/audio en local), no en D1."
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : null}
          {uploading ? 'Subiendo…' : 'Subir MP3'}
        </Button>
        {audioUrl ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onAudioUrl('')} title="Quitar el audio.">
            Quitar
          </Button>
        ) : null}
        {invalid ? (
          <span className="text-xs text-destructive">Usa /api/audio/… o un enlace http(s).</span>
        ) : !audioUrl ? (
          <span className="text-xs text-muted-foreground">Opcional. La reproducción por duración no lo necesita.</span>
        ) : null}
      </div>
      {uploadError ? <p className="text-sm font-normal text-destructive">{uploadError}</p> : null}
    </FieldBlock>
  )
}
