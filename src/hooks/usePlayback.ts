import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LEAD_MAX_MS,
  locate,
  sameCursor,
  type PlaybackAudio,
  type PlaybackCursor,
  type SongMediaSources,
  type Timeline,
} from '@/lib/playback'

export type PlaybackStatus = 'idle' | 'loading' | 'playing'

/** One audio source the clock can follow. Silent playback has none. */
type MediaClock = {
  play: (fromMs: number) => Promise<void>
  pause: () => void
  timeMs: () => number
  running: () => boolean
  destroy: () => void
}

type MediaEvents = {
  onLength: (ms: number) => void
  onEnded: () => void
  /** The player paused itself, e.g. someone tapped the video. */
  onPaused: () => void
  onError: (message: string) => void
}

const LOADING_HINT_MS = 12_000

/** Playback time rounded to `stepMs`, refreshed every frame while active. */
export function useFrameTime(elapsed: () => number, active: boolean, stepMs: number): number | null {
  const [time, setTime] = useState<number | null>(null)
  useEffect(() => {
    if (!active) {
      setTime(null)
      return
    }
    let frame = 0
    const step = () => {
      const rounded = Math.floor(elapsed() / stepMs) * stepMs
      setTime((prev) => (prev === rounded ? prev : rounded))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active, elapsed, stepMs])
  return time
}

export function usePlayback({
  makeTimeline,
  audio,
  media,
  leadMs = 0,
  speed = 1,
}: {
  /** Builds the timeline; gets the loaded audio's length once known. Keep it stable with useCallback. */
  makeTimeline: (mediaMs: number | null) => Timeline
  audio: PlaybackAudio
  media: SongMediaSources
  /** Media time before the chart's first part; chart time is media time minus this. */
  leadMs?: number
  /** Silent playback only: how fast the chart runs. */
  speed?: number
}) {
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [cursor, setCursor] = useState<PlaybackCursor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedMs, setMediaMs] = useState<number | null>(null)
  const [youtubeHost, setYoutubeHost] = useState<HTMLDivElement | null>(null)
  const mediaMs = audio === 'off' ? null : loadedMs
  const timeline = useMemo(() => makeTimeline(mediaMs), [makeTimeline, mediaMs])

  const timelineRef = useRef(timeline)
  const playingRef = useRef(false)
  const frameRef = useRef(0)
  const mediaRef = useRef<MediaClock | null>(null)
  const silentRef = useRef({ from: 0, at: 0 })
  const anchorRef = useRef({ media: 0, at: 0 })
  const cursorRef = useRef<PlaybackCursor | null>(null)
  const pendingRef = useRef<number | null>(null)
  const leadRef = useRef(leadMs)
  const speedRef = useRef(speed)
  leadRef.current = leadMs

  useLayoutEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  /** Chart time: negative while the audio plays its intro. */
  const elapsed = useCallback((): number => {
    const now = performance.now()
    const clock = mediaRef.current
    if (!clock) {
      const silent = silentRef.current
      return silent.from + (playingRef.current ? (now - silent.at) * speedRef.current : 0)
    }
    // Until the audio really starts, hold the part where play was pressed.
    if (pendingRef.current != null) {
      if (!clock.running()) return pendingRef.current
      pendingRef.current = null
    }
    // Media players report time in steps. Between steps the clock runs on, never far.
    const reported = clock.timeMs()
    const anchor = anchorRef.current
    if (!clock.running() || reported !== anchor.media) {
      anchorRef.current = { media: reported, at: now }
      return reported - leadRef.current
    }
    return anchor.media + Math.min(now - anchor.at, 1000) - leadRef.current
  }, [])

  // A new speed keeps the chart where it is and runs on from there.
  useEffect(() => {
    if (playingRef.current && !mediaRef.current) silentRef.current = { from: elapsed(), at: performance.now() }
    speedRef.current = speed
  }, [elapsed, speed])

  const stop = useCallback(() => {
    playingRef.current = false
    cancelAnimationFrame(frameRef.current)
    mediaRef.current?.pause()
    cursorRef.current = null
    setCursor(null)
    setStatus('idle')
  }, [])

  const stopRef = useRef(stop)
  stopRef.current = stop

  const tick = useCallback(() => {
    if (!playingRef.current) return
    const line = timelineRef.current
    const clock = mediaRef.current
    const t = elapsed()
    if (!clock && t >= line.totalMs) {
      stop()
      return
    }
    if (clock && clock.running()) setStatus((prev) => (prev === 'playing' ? prev : 'playing'))
    // With audio, the last line holds until the audio itself ends; the intro shows no line.
    const next = t < 0 ? null : locate(line, Math.min(t, line.totalMs - 1))
    if (!sameCursor(next, cursorRef.current)) {
      cursorRef.current = next
      setCursor(next)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [elapsed, stop])

  const start = useCallback(
    (fromMs: number) => {
      cancelAnimationFrame(frameRef.current)
      setError(null)
      const from = Math.max(0, Math.min(fromMs, Math.max(0, timelineRef.current.totalMs - 1)))
      playingRef.current = true
      const clock = mediaRef.current
      if (!clock) {
        silentRef.current = { from, at: performance.now() }
        setStatus('playing')
      } else {
        // Playing from the first part plays the intro too.
        const seek = from <= 0 ? 0 : Math.max(0, from + leadRef.current)
        pendingRef.current = seek - leadRef.current
        setStatus('loading')
        clock.play(seek).catch((reason: unknown) => {
          if (!playingRef.current) return
          setError(reason instanceof Error && reason.message ? reason.message : 'No se pudo reproducir el audio.')
          stopRef.current()
        })
      }
      frameRef.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  /** "We are at this moment now." Silent play jumps there; with audio it returns the lead that makes it true. */
  const resync = useCallback(
    (chartMs: number): number | null => {
      const clock = mediaRef.current
      if (!clock) {
        silentRef.current = { from: chartMs, at: performance.now() }
        return null
      }
      // Negative when the recording runs ahead of the chart's estimate.
      const lead = Math.min(LEAD_MAX_MS, Math.max(-LEAD_MAX_MS, elapsed() + leadRef.current - chartMs))
      leadRef.current = lead
      return lead
    },
    [elapsed],
  )

  /** Silent play only: move the chart by `deltaMs`. */
  const shift = useCallback((deltaMs: number) => {
    if (mediaRef.current) return
    silentRef.current = { ...silentRef.current, from: silentRef.current.from + deltaMs }
  }, [])

  const mediaTime = useCallback((): number | null => {
    const clock = mediaRef.current
    return clock ? elapsed() + leadRef.current : null
  }, [elapsed])

  // iOS may refuse to start the video outside the tap; the player is visible, so a tap on it works.
  useEffect(() => {
    if (status !== 'loading') return
    const timer = window.setTimeout(() => setError('El audio no arranca. Toca el video para empezar.'), LOADING_HINT_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const youtubeId = audio === 'youtube' ? media.youtubeId : null
  const audioUrl = audio === 'mp3' ? media.audioUrl : null

  // The chosen audio loads as soon as it is chosen, so its real length is known before play.
  useEffect(() => {
    stopRef.current()
    setError(null)
    setMediaMs(null)
    const events: MediaEvents = {
      onLength: (ms) => setMediaMs((prev) => (prev && Math.abs(prev - ms) < 500 ? prev : Math.round(ms))),
      onEnded: () => stopRef.current(),
      onPaused: () => {
        if (playingRef.current && pendingRef.current == null) stopRef.current()
      },
      onError: (message) => {
        setError(message)
        stopRef.current()
      },
    }
    let clock: MediaClock | null = null
    if (youtubeId && youtubeHost) clock = createYouTubeClock(youtubeHost, youtubeId, events)
    else if (audioUrl) clock = createAudioClock(audioUrl, events)
    mediaRef.current = clock
    return () => {
      clock?.destroy()
      if (mediaRef.current === clock) mediaRef.current = null
    }
  }, [audioUrl, youtubeHost, youtubeId])

  useEffect(
    () => () => {
      playingRef.current = false
      cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  return {
    status,
    playing: status !== 'idle',
    cursor,
    error,
    timeline,
    /** Length of the loaded audio, once the player knows it. */
    mediaMs,
    elapsed,
    start,
    stop,
    resync,
    shift,
    mediaTime,
    /** Ref for the element that holds the YouTube player. */
    youtubeHost: setYoutubeHost,
  }
}

export type Playback = ReturnType<typeof usePlayback>

function createAudioClock(url: string, events: MediaEvents): MediaClock {
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.src = url
  const onMeta = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) events.onLength(audio.duration * 1000)
  }
  const onEnded = () => events.onEnded()
  const onError = () => events.onError('No se pudo cargar el MP3.')
  audio.addEventListener('loadedmetadata', onMeta)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('error', onError)
  return {
    async play(fromMs) {
      if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
          audio.addEventListener('error', () => reject(new Error('No se pudo cargar el MP3.')), { once: true })
          audio.load()
        })
      }
      audio.currentTime = fromMs / 1000
      await audio.play()
    },
    pause: () => audio.pause(),
    timeMs: () => audio.currentTime * 1000,
    running: () => !audio.paused && !audio.ended && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA,
    destroy() {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    },
  }
}

type YouTubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  destroy: () => void
}

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: () => void
        onStateChange?: (event: { data: number }) => void
        onError?: (event: { data: number }) => void
      }
    },
  ) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const YT_PLAYING = 1
