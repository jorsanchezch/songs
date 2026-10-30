import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { AudioUploadField, BpmField, FieldBlock } from '@/components/SongMediaFields'
import { Button } from '@/components/ui/button'
import { DurationInput } from '@/components/ui/duration-input'
import { Input } from '@/components/ui/input'
import { extractYoutubeAudio, fetchYoutubeInfo, lookupSongMedia } from '@/lib/api'
import { youtubeVideoId } from '@/lib/playback'
import {
  YOUTUBE_LABEL,
  formatDurationMmSs,
  isYoutubeEntry,
  removeSourceEntry,
  selectYoutubeSource,
} from '@/lib/songMedia'
import type { Song, SongSource } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  songId: string
  draft: Song
  onChange: (song: Song) => void
  onSearchStatus?: (text: string) => void
}

/** Probe duration with a hidden muted IFrame YouTube player (no API key). */
export function probeYoutubeDuration(videoId: string, timeoutMs = 12_000): Promise<number | null> {
  if (typeof window === 'undefined' || !videoId) return Promise.resolve(null)
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:0'
    document.body.appendChild(host)
    let done = false
    const finish = (ms: number | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      window.clearInterval(poll)
      try {
        player?.destroy?.()
      } catch {
        /* ignore */
      }
      host.remove()
      resolve(ms)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null
    const poll = window.setInterval(() => {
      try {
        const duration = player?.getDuration?.()
        if (typeof duration === 'number' && duration > 0) finish(Math.round(duration * 1000))
      } catch {
        /* ignore */
      }
    }, 300)

    const boot = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT
      if (!YT?.Player) {
        window.setTimeout(boot, 200)
        return
      }
      player = new YT.Player(host, {
        width: 1,
        height: 1,
        videoId,
        playerVars: { autoplay: 0, mute: 1, controls: 0, playsinline: 1 },
        events: {
          onReady: () => {
            try {
              player.mute?.()
              const duration = player.getDuration?.()
              if (typeof duration === 'number' && duration > 0) finish(Math.round(duration * 1000))
            } catch {
              /* wait for poll */
            }
          },
          onError: () => finish(null),
        },
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) boot()
    else {
      const existing = document.querySelector('script[data-youtube-api]')
      if (!existing) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        script.async = true
        script.dataset.youtubeApi = '1'
        document.head.appendChild(script)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev()
        boot()
      }
      window.setTimeout(boot, 400)
    }
  })
}

export function SongMediaEditor({ songId, draft, onChange, onSearchStatus }: Props) {
  const latest = useRef(draft)
  latest.current = draft
  const [busyUrl, setBusyUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [note, setNote] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => setNote(''), [draft.id])

  const commit = (next: Song) => {
    latest.current = next
    onChange(next)
  }

  const youtubeRows = draft.sources
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isYoutubeEntry(entry))

  const top = {
    bpm: draft.bpm ?? null,
    durationMs: draft.durationMs ?? null,
    audioUrl: draft.audioUrl ?? '',
  }

  const setSources = (entries: SongSource[], media = top) => {
    commit({
      ...latest.current,
      sources: entries,
      source: entries[0]?.url ?? '',
      bpm: media.bpm,
      durationMs: media.durationMs,
      audioUrl: media.audioUrl,
    })
  }

  const addBlank = () => {
    const sources = [...latest.current.sources, { url: '', label: YOUTUBE_LABEL }]
    setSources(sources)
  }

  const updateRow = (index: number, patch: Partial<SongSource>) => {
    const current = latest.current
    const entry = current.sources[index]
    if (!entry) return
    const nextUrl = patch.url !== undefined ? patch.url : entry.url
    const videoChanged =
      patch.url !== undefined && youtubeVideoId(patch.url) !== youtubeVideoId(entry.url)
    const sources = current.sources.map((item, entryIndex) =>
      entryIndex === index
        ? {
            ...item,
            ...patch,
            videoId: youtubeVideoId(nextUrl) ?? undefined,
            ...(videoChanged ? { audioUrl: undefined } : null),
          }
        : item,
    )
    const selected = entry.selected || youtubeRows[0]?.index === index
    if (videoChanged && selected) {
      setSources(sources, { ...top, audioUrl: '' })
      void lookupVideo(index, nextUrl)
      return
    }
    if (videoChanged) {
      setSources(sources)
      void lookupVideo(index, nextUrl)
      return
    }
    setSources(sources)
  }

  const makePrincipal = (index: number) => {
    const selected = selectYoutubeSource(latest.current.sources, top, index)
    setSources(selected.entries, selected.top)
    const name = selected.entries[index]?.label || 'YouTube'
    setNote(`Principal: ${name}. El MP3, la duración y el BPM siguen a este video.`)
    if (selected.needsDuration) void lookupVideo(index, selected.entries[index]?.url ?? '')
  }

  const removeRow = (index: number) => {
    const removed = removeSourceEntry(latest.current.sources, top, index)
    setSources(removed.entries, removed.top)
  }

  const lookupVideo = async (index: number, url: string) => {
    const id = youtubeVideoId(url)
    if (!id) return
    setBusyUrl(url)
    try {
      let durationMs: number | null = null
      let bpm: number | null = null
      let title = ''
      try {
        const info = await fetchYoutubeInfo(url)
        durationMs = info.durationMs
        bpm = info.bpm
        title = info.title
      } catch {
        /* fall through to probe */
      }
      if (durationMs == null || !(durationMs > 0)) {
        durationMs = await probeYoutubeDuration(id)
      }
      const current = latest.current
      const entry = current.sources[index]
      if (!entry || youtubeVideoId(entry.url) !== id) return
      const selectedIndex = current.sources.findIndex((item) => item.selected && isYoutubeEntry(item))
      const isSelected =
        (selectedIndex >= 0 ? selectedIndex : current.sources.findIndex((item) => isYoutubeEntry(item))) === index
      if (isSelected) {
        commit({
          ...current,
          durationMs: durationMs ?? current.durationMs,
          bpm: current.bpm ?? bpm,
        })
      } else {
        const sources = current.sources.map((item, entryIndex) =>
          entryIndex === index
            ? {
                ...item,
                durationMs: durationMs ?? item.durationMs,
                bpm: item.bpm ?? bpm,
              }
            : item,
        )
        setSources(sources)
      }
      if (title) setNote(title)
    } finally {
      setBusyUrl('')
    }
  }

  const searchByTitle = () => {
    const title = latest.current.title.trim()
    if (!title) return
    setSearching(true)
    onSearchStatus?.('')
    void lookupSongMedia(title, latest.current.artist.trim()).then(
      ({ media }) => {
        setSearching(false)
        if (!media) {
          onSearchStatus?.('Sin resultado.')
          return
        }
        const current = latest.current
        const sources = [...current.sources]
        const existing = sources.findIndex(
          (item) => isYoutubeEntry(item) && youtubeVideoId(item.url) === youtubeVideoId(media.youtubeUrl),
        )
        if (existing < 0) {
          const hasYt = sources.some((item) => isYoutubeEntry(item))
          sources.push({
            url: media.youtubeUrl,
            label: YOUTUBE_LABEL,
            selected: !hasYt,
            videoId: youtubeVideoId(media.youtubeUrl) ?? undefined,
          })
        }
        const selected = selectYoutubeSource(
          sources,
          {
            bpm: current.bpm ?? null,
            durationMs: current.durationMs ?? null,
            audioUrl: current.audioUrl ?? '',
          },
          sources.findIndex((item) => youtubeVideoId(item.url) === youtubeVideoId(media.youtubeUrl)),
        )
        // Prefer keeping existing top media; fill gaps from search.
        setSources(selected.entries, {
          bpm: current.bpm ?? media.bpm ?? selected.top.bpm,
          durationMs: current.durationMs ?? media.durationMs ?? selected.top.durationMs,
          audioUrl: selected.top.audioUrl || current.audioUrl || '',
        })
        onSearchStatus?.(media.videoTitle ? `Encontrado: ${media.videoTitle}` : 'Encontrado.')
      },
      (reason) => {
        setSearching(false)
        onSearchStatus?.(reason instanceof Error ? reason.message : 'No se pudo buscar.')
      },
    )
  }

  const attachAudio = (videoId: string | null | undefined, audioUrl: string) => {
    const current = latest.current
    if (!videoId) {
      commit({ ...current, audioUrl })
      return
    }
    const index = current.sources.findIndex((item) => youtubeVideoId(item.url) === videoId)
    const selectedIndex = current.sources.findIndex((item) => item.selected && isYoutubeEntry(item))
    const active =
      selectedIndex >= 0 ? selectedIndex : current.sources.findIndex((item) => isYoutubeEntry(item))
    if (index < 0 || index === active) {
      commit({ ...current, audioUrl })
      return
    }
    const sources = current.sources.map((item, entryIndex) =>
      entryIndex === index ? { ...item, audioUrl } : item,
    )
    setSources(sources)
  }

  const extractMp3 = async () => {
    const selected =
      draft.sources.find((item) => item.selected && isYoutubeEntry(item)) ||
      draft.sources.find((item) => isYoutubeEntry(item))
    if (!selected?.url) return
    setExtracting(true)
    setNote('')
    try {
      const result = await extractYoutubeAudio(selected.url, songId || undefined)
      if (result.blocked || result.error) {
        setNote(result.error || 'Extracción no disponible en este servidor.')
        return
      }
      attachAudio(youtubeVideoId(selected.url), result.audioUrl)
      setNote('MP3 extraído y guardado con el video principal.')
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'No pude extraer el MP3.')
    } finally {
      setExtracting(false)
    }
  }

  const selected =
    draft.sources.find((item) => item.selected && isYoutubeEntry(item)) ||
    draft.sources.find((item) => isYoutubeEntry(item))

  return (
    <section className="sm:col-span-2 flex flex-col gap-3" aria-label="YouTube y medios">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">YouTube y medios</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={searching || !draft.title.trim()}
            title={draft.title.trim() ? 'Busca un vídeo por título y artista.' : 'Escribe el título primero.'}
            onClick={searchByTitle}
          >
            {searching ? <Loader2 className="animate-spin" /> : null}
            Buscar
          </Button>
          <Button type="button" size="sm" variant="outline" title="Agrega otro enlace de YouTube." onClick={addBlank}>
            <Plus /> YouTube
          </Button>
        </div>
      </div>

      {youtubeRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aún no hay videos. Usa Buscar o agrega un enlace. El principal manda la duración, el BPM y el MP3.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {youtubeRows.map(({ entry, index }, row) => {
          const id = youtubeVideoId(entry.url)
          const invalid = Boolean(entry.url.trim()) && !id
          const isPrincipal = Boolean(entry.selected) || (youtubeRows.length === 1 && row === 0)
          const summary = isPrincipal
            ? [
                draft.durationMs ? formatDurationMmSs(draft.durationMs) : null,
                draft.bpm ? `${draft.bpm} BPM` : null,
                draft.audioUrl ? 'MP3' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : [
                entry.durationMs ? formatDurationMmSs(entry.durationMs) : null,
                entry.bpm ? `${entry.bpm} BPM` : null,
                entry.audioUrl ? 'MP3' : null,
              ]
                .filter(Boolean)
                .join(' · ')
          return (
            <li key={`yt-${index}`} className="rounded-md border bg-card/40 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {isPrincipal ? (
                  <span className="text-xs font-semibold text-primary">Principal</span>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => makePrincipal(index)}>
                    Elegir
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {busyUrl === entry.url ? 'Leyendo…' : summary ? `Guardado con este video: ${summary}` : 'Sin duración todavía.'}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  aria-label="Quitar YouTube"
                  onClick={() => removeRow(index)}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                <Input
                  value={entry.url}
                  onChange={(event) => updateRow(index, { url: event.target.value })}
                  placeholder="https://www.youtube.com/watch?v=…"
                  inputMode="url"
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && 'border-destructive')}
                />
                <Input
                  value={entry.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  placeholder="YouTube, en vivo…"
                  aria-label="Etiqueta del video"
                />
              </div>
              {id ? (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block"
                  title="Abre el vídeo en YouTube."
                >
                  <img
                    src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="h-12 w-[5.33rem] rounded border object-cover"
                  />
                </a>
              ) : null}
              {invalid ? <p className="mt-1 text-xs text-destructive">No es un enlace de YouTube válido.</p> : null}
            </li>
          )
        })}
      </ul>

      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <BpmField
          value={draft.bpm ?? null}
          onChange={(bpm) => commit({ ...latest.current, bpm })}
        />
        <FieldBlock label="Duración (m:ss)" htmlFor="editor-duration">
          <DurationInput
            id="editor-duration"
            aria-label="Duración en minutos y segundos"
            value={draft.durationMs}
            onChange={(durationMs) => commit({ ...latest.current, durationMs })}
            title="Duración del video principal (m:ss). Sirve para el modo Duración."
          />
        </FieldBlock>
      </div>

      <div className="flex flex-col gap-2">
        <AudioUploadField
          songId={songId}
          audioUrl={draft.audioUrl ?? ''}
          onAudioUrl={(audioUrl) => attachAudio(youtubeVideoId(selected?.url ?? ''), audioUrl)}
          bpm={draft.bpm ?? null}
          durationMs={draft.durationMs ?? null}
          onBpm={(bpm) => commit({ ...latest.current, bpm })}
          onDuration={(durationMs) => commit({ ...latest.current, durationMs })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={extracting || !selected?.url}
            title="Extrae el audio del video principal con yt-dlp (solo Node)."
            onClick={() => void extractMp3()}
          >
            {extracting ? <Loader2 className="animate-spin" /> : null}
            Extraer MP3
          </Button>
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        </div>
      </div>
    </section>
  )
}