const YT_ENDED = 0
const YT_PAUSED = 2

let youtubeApi: Promise<YouTubeApi> | null = null

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApi) return youtubeApi
  youtubeApi = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      youtubeApi = null
      script.remove()
      reject(new Error('No cargó YouTube.'))
    }
    document.head.appendChild(script)
  })
  return youtubeApi
}

function createYouTubeClock(host: HTMLElement, videoId: string, events: MediaEvents): MediaClock {
  // YouTube replaces the element it is given; React keeps the host.
  const mount = document.createElement('div')
  host.appendChild(mount)
  let player: YouTubePlayer | null = null
  let state = -1
  let gone = false
  const reportLength = () => {
    const seconds = player?.getDuration() ?? 0
    if (seconds > 0) events.onLength(seconds * 1000)
  }
  const ready = loadYouTubeApi().then(
    (api) =>
      new Promise<YouTubePlayer>((resolve, reject) => {
        if (gone) {
          reject(new Error('Cancelado.'))
          return
        }
        const created = new api.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          // No keyboard in the player, so P and the arrows keep working when it has focus.
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: () => {
              player = created
              reportLength()
              resolve(created)
            },
            onStateChange: ({ data }) => {
              state = data
              if (data === YT_PLAYING) reportLength()
              if (data === YT_ENDED) events.onEnded()
              if (data === YT_PAUSED) events.onPaused()
            },
            onError: () => {
              events.onError('YouTube no deja reproducir este video aquí.')
              reject(new Error('YouTube no deja reproducir este video aquí.'))
            },
          },
        })
      }),
  )
  ready.catch((reason: unknown) => {
    if (!gone) events.onError(reason instanceof Error ? reason.message : 'No cargó YouTube.')
  })
  return {
    async play(fromMs) {
      const ytPlayer = await ready
      ytPlayer.seekTo(fromMs / 1000, true)
      ytPlayer.playVideo()
    },
    pause: () => player?.pauseVideo(),
    timeMs: () => (player?.getCurrentTime() ?? 0) * 1000,
    running: () => state === YT_PLAYING,
    destroy() {
      gone = true
      player?.destroy()
      mount.remove()
    },
  }
}
