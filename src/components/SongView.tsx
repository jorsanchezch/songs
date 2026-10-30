import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Info,
  Loader2,
  Minus,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react'
import { ChartRow, NoteRow, placeChords } from '@/components/ChartLines'
import { WithHint } from '@/components/ControlHint'
import { FoldToggle } from '@/components/FoldToggle'
import { SongMark } from '@/components/SongMark'
import { InstrumentCharts } from '@/components/InstrumentCharts'
import { InstrumentSwitch } from '@/components/InstrumentSwitch'
import { Kbd, ShortcutLegend } from '@/components/KeyHint'
import { PlaybackDock, type Marking } from '@/components/PlaybackDock'
import { SpellingToggle } from '@/components/SpellingToggle'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { formatChord, transposeKeyName } from '@/lib/chords'
import {
  blocksFor,
  chordSequence,
  displayLyric,
  foldGroupsParts,
  foldHidesLyrics,
  headerChips,
  headerChipText,
  partKind,
  type DisplayBlock,
  type PartKind,
} from '@/lib/display'
import { instrumentLabel, isGuitar, type InstrumentId } from '@/lib/instruments'
import { putPrefs } from '@/lib/api'
import { loadSettings, saveSettings, type ViewSettings } from '@/lib/settings'
import { NOTE_HINT, NOTE_LABEL, NOTE_TYPES } from '@/lib/types'
import { useSetlists } from '@/hooks/useSetlists'
import { useSession, useUser } from '@/hooks/useUser'
import { useSongs } from '@/hooks/useSongs'
import { usePlayback, useFrameTime } from '@/hooks/usePlayback'
import { can, isStaff } from '@/lib/access'
import {
  buildTimeline,
  cueIndexAt,
  cuePoints,
  effectiveAudio,
  formatClock,
  LEAD_MAX_MS,
  loadPlaybackSettings,
  marksToParts,
  NEAR_CUE_MS,
  NUDGE_MS,
  partKeys,
  referenceTrack,
  trackSource,
  savePlaybackSettings,
  songMediaSources,
  startOffset,
  type Cue,
  type PlaybackCursor,
  type PlaybackSettings,
} from '@/lib/playback'
import type { SongPlayback } from '@/lib/types'
import { neighborSong, setSetlistSemitones, songPath } from '@/lib/setlists'
import { cn } from '@/lib/utils'
import {
  sliceChipLabel,
  sliceKey,
  sliceStartLines,
  usableJumpHeight,
  type ViewportNavStep,
} from '@/lib/viewportJumps'

export function SongView() {
  const { songId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useUser()
  const { people } = useSession()
  const {
    state,
    reload,
    removeSong,
    restoreSong,
    copySong,
    shareSong,
    patchMedia,
    discardDraft,
    songById,
    ensurePart,
    savePlayback,
  } = useSongs()
  const setlists = useSetlists()
  const listaId = searchParams.get('lista')
  const [settings, setSettings] = useState<ViewSettings>(() => loadSettings())
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [headerOpen, setHeaderOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const [chartWidth, setChartWidth] = useState(0)
  const [chPerPx, setChPerPx] = useState(0.6)
  const [lineHeights, setLineHeights] = useState<Record<string, number[]>>({})
  const [stepKey, setStepKey] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const [nearEnd, setNearEnd] = useState(false)
  // Smooth scrolling passes through other parts. The scroll spy waits until it lands.
  const spyPausedUntil = useRef(0)

  const instrument = settings.instrument

  useEffect(() => {
    setSettings(loadSettings())
  }, [user.id])
  // songById builds a fresh object per call; memoized so blocks and timings stay stable between renders.
  const ready = state.status === 'ready'
  const guitar = useMemo(() => (ready ? songById(songId, 'guitar') : undefined), [ready, songById, songId])
  const chart = useMemo(() => (ready ? songById(songId, instrument) : undefined), [ready, songById, songId, instrument])
  const song = chart ?? guitar

  useEffect(() => {
    if (!songId || state.status !== 'ready') return
    void ensurePart(songId, instrument).catch((error) => console.error(error))
  }, [ensurePart, instrument, songId, state.status])

  useEffect(() => {
    setOpenNote(null)
    setHeaderOpen(false)
    setVersionId(null)
    setCurrent(null)
    setStepKey(null)
    setLineHeights({})
    setSettings((prev) => {
      if (prev.showChords) return prev
      const next = { ...prev, showChords: true }
      saveSettings(next)
      return next
    })
  }, [songId])

  const version = chart?.versions.find((item) => item.id === versionId) ?? chart?.versions[0]
  const blocks = useMemo(
    () => (chart ? blocksFor(chart, version?.flow ?? null, settings.fold) : []),
    [chart, settings.fold, version],
  )
  const nav = useMemo(() => headerChips(blocks, foldGroupsParts(settings.fold)), [blocks, settings.fold])
  const jumpHeight = usableJumpHeight(viewportHeight, headerHeight, footerHeight)
  const steps = useMemo(
    () =>
      buildNavSteps(nav, blocks, {
        enabled: settings.viewportJumps,
        lineHeights,
        usableHeight: jumpHeight,
      }),
    [blocks, jumpHeight, lineHeights, nav, settings.viewportJumps],
  )

  const activeId =
    current && blocks.some((block) => block.id === current)
      ? current
      : (blocks[0]?.id ?? null)
  const activeStep =
    steps.find((step) => step.key === stepKey) ??
    steps.find((step) => step.blockId === activeId || step.chipIds.includes(activeId ?? '')) ??
    steps[0] ??
    null
  const activeStepKey = activeStep?.key ?? null

  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(() => loadPlaybackSettings())
  const updatePlayback = (patch: Partial<PlaybackSettings>) => {
    setPlaybackSettings((prev) => {
      const next = { ...prev, ...patch }
      savePlaybackSettings(next)
      return next
    })
  }
  // Local override so Jorge can tweak duration while playing before/while it persists.
  const [durationOverride, setDurationOverride] = useState<number | null | undefined>(undefined)
  /** Session pick among multiple YouTubes; principal still owns saved media. */
  const [mediaPick, setMediaPick] = useState<string | null>(null)
  const [makingSelected, setMakingSelected] = useState(false)
  useEffect(() => {
    setDurationOverride(undefined)
    setMediaPick(null)
  }, [songId])
  // Media lives on the song row; a part chart may not carry it. Audio is optional for duration mode.
  const media = useMemo(() => {
    const stored = chart?.durationMs ?? guitar?.durationMs
    return songMediaSources(
      {
        sources: chart?.sources?.length ? chart.sources : (guitar?.sources ?? []),
        audioUrl: chart?.audioUrl || guitar?.audioUrl,
        bpm: chart?.bpm ?? guitar?.bpm,
        durationMs: durationOverride !== undefined ? durationOverride : stored,
      },
      mediaPick,
    )
  }, [chart, durationOverride, guitar, mediaPick])
  const pickedSelected = Boolean(
    media.options.find((item) => item.key === media.activeKey)?.selected ?? media.options.length <= 1,
  )
  const playbackAudio = effectiveAudio(playbackSettings.audio, media)
  const { pace, useBpm } = playbackSettings
  // Calibration lives on the song row, so every instrument shares it.
  const songPlayback: SongPlayback = (chart ?? guitar)?.playback ?? {}
  const audioKind = playbackAudio === 'off' ? null : playbackAudio
  const audioSrc =
    audioKind === 'youtube' ? media.youtubeId : audioKind === 'mp3' && media.audioUrl ? trackSource(media.audioUrl) : null
  const track = referenceTrack(songPlayback, playbackAudio, media)
  const staleMarks = Boolean(audioKind && songPlayback[audioKind] && !track)
  // Lead and speed tweaks stay for this visit until someone saves them to the song.
  const [session, setSession] = useState<{ leadMs: number; speed: number } | null>(null)
  const [marking, setMarking] = useState<Marking | null>(null)
  const markingRef = useRef(marking)
  markingRef.current = marking
  useEffect(() => {
    setSession(null)
    setMarking(null)
  }, [songId, playbackAudio])
  const leadMs = marking ? 0 : (session?.leadMs ?? track?.introMs ?? 0)
  const playSpeed = session?.speed ?? songPlayback.speed ?? 1
  const trackParts = marking ? null : (track?.parts ?? null)
  const makeTimeline = useCallback(
    (mediaMs: number | null) =>
      buildTimeline({
        blocks,
        settings: { pace, useBpm },
        bpm: media.bpm,
        durationMs: media.durationMs,
        mediaMs,
        introMs: leadMs,
        parts: trackParts,
      }),
    [blocks, leadMs, media.bpm, media.durationMs, pace, trackParts, useBpm],
  )
  const playback = usePlayback({ makeTimeline, audio: playbackAudio, media, leadMs, speed: playSpeed })
  // Marking taps the real starts; the estimated cursor would only distract.
  const playCursor = marking ? null : playback.cursor
  const stopPlayback = playback.stop
  const playingRef = useRef(false)
  playingRef.current = playback.playing
  const showPlayHighlights = playbackSettings.highlights
  const cues = useMemo(() => cuePoints(playback.timeline), [playback.timeline])
  const keysForParts = useMemo(() => partKeys(blocks), [blocks])
  const measuredParts = track ? keysForParts.filter((key) => (track.parts[key] ?? 0) > 0).length : 0

  useEffect(() => {
    stopPlayback()
  }, [songId, stopPlayback])

  // Another version plays other parts; fold modes keep the same timing.
  useEffect(() => {
    stopPlayback()
    setMarking(null)
  }, [version?.id, stopPlayback])

  // Stopping while marking leaves the taps to review.
  useEffect(() => {
    if (!playback.playing && marking?.phase === 'marking') setMarking({ ...marking, phase: 'review' })
  }, [marking, playback.playing])

  const storePlayback = (next: SongPlayback) => {
    if (!songId) return
    void savePlayback(songId, next).catch((error: unknown) =>
      setAnnounce(error instanceof Error ? error.message : 'No pude guardar la reproducción.'),
    )
  }

  const startMarking = () => {
    if (!audioKind) return
    setMarking({ phase: 'marking', starts: [], endMs: null })
    playback.start(0)
  }

  const markNext = () => {
    const state = markingRef.current
    const time = playback.mediaTime()
    // Taps before the audio really starts would measure the loading time.
    if (!state || state.phase !== 'marking' || time == null || playback.status !== 'playing') return
    if (state.starts.length >= blocks.length) {
      setMarking({ ...state, endMs: time })
      stopPlayback()
      setAnnounce(`Final marcado en ${formatClock(time)}.`)
      return
    }
    const block = blocks[state.starts.length]!
    setMarking({ ...state, starts: [...state.starts, time] })
    setCurrent(block.id)
    spyPausedUntil.current = Date.now() + 900
    document.getElementById(`sec-${block.id}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
    setAnnounce(`Marcada ${block.label} en ${formatClock(time)}.`)
  }

  const undoMark = () => {
    const state = markingRef.current
    if (!state) return
    if (state.endMs != null) setMarking({ ...state, endMs: null })
    else setMarking({ ...state, starts: state.starts.slice(0, -1) })
  }

  const saveMarks = () => {
    if (!marking || !audioKind || !audioSrc) return
    const { introMs, parts } = marksToParts(keysForParts, marking.starts, marking.endMs)
    storePlayback({ ...songPlayback, [audioKind]: { src: audioSrc, introMs: introMs ?? 0, parts } })
    setMarking(null)
    setSession(null)
  }

  const clearMarks = () => {
    if (!audioKind) return
    const saved = songPlayback[audioKind]
    const next = { ...songPlayback }
    // The intro was set on its own; only the part lengths go.
    if (saved && track && saved.introMs) next[audioKind] = { ...saved, parts: {} }
    else delete next[audioKind]
    storePlayback(next)
    setSession(null)
  }

  const saveSync = () => {
    if (!session) return
    const next: SongPlayback = { ...songPlayback }
    if (audioKind && audioSrc) {
      next[audioKind] = { src: audioSrc, parts: track?.parts ?? {}, introMs: session.leadMs }
    } else {
      next.speed = session.speed
    }
    storePlayback(next)
    setSession(null)
  }

  const setLead = (ms: number) =>
    setSession({ leadMs: Math.min(LEAD_MAX_MS, Math.max(-LEAD_MAX_MS, Math.round(ms))), speed: playSpeed })
  const setSpeed = (speed: number) => setSession({ leadMs, speed: Math.round(speed * 100) / 100 })

  /** "We are here now": the next cue (or this one again, or the one before). */
  const resyncCue = (direction: -1 | 1) => {
    const t = playback.elapsed()
    const index = cueIndexAt(cues, t)
    const here = cues[index]
    const target =
      direction > 0 ? cues[index + 1] : here && t - here.at > 2000 ? here : cues[Math.max(0, index - 1)]
    if (!target) return
    const mediaNow = playback.mediaTime()
    if (mediaNow == null) {
      playback.resync(target.at)
    } else {
      // In duration mode the lead also rescales the parts, so settle it in a few passes.
      const targetIndex = cues.indexOf(target)
      let lead = mediaNow - target.at
      for (let pass = 0; pass < 6; pass++) {
        const at = cuePoints(
          buildTimeline({
            blocks,
            settings: { pace, useBpm },
            bpm: media.bpm,
            durationMs: media.durationMs,
            mediaMs: playback.mediaMs,
            introMs: lead,
            parts: trackParts,
          }),
        )[targetIndex]?.at
        if (at == null) break
        lead = mediaNow - at
      }
      setLead(lead)
    }
    setAnnounce(`Ahora: ${target.label}${target.repeat > 1 ? ` ${target.pass}/${target.repeat}` : ''}`)
  }

  const nudge = (sign: -1 | 1) => {
    if (audioKind) setLead(leadMs + sign * NUDGE_MS)
    else playback.shift(-sign * NUDGE_MS)
  }

  const playKeysRef = useRef({ resyncCue, nudge, markNext, undoMark })
  playKeysRef.current = { resyncCue, nudge, markNext, undoMark }
  const dockEscape = useRef<(() => boolean) | null>(null)
  const escapePlayback = () => {
    const state = markingRef.current
    if (state?.phase === 'marking') {
      stopPlayback()
      return true
    }
    if (state?.phase === 'review') {
      setMarking(null)
      return true
    }
    return dockEscape.current?.() ?? false
  }
  const escapePlaybackRef = useRef(escapePlayback)
  escapePlaybackRef.current = escapePlayback

  useEffect(() => {
    if (!version) return
    setSettings((prev) => {
      const next = {
        ...prev,
        visibleNotes: version.openNotes.length ? version.openNotes : [],
      }
      saveSettings(next)
      return next
    })
  }, [version])

  const update = (patch: Partial<ViewSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      if (patch.semitones || patch.chordShapes) {
        void putPrefs({ semitones: next.semitones, chordShapes: next.chordShapes }).catch((error) => console.error(error))
      }
      return next
    })
  }

  const activeList = listaId ? setlists.find((list) => list.id === listaId) : undefined
  const setlistItemIndex = activeList?.items.findIndex((item) => item.songId === songId) ?? -1
  const setlistItem = setlistItemIndex >= 0 ? activeList?.items[setlistItemIndex] : undefined

  const semitones = song
    ? (setlistItem && can(user, 'update') ? setlistItem.semitones : (settings.semitones[song.id] ?? 0))
    : 0
  const setSemitones = (value: number) => {
    if (!song) return
    const wrapped = value > 11 ? value - 12 : value < -11 ? value + 12 : value
    if (listaId && setlistItemIndex >= 0 && can(user, 'update')) {
      setSetlistSemitones(listaId, setlistItemIndex, wrapped)
      return
    }
    update({ semitones: { ...settings.semitones, [song.id]: wrapped } })
  }

  // Choosing a part by hand always ends playback.
  const goStep = (step: ViewportNavStep) => {
    const block = blocks.find((item) => item.id === step.blockId)
    if (!block) return
    stopPlayback()
    const shown = steps.findIndex((item) => item.key === step.key)
    setCurrent(step.blockId)
    setStepKey(step.key)
    setAnnounce(
      `${step.label}${block.repeat > 1 ? ` por ${block.repeat}` : ''}, parte ${shown + 1} de ${steps.length}`,
    )
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    spyPausedUntil.current = Date.now() + (smooth ? 900 : 100)
    const target =
      step.lineIndex == null
        ? document.getElementById(`sec-${step.blockId}`)
        : document.getElementById(`line-${step.blockId}-${step.lineIndex}`)
    target?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  const go = (id: string) => {
    const step = steps.find((item) => item.blockId === id || item.key === id) ?? steps.find((item) => item.chipIds.includes(id))
    if (step) {
      goStep(step)
      return
    }
    const index = blocks.findIndex((block) => block.id === id)
    const block = blocks[index]
    if (!block) return
    stopPlayback()
    const shown = nav.findIndex((chip) => chip.id === id || chip.ids.includes(id))
    setCurrent(id)
    setStepKey(id)
    setAnnounce(`${block.label}${block.repeat > 1 ? ` por ${block.repeat}` : ''}, parte ${shown + 1} de ${nav.length}`)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    spyPausedUntil.current = Date.now() + (smooth ? 900 : 100)
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  const togglePlayback = () => {
    // Reviewing marks: Guardar or Descartar decides first.
    if (markingRef.current?.phase === 'review') return
    if (playback.playing) {
      stopPlayback()
      return
    }
    // Play starts where the reader is: the current part, or its viewport slice.
    const sliceLine = activeStep?.chipIds.includes(activeId ?? '') ? activeStep.lineIndex : null
    playback.start(startOffset(playback.timeline, activeId, sliceLine))
  }
  const togglePlaybackRef = useRef(togglePlayback)
  togglePlaybackRef.current = togglePlayback

  // Playback moves the part, the step, and the scroll. New parts land under the header;
  // inside a long part the playing line is brought back on screen when it leaves it.
  const lastPlayed = useRef<PlaybackCursor | null>(null)
  useEffect(() => {
    const previous = lastPlayed.current
    lastPlayed.current = playCursor
    if (!playCursor) return
    setCurrent(playCursor.blockId)
    const step = playbackStep(steps, playCursor)
    if (step) setStepKey(step.key)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
    const line =
      playCursor.lineIndex == null
        ? null
        : document.getElementById(`line-${playCursor.blockId}-${playCursor.lineIndex}`)
    if (!previous || previous.blockId !== playCursor.blockId) {
      spyPausedUntil.current = Date.now() + (smooth ? 900 : 100)
      const target = !previous && playCursor.lineIndex ? line : document.getElementById(`sec-${playCursor.blockId}`)
      target?.scrollIntoView({ behavior, block: 'start' })
      return
    }
    if (!line || previous.lineIndex === playCursor.lineIndex) return
    const rect = line.getBoundingClientRect()
    const footerTop = footerRef.current?.getBoundingClientRect().top ?? window.innerHeight
    if (rect.bottom > footerTop - 8 || rect.top < headerHeight) {
      spyPausedUntil.current = Date.now() + (smooth ? 900 : 100)
      line.scrollIntoView({ behavior, block: 'start' })
    }
  }, [playCursor])

  // The sticky header changes height with the controls. Parts land just under it.
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight))
    observer.observe(header)
    return () => observer.disconnect()
  })

  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return
    const observer = new ResizeObserver(() => setFooterHeight(footer.offsetHeight))
    observer.observe(footer)
    return () => observer.disconnect()
  })

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Line heights feed equal viewport slices when the live-jump option is on.
  useLayoutEffect(() => {
    if (!settings.viewportJumps) {
      setLineHeights((prev) => (Object.keys(prev).length ? {} : prev))
      return
    }
    const measure = () => {
      const next: Record<string, number[]> = {}
      for (const block of blocks) {
        const earlier = block.duplicateOfId
          ? blocks.find((item) => item.id === block.duplicateOfId)?.section
          : undefined
        const lines = (earlier ?? block.section).lines
        next[block.id] = lines.map((_, lineIndex) => {
          const el = document.getElementById(`line-${block.id}-${lineIndex}`)
          return el?.offsetHeight ?? 0
        })
      }
      setLineHeights((prev) => (sameHeightMap(prev, next) ? prev : next))
    }
    measure()
    const chart = chartRef.current
    const observer = chart ? new ResizeObserver(measure) : null
    if (chart) observer?.observe(chart)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [
    blocks,
    settings.viewportJumps,
    settings.fontSize,
    settings.fold,
    settings.showChords,
    chartWidth,
    headerHeight,
    footerHeight,
  ])

  // Scrolling by hand moves the current part too, so the footer never lies.
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // While playing, the clock owns the current part; scrolling by hand only looks around.
        if (playingRef.current || Date.now() < spyPausedUntil.current || !blocks.length) return
        const line = headerHeight + 48
        let index = 0
        blocks.forEach((block, position) => {
          const top = document.getElementById(`sec-${block.id}`)?.getBoundingClientRect().top
          if (top != null && top <= line) index = position
        })
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
        if (atBottom) {
          // The last parts cannot reach the top. Keep a part chosen down there.
          const chosen = blocks.findIndex((block) => block.id === current)
          index = Math.max(index, chosen)
        }
        const id = blocks[index]?.id
        if (id) setCurrent((prev) => (prev === id ? prev : id))

        if (!settings.viewportJumps || !steps.length) return
        let stepIndex = 0
        steps.forEach((step, position) => {
          const top = stepTargetTop(step, id ?? step.blockId)
          if (top != null && top <= line) stepIndex = position
        })
        if (atBottom) stepIndex = Math.max(stepIndex, steps.findIndex((step) => step.key === stepKey))
        const nextKey = steps[Math.max(0, stepIndex)]?.key
        if (nextKey) setStepKey((prev) => (prev === nextKey ? prev : nextKey))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [blocks, current, headerHeight, settings.viewportJumps, stepKey, steps])

  // When the end of the current part is on screen, the change is coming: the footer says so.
  useEffect(() => {
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const footerTop = footerRef.current?.getBoundingClientRect().top ?? window.innerHeight
        if (settings.viewportJumps && activeStep) {
          const stepIndex = steps.findIndex((step) => step.key === activeStep.key)
          const next = stepIndex >= 0 ? steps[stepIndex + 1] : undefined
          if (!next) {
            setNearEnd(false)
            return
          }
          const blockId =
            activeId && next.chipIds.includes(activeId) ? activeId : next.blockId
          const top = stepTargetTop(next, blockId)
          setNearEnd(top != null && top <= footerTop)
          return
        }
        const section = activeId ? document.getElementById(`sec-${activeId}`) : null
        const lastChip = nav[nav.length - 1]
        const last = !lastChip?.ids.includes(activeId ?? '')
        setNearEnd(Boolean(section && last && section.getBoundingClientRect().bottom <= footerTop))
      })
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [activeId, activeStep, nav, settings.viewportJumps, steps])

  // Keep the current part chip in view in the scrolling row.
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!row || !chip) return
    const left = chip.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16), behavior: 'auto' })
    }
  }, [activeId, activeStepKey])

  // The chart fits the width, so nothing scrolls sideways mid-song.
  useLayoutEffect(() => {
    const chartEl = chartRef.current
    if (!chartEl) return
    const measure = () => {
      setChartWidth(chartEl.clientWidth)
      const probe = probeRef.current
      if (probe && settings.fontSize) setChPerPx(probe.offsetWidth / 10 / settings.fontSize)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(chartEl)
    return () => observer.disconnect()
  }, [settings.fontSize, chart])

  // The screen stays on while a song is open.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const request = () => {
      if (document.visibilityState !== 'visible') return
      void navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (gone) void sentinel.release()
          else lock = sentinel
        })
        .catch(() => undefined)
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [])

  const stepSection = (direction: -1 | 1) => {
    const index = Math.max(
      0,
      steps.findIndex((step) => step.key === activeStepKey || step.chipIds.includes(activeId ?? '')),
    )
    const next = steps[index + direction]
    if (next) goStep(next)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      ) {
        return
      }
      const keys = playKeysRef.current
      // While marking, the arrows and the pedal tap part starts instead of moving.
      if (markingRef.current?.phase === 'marking' && !event.shiftKey) {
        if (event.key === 'm' || event.key === 'M' || event.key === 'ArrowRight' || event.key === 'PageDown') {
          event.preventDefault()
          keys.markNext()
          return
        }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          event.preventDefault()
          keys.undoMark()
          return
        }
      }
      if (playingRef.current && !markingRef.current) {
        if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault()
          keys.resyncCue(event.key === 'ArrowLeft' ? -1 : 1)
          return
        }
        // Spanish keyboards type + without Shift; the numpad sends its own keys.
        if (event.key === '-' || event.key === '+' || event.key === '=') {
          event.preventDefault()
          keys.nudge(event.key === '-' ? -1 : 1)
          return
        }
      }
      if (event.shiftKey) return
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        setHeaderOpen((open) => !open)
        return
      }
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        togglePlaybackRef.current()
        return
      }
      const partNumber = Number(event.key)
      if (event.key.length === 1 && partNumber >= 1 && partNumber <= 9) {
        const step = steps[partNumber - 1]
        if (!step) return
        event.preventDefault()
        goStep(step)
        return
      }
      // Bluetooth page turner pedals send PageUp and PageDown.
      const back = event.key === 'ArrowLeft' || event.key === 'PageUp'
      const forward = event.key === 'ArrowRight' || event.key === 'PageDown'
      if (!back && !forward) return
      event.preventDefault()
      stepSection(back ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, activeStepKey, blocks, steps])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (typing(event.target)) return
      if (state.status !== 'ready') return
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      const ids = listaId
        ? (setlists.find((list) => list.id === listaId)?.items.map((item) => item.songId) ?? [])
        : state.songs.map((item) => item.id)
      const playable = ids.filter((id) => state.songs.some((item) => item.id === id))
      const next = neighborSong(playable, songId, direction)
      if (!next) return
      event.preventDefault()
      navigate(songPath(next, listaId))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listaId, navigate, setlists, songId, state])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (typing(event.target)) return
      event.preventDefault()
      // Marking and the open settings panel close first; the next Escape leaves the song.
      if (escapePlaybackRef.current()) return
      navigate(listaId ? `/listas/${encodeURIComponent(listaId)}` : '/')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listaId, navigate])

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" />
        <p>Cargando canción…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 font-medium text-destructive">{state.message}</p>
        <Button onClick={() => void reload()}>Reintentar</Button>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 font-medium">No está esta canción.</p>
        <Button asChild>
          <Link to="/">Volver a Songbook</Link>
        </Button>
      </div>
    )
  }

  const soundingKey = transposeKeyName((chart ?? song).key, semitones)
  const partIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === activeStepKey || step.chipIds.includes(activeId ?? '')),
  )
  const partLabel = activeStep?.label ?? ''
  const partTotal = steps.length
  const partCountLabel =
    partLabel && partTotal > 0 ? `${partLabel} ${partIndex + 1}/${partTotal}` : partLabel
  const songKey = (chart ?? song).key
  const spelling = settings.spelling
  const slashAsDegree = isGuitar(instrument) && settings.slashAsDegree
  const showChord = (raw: string) => formatChord(raw, songKey, semitones, spelling, slashAsDegree)
  const nextStep = steps[partIndex + 1]
  const nextBlock = nextStep ? blocks.find((block) => block.id === nextStep.blockId) : undefined
  const nextChords = nextBlock
    ? chordSequence(nextBlock.section.lines)
        .slice(0, 4)
        .map((raw) => showChord(raw))
    : []
  const widestLine = widestLineCh(blocks, songKey, semitones, spelling, slashAsDegree)
  // Section border and padding take about 16px of the width.
  const fitted = chartWidth && widestLine ? Math.floor((chartWidth - 16) / (widestLine * chPerPx)) : settings.fontSize
  // Shrink a little to keep lines whole, then wrap what is still too long.
  const chartFontSize = Math.max(Math.round(settings.fontSize * 0.85), Math.min(settings.fontSize, fitted))
  const wrapAt = chartWidth ? Math.floor((chartWidth - 16) / (chPerPx * chartFontSize)) : undefined
  const author = song.artist.trim() || song.composer.trim()
  const names = chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) => showChord(raw))
  const uniqueNames = [...new Set(names)]
  const diagramNames = [
    ...new Set(
      chordSequence(blocks.flatMap((block) => block.section.lines)).map((raw) =>
        formatChord(raw, (chart ?? song).key, semitones, 'letters'),
      ),
    ),
  ]

  const shareControls =
    song.origin !== 'catalog' && (song.ownerId === user.id || isStaff(user)) ? (
      <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1.5 text-sm">
        <Button
          size="sm"
          variant={song.shared ? 'default' : 'outline'}
          aria-pressed={song.shared}
          onClick={() => void shareSong(song.id, { shared: !song.shared })}
        >
          Compartida
        </Button>
        <InfoTip label="Qué significa compartir" text={SHARE_HINT} />
        {isStaff(user) && (
          <select
            className="h-8 max-w-40 rounded-md border bg-background px-2 text-xs"
            aria-label="Compartir con"
            value=""
            onChange={(event) => {
              const userId = event.target.value
              if (userId) void shareSong(song.id, { userId, include: true })
            }}
          >
            <option value="">Compartir con…</option>
            {people
              .filter((person) => person.id !== song.ownerId)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
        )}
        {song.shares?.map((userId) => {
          const person = people.find((item) => item.id === userId)
          return (
            <button
              key={userId}
              type="button"
              className="rounded-full border px-2 py-1 text-xs"
              title="Quitar a esta persona de la copia."
              onClick={() => void shareSong(song.id, { userId, include: false })}
            >
              {person?.name ?? userId} ×
            </button>
          )
        })}
      </span>
    ) : null

  const toolbarFloat = (
    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {activeList && (
        <Link
          to={`/listas/${encodeURIComponent(activeList.id)}`}
          aria-keyshortcuts="Escape"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:underline"
        >
          <span>
            {setlistItemIndex + 1}/{activeList.items.length} {activeList.name}
          </span>
          {headerOpen && <Kbd>Esc</Kbd>}
        </Link>
      )}
      <p className="shrink-0 text-base font-semibold text-primary tabular-nums">{partCountLabel}</p>
      {headerOpen && shareControls}
      <span className="inline-flex items-center gap-1">
        <UserBadge />
        <InfoTip label="Qué es una persona" text={USER_HINT} />
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={headerOpen}
        aria-keyshortcuts="Space"
        onClick={() => setHeaderOpen((open) => !open)}
      >
        {headerOpen ? 'Ocultar' : 'Controles'}
        <Kbd>Espacio</Kbd>
      </Button>
    </div>
  )

  const transposer = (compact: boolean) => (
    <div
      role="group"
      aria-label="Tono"
      className={cn(
        'flex shrink-0 items-center rounded-md border bg-card',
        compact ? 'h-7 gap-0' : 'gap-1 self-start px-1 py-1',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(compact && 'size-7')}
        aria-label="Bajar un semitono"
        title="Baja un semitono."
        onClick={() => setSemitones(semitones - 1)}
      >
        <Minus className={cn(compact && 'size-3')} />
      </Button>
      <span className={cn('text-center font-semibold', compact ? 'min-w-5 px-0.5 text-xs' : 'min-w-16 text-sm')} aria-live="polite">
        <span className="sr-only">Tono </span>
        {soundingKey || '—'}
        {semitones !== 0 && songKey ? (
          <span className={cn('block text-xs font-normal text-muted-foreground', compact && 'sr-only')}>orig. {songKey}</span>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={cn(compact && 'size-7')}
        aria-label="Subir un semitono"
        title="Sube un semitono."
        onClick={() => setSemitones(semitones + 1)}
      >
        <Plus className={cn(compact && 'size-3')} />
      </Button>
    </div>
  )

  return (
    <div className="min-h-svh pb-40">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <header ref={headerRef} className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] flex-col gap-3 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SongMark songId={song.id} />
              <h1 className="min-w-0 shrink truncate text-lg font-semibold">{song.title}</h1>
              {author && <p className="min-w-0 shrink-[2] truncate text-sm text-muted-foreground">{author}</p>}
              {song.personal && song.draft && (
                <span
                  className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                  title="Ves tu versión personal. La canción compartida no cambió."
                >
                  Mi versión
                </span>
              )}
              {isStaff(user) && (song.draftUsers ?? 0) > 0 && (
                <Link
                  to={`/c/${encodeURIComponent(song.id)}/versiones`}
                  className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary hover:underline"
                  title="Abre las versiones que guardó cada persona."
                >
                  Versiones ({song.draftUsers})
                </Link>
              )}
              {!headerOpen && transposer(true)}
            </div>
            {toolbarFloat}
          </div>
          {headerOpen && transposer(false)}
          {headerOpen && (
          <>
          <div className="flex flex-wrap items-center gap-2">
            <InstrumentSwitch value={instrument} onChange={(next: InstrumentId) => update({ instrument: next })} />
            {!song.editable && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void copySong(song.id).then((id) => navigate(`/c/${encodeURIComponent(id)}`))
                }}
              >
                Crear mi copia
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Volver"
                title="Volver a las canciones."
                aria-keyshortcuts={listaId ? undefined : 'Escape'}
              >
                <Link to="/">
                  <ArrowLeft />
                </Link>
              </Button>
              {!listaId && <Kbd>Esc</Kbd>}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {song.artist || 'Sin artista'}
              {song.composer ? ` · ${song.composer}` : ''}
            </p>
            {(song.editable || song.personal) && (
              <Button
                variant="outline"
                size="icon"
                asChild
                aria-label={song.editable ? 'Editar' : 'Editar mi versión'}
                title={
                  song.editable
                    ? 'Editar esta canción.'
                    : 'Edita tu versión personal. La canción compartida no cambia.'
                }
              >
                <Link to={`/editar/${encodeURIComponent(song.id)}?inst=${instrument}`}>
                  <Pencil />
                </Link>
              </Button>
            )}
            {(song.origin === 'catalog' || (song.ownerId && song.ownerId !== user.id)) && (
              <Button
                variant="outline"
                onClick={() => {
                  void copySong(song.id).then((id) => navigate(`/c/${encodeURIComponent(id)}`))
                }}
              >
                Crear mi copia
              </Button>
            )}
            {song.removable && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!window.confirm('¿Eliminar esta canción? No vuelve al recargar.')) return
                  void removeSong(song).then(() => navigate(listaId ? `/listas/${encodeURIComponent(listaId)}` : '/'))
                }}
              >
                <Trash2 />
                Eliminar
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={settings.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              title={settings.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              {settings.theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
          {song.overridden && song.origin === 'catalog' && song.editable && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <p>El catálogo en la base difiere del archivo. El archivo no se toca.</p>
              <Button size="sm" onClick={() => void restoreSong(song.id)}>
                Restaurar archivo
              </Button>
            </div>
          )}
          {song.personal && song.draft && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p>
                Ves tu versión personal. Solo tú la ves; un Admin la puede revisar.
                {song.draft.stale ? ' La canción compartida cambió después de tu versión.' : ''}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!window.confirm('¿Descartar tu versión y volver a la canción compartida?')) return
                  void discardDraft(song.id, instrument).catch((error) => console.error(error))
                }}
              >
                Descartar mi versión
              </Button>
            </div>
          )}
          {isStaff(user) && (song.draftUsers ?? 0) > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <p>
                {song.draftUsers === 1
                  ? 'Una persona guardó su propia versión.'
                  : `${song.draftUsers} personas guardaron su propia versión.`}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/c/${encodeURIComponent(song.id)}/versiones`}>Ver versiones</Link>
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vista de la cifra">
            <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <SpellingToggle value={spelling} onChange={(next) => update({ spelling: next })} />
            {isGuitar(instrument) && (
              <WithHint text="En la guitarra, un acorde con barra (como C/E) oculta la barra y el bajo, y deja la letra del acorde. Apagado, vuelve la barra.">
                <Button
                  variant={settings.slashAsDegree ? 'default' : 'outline'}
                  title="En la guitarra, un acorde con barra (como C/E) oculta la barra y el bajo, y deja la letra del acorde. Apagado, vuelve la barra."
                  aria-pressed={settings.slashAsDegree}
                  onClick={() => update({ slashAsDegree: !settings.slashAsDegree })}
                >
                  Solo grado
                </Button>
              </WithHint>
            )}
            <WithHint text="Achica la letra de la cifra.">
              <Button variant="outline" title="Achica la letra de la cifra." onClick={() => update({ fontSize: Math.max(16, settings.fontSize - 2) })}>
                A−
              </Button>
            </WithHint>
            <WithHint text="Aumenta la letra de la cifra.">
              <Button variant="outline" title="Aumenta la letra de la cifra." onClick={() => update({ fontSize: Math.min(40, settings.fontSize + 2) })}>
                A+
              </Button>
            </WithHint>
            <WithHint text="Muestra u oculta los acordes sobre la letra.">
              <Button
                variant={settings.showChords ? 'default' : 'outline'}
                title="Muestra u oculta los acordes sobre la letra."
                aria-pressed={settings.showChords}
                onClick={() => update({ showChords: !settings.showChords })}
              >
                Acordes
              </Button>
            </WithHint>
            <WithHint text="Muestra u oculta los diagramas del instrumento.">
              <Button
                variant={settings.showDiagrams ? 'default' : 'outline'}
                aria-pressed={settings.showDiagrams}
                title="Muestra u oculta los diagramas del instrumento."
                onClick={() => update({ showDiagrams: !settings.showDiagrams })}
              >
                Diagrama
              </Button>
            </WithHint>
            <FoldToggle value={settings.fold} onChange={(fold) => update({ fold })} />
            <WithHint text={VIEWPORT_JUMPS_HINT}>
              <Button
                variant={settings.viewportJumps ? 'default' : 'outline'}
                aria-pressed={settings.viewportJumps}
                title={VIEWPORT_JUMPS_HINT}
                onClick={() => update({ viewportJumps: !settings.viewportJumps })}
              >
                Saltos por pantalla
              </Button>
            </WithHint>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Marcas de la cifra">
            {NOTE_TYPES.map((type) => {
              const on = settings.visibleNotes.includes(type)
              return (
                <WithHint key={type} text={NOTE_HINT[type]}>
                  <button
                    type="button"
                    aria-pressed={on}
                    title={NOTE_HINT[type]}
                    onClick={() =>
                      update({
                        visibleNotes: on
                          ? settings.visibleNotes.filter((item) => item !== type)
                          : [...settings.visibleNotes, type],
                      })
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium',
                      on ? 'border-primary bg-primary/15 text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {NOTE_LABEL[type]}
                  </button>
                </WithHint>
              )
            })}
          </div>

          {song.versions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {song.versions.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={(version?.id ?? '') === item.id ? 'default' : 'outline'}
                  onClick={() => {
                    setVersionId(item.id)
                    setCurrent(null)
                    setStepKey(null)
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          )}

          </>
          )}

          <nav ref={chipsRef} aria-label="Partes de la canción" className="flex gap-1.5 overflow-x-auto pb-1">
            {steps.map((step, index) => {
              const kind = partKind(step.label)
              const active = step.key === activeStepKey
              const chip = nav.find((item) => item.id === step.blockId || item.ids.includes(step.blockId))
              return (
                <button
                  key={step.key}
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                  title={partHint(step.label, chip?.copies ?? 1, chip?.repeat ?? 1, index)}
                  onClick={() => goStep(step)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                  )}
                >
                  {kind !== 'other' && (
                    <span className={cn('size-1.5 rounded-full', active ? 'bg-primary-foreground' : kindPip(kind))} />
                  )}
                  {index < 9 && <Kbd>{index + 1}</Kbd>}
                  {step.label}
                </button>
              )
            })}
          </nav>
          {headerOpen && (
            <ShortcutLegend
              className="border-t pt-2"
              items={[
                { id: 'space', keys: <Kbd>Espacio</Kbd>, label: 'Controles' },
                {
                  id: 'pedal',
                  keys: (
                    <>
                      <Kbd>RePág</Kbd>
                      <Kbd>AvPág</Kbd>
                    </>
                  ),
                  label: 'Pedal de páginas',
                },
                {
                  id: 'part',
                  keys: (
                    <>
                      <Kbd>←</Kbd>
                      <Kbd>→</Kbd>
                    </>
                  ),
                  label: 'Parte anterior o siguiente',
                },
                { id: 'jump', keys: <Kbd>1–9</Kbd>, label: 'Ir a esa parte' },
                { id: 'play', keys: <Kbd>P</Kbd>, label: 'Reproducir o parar' },
                {
                  id: 'sync',
                  keys: (
                    <>
                      <Kbd>⇧←</Kbd>
                      <Kbd>⇧→</Kbd>
                    </>
                  ),
                  label: 'Reproduciendo: estamos aquí',
                },
                {
                  id: 'lead',
                  keys: (
                    <>
                      <Kbd>−</Kbd>
                      <Kbd>+</Kbd>
                    </>
                  ),
                  label: 'Entrada ¼ s',
                },
                {
                  id: 'song',
                  keys: (
                    <>
                      <Kbd>⌘←</Kbd>
                      <Kbd>⌘→</Kbd>
                    </>
                  ),
                  label: listaId ? 'Canción en la lista' : 'Canción en la biblioteca',
                },
                {
                  id: 'leave',
                  keys: <Kbd>Esc</Kbd>,
                  label: listaId ? 'Volver a la lista' : 'Volver a las canciones',
                },
              ]}
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[70.4rem] px-4 py-4">
        {!chart && <p className="mb-4 text-sm text-muted-foreground">Cargando {instrumentLabel(instrument)}…</p>}
        {chart && settings.showDiagrams && (instrument === 'drums' || diagramNames.length > 0) && (
          <InstrumentCharts
            instrument={instrument}
            names={diagramNames}
            choices={settings.chordShapes[song.id] ?? {}}
            onChoose={(name, shapeId) => {
              const current = { ...(settings.chordShapes[song.id] ?? {}) }
              if (shapeId) current[name] = shapeId
              else delete current[name]
              update({
                chordShapes: { ...settings.chordShapes, [song.id]: current },
              })
            }}
          />
        )}
        {headerOpen && uniqueNames.length > 0 && (
          <p className="mb-4 text-sm leading-6 text-chart-chord">
            <span className="mr-2 font-medium text-muted-foreground">Acordes</span>
            {uniqueNames.join('  ·  ')}
          </p>
        )}

        <div
          ref={chartRef}
          className="relative space-y-8 font-mono"
          style={{ fontSize: `${chartFontSize}px` }}
        >
          <span ref={probeRef} aria-hidden className="invisible absolute whitespace-pre" style={{ fontSize: `${settings.fontSize}px` }}>
            0000000000
          </span>
          {blocks.map((block, index) => {
            const active = block.id === activeId
            const kind = partKind(block.label)
            const earlier = block.duplicateOfId
              ? blocks.find((item) => item.id === block.duplicateOfId)?.section
              : undefined
            const lines = (earlier ?? block.section).lines
            const shown = earlier ? { ...block, section: { ...block.section, lines: earlier.lines } } : block
            const showLyrics = !foldHidesLyrics(settings.fold)
            const following = blocks[index + 1]
            const followingChord = following ? chordSequence(following.section.lines)[0] : undefined
            const playingHere = playCursor?.blockId === block.id ? playCursor : null
            const playingLine = showPlayHighlights ? playingHere?.lineIndex : null
            return (
              <section
                key={block.id}
                id={`sec-${block.id}`}
                aria-labelledby={`h-${block.id}`}
                aria-current={active ? 'step' : undefined}
                style={{ scrollMarginTop: `${headerHeight + 8}px` }}
                className={cn(
                  'rounded-r-md pl-3 transition-colors',
                  active ? 'border-l-4 border-primary bg-primary/[0.06] py-2' : cn('border-l-2', kindEdge(kind)),
                )}
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h2
                    id={`h-${block.id}`}
                    className={cn('font-sans text-[0.7em] font-semibold tracking-wide uppercase', kindHeading(kind))}
                  >
                    <span className="sr-only">Parte {index + 1}: </span>
                    {block.label}
                  </h2>
                  {block.repeat > 1 && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-sans text-[0.55em] font-bold tabular-nums',
                        playingHere ? 'bg-primary text-primary-foreground' : 'bg-primary/15',
                      )}
                    >
                      <span aria-hidden>
                        {playingHere ? `${playingHere.pass}/${playingHere.repeat}` : `×${block.repeat}`}
                      </span>
                      <span className="sr-only">se repite {block.repeat} veces</span>
                    </span>
                  )}
                </div>
                <NoteRow
                  notes={block.section.notes}
                  visible={settings.visibleNotes}
                  openNote={openNote}
                  prefix={`${block.id}:section`}
                  onToggle={setOpenNote}
                />
                <div className="overflow-x-auto">
                  {lines.map((line, lineIndex) => (
                    <div
                      key={`${block.id}-${lineIndex}`}
                      id={`line-${block.id}-${lineIndex}`}
                      style={{ scrollMarginTop: `${headerHeight + 8}px` }}
                    >
                      <ChartRow
                        block={shown}
                        lineIndex={lineIndex}
                        showChords={settings.showChords || line.lyric == null}
                        showLyrics={showLyrics}
                        spelling={spelling}
                        slashAsDegree={slashAsDegree}
                        semitones={semitones}
                        songKey={(chart ?? song).key}
                        visible={settings.visibleNotes}
                        openNote={openNote}
                        onToggle={setOpenNote}
                        wrapAt={wrapAt}
                        playing={playingLine === lineIndex}
                        playingChord={playingLine === lineIndex ? playingHere?.chordIndex : null}
                      />
                    </div>
                  ))}
                  {block.section.sameAs && block.section.lines.length === 0 && (
                    <p className="font-sans text-[0.65em] text-muted-foreground">
                      No se encontró la parte «{block.section.sameAs}».
                    </p>
                  )}
                </div>
                {following && (
                  <button
                    type="button"
                    data-cue
                    aria-label={`Ir a la parte siguiente: ${following.label}`}
                    onClick={() => go(following.id)}
                    className={cn(
                      'mt-1 inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-sans text-[0.6em] focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none',
                      active ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground',
                    )}
                  >
                    <ChevronRight className="size-[1.1em]" aria-hidden />
                    <span className="font-semibold">{following.label}</span>
                    {following.repeat > 1 && <span>×{following.repeat}</span>}
                    {followingChord && (
                      <span className="font-mono font-semibold text-chart-chord">
                        {showChord(followingChord)}
                      </span>
                    )}
                  </button>
                )}
              </section>
            )
          })}
        </div>

        {(song.sources.length > 0 || song.source) && (
          <section className="mt-8 font-sans text-sm">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Referencias y tutoriales
            </h2>
            <ul className="flex flex-col gap-1.5">
              {(song.sources.length
                ? song.sources
                : [{ url: song.source, label: 'Fuente' }]
              ).map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  >
                    {item.label || item.url}
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer ref={footerRef} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[70.4rem] flex-col gap-2">
          <div
            className="flex h-2.5 items-center gap-1"
            role="progressbar"
            aria-label="Avance de la canción"
            aria-valuemin={1}
            aria-valuemax={Math.max(partTotal, 1)}
            aria-valuenow={partTotal ? Math.max(partIndex + 1, 1) : 1}
            aria-valuetext={partLabel ? `${partLabel}, parte ${Math.max(partIndex + 1, 1)} de ${partTotal}` : undefined}
          >
            {/* One segment per nav step (part, or viewport slice when that option is on). */}
            {steps.map((step, index) => (
              <span
                key={step.key}
                className={cn(
                  'rounded-full transition-[height,background-color] motion-reduce:transition-none',
                  index === partIndex
                    ? 'h-2.5 bg-primary'
                    : index < partIndex
                      ? 'h-1.5 bg-primary/45'
                      : 'h-1.5 bg-muted-foreground/30',
                )}
                style={{ flexGrow: Math.max(1, step.weight), flexBasis: 0 }}
              />
            ))}
          </div>
          <div className="flex items-stretch gap-2">
          <Button
            size="lg"
            variant="secondary"
            aria-label="Parte anterior"
            aria-keyshortcuts="ArrowLeft PageUp"
            disabled={partIndex <= 0}
            onClick={() => stepSection(-1)}
          >
            <ChevronLeft />
            Anterior
            <Kbd>←</Kbd>
          </Button>
          <p className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <span className="block max-w-full truncate text-sm font-semibold">
              {partLabel || 'Canción'}
              {partTotal > 0 && (
                <span className="ml-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {Math.max(partIndex + 1, 1)}/{partTotal}
                </span>
              )}
            </span>
            {playback.playing && !marking ? (
              <FooterNext elapsed={playback.elapsed} cues={cues} totalMs={playback.timeline.totalMs} />
            ) : (
            <span
              className={cn(
                'block max-w-full truncate rounded-md px-2 text-xs transition-colors motion-reduce:transition-none',
                nearEnd ? 'bg-primary/20 py-0.5 text-sm text-foreground ring-1 ring-primary' : 'text-muted-foreground',
              )}
            >
              {nextStep ? (
                <>
                  Sigue <span className="font-semibold text-foreground">{nextStep.label}</span>
                  {nextBlock && nextBlock.repeat > 1 ? ` ×${nextBlock.repeat}` : ''}
                  {nextChords.length > 0 && (
                    <span className="ml-1.5 font-mono text-chart-chord">{nextChords.join(' ')}</span>
                  )}
                </>
              ) : (
                'Última parte'
              )}
            </span>
            )}
          </p>
          <Button
            size="lg"
            aria-label={nextStep ? `Parte siguiente: ${nextStep.label}` : 'Parte siguiente'}
            aria-keyshortcuts="ArrowRight PageDown"
            disabled={!nextStep}
            onClick={() => stepSection(1)}
          >
            <Kbd>→</Kbd>
            Siguiente
            <ChevronRight />
          </Button>
          </div>
        </div>
      </footer>

      {chart && blocks.length > 0 && (
        <PlaybackDock
          playback={playback}
          settings={playbackSettings}
          onSettings={updatePlayback}
          media={media}
          audio={playbackAudio}
          timeline={playback.timeline}
          startLabel={partLabel}
          bottom={footerHeight + 12}
          onToggle={togglePlayback}
          cues={cues}
          escapeRef={dockEscape}
          sync={{
            leadMs,
            speed: playSpeed,
            dirty: session != null,
            canSave: Boolean(song?.editable),
            onLead: setLead,
            onSpeed: setSpeed,
            onSave: saveSync,
          }}
          marks={{
            state: marking,
            canMark: Boolean(song?.editable && audioSrc && !playback.error),
            measured: measuredParts,
            total: blocks.length,
            stale: staleMarks,
            nextLabel: marking && marking.starts.length < blocks.length ? blocks[marking.starts.length]!.label : null,
            onStart: startMarking,
            onMark: markNext,
            onUndo: undoMark,
            onDone: stopPlayback,
            onSave: saveMarks,
            onDiscard: () => setMarking(null),
            onClear: clearMarks,
          }}
          canEditDuration={Boolean(song?.editable || song?.personal)}
          onDurationChange={
            (song?.editable || song?.personal) && pickedSelected
              ? (durationMs) => {
                  setDurationOverride(durationMs)
                  void patchMedia(song.id, { durationMs }, instrument).catch((error) => console.error(error))
                }
              : (durationMs) => setDurationOverride(durationMs)
          }
          onPickSource={
            media.options.length > 1
              ? (url) => {
                  setMediaPick(url)
                  setDurationOverride(undefined)
                }
              : undefined
          }
          onMakeSelected={
            song?.editable && media.options.length > 1
              ? (url) => {
                  setMakingSelected(true)
                  void patchMedia(song.id, { selectYoutubeUrl: url }, instrument)
                    .then(() => {
                      setMediaPick(null)
                      setDurationOverride(undefined)
                    })
                    .catch((error) => console.error(error))
                    .finally(() => setMakingSelected(false))
                }
              : undefined
          }
          makingSelected={makingSelected}
        />
      )}
    </div>
  )
}

/** While playing, the footer counts down to the next part (own component: it re-renders on its own clock). */
function FooterNext({ elapsed, cues, totalMs }: { elapsed: () => number; cues: Cue[]; totalMs: number }) {
  const t = useFrameTime(elapsed, true, 500) ?? 0
  const index = cueIndexAt(cues, t)
  const next = cues[index + 1]
  const left = (next ? next.at : totalMs) - t
  const near = Boolean(next) && left <= NEAR_CUE_MS
  return (
    <span
      className={cn(
        'block max-w-full truncate rounded-md px-2 text-xs tabular-nums transition-colors motion-reduce:transition-none',
        near ? 'bg-primary/20 py-0.5 text-sm text-foreground ring-1 ring-primary' : 'text-muted-foreground',
      )}
    >
      {next ? (
        <>
          {index < 0 ? 'Empieza' : 'Sigue'} <span className="font-semibold text-foreground">{next.label}</span>
          {next.repeat > 1 ? ` ${next.pass}/${next.repeat}` : ''} en {formatClock(Math.max(0, left))}
        </>
      ) : (
        <>Última parte · termina en {formatClock(Math.max(0, left))}</>
      )}
    </span>
  )
}

/** The nav step that holds the playing line: the last slice of its part that starts at or before it. */
function playbackStep(steps: ViewportNavStep[], cursor: PlaybackCursor): ViewportNavStep | undefined {
  const own = steps.filter((step) => step.chipIds.includes(cursor.blockId))
  const line = cursor.lineIndex ?? 0
  return own.filter((step) => (step.lineIndex ?? 0) <= line).pop() ?? own[0]
}

const SHARE_HINT =
  'Una copia personal se puede compartir con todos o con una persona para que la vean. No publica el catálogo.'
const USER_HINT = 'Una persona que entra con su nombre. Tiene un rol: dueño, admin o lectura.'
const VIEWPORT_JUMPS_HINT =
  'En vivo, parte las partes largas en saltos del alto de la pantalla (menos cabecera y pie). Anterior, Siguiente y las flechas avanzan esos trozos; los chips pueden verse como Verso 1a, 1b… No cambia cómo se muestra la cifra ni los modos de plegado.'

function buildNavSteps(
  chips: ReturnType<typeof headerChips>,
  blocks: DisplayBlock[],
  options: {
    enabled: boolean
    lineHeights: Record<string, number[]>
    usableHeight: number
  },
): ViewportNavStep[] {
  const steps: ViewportNavStep[] = []
  for (const chip of chips) {
    const block = blocks.find((item) => item.id === chip.id) ?? blocks.find((item) => chip.ids.includes(item.id))
    if (!block) continue
    const baseLabel = headerChipText(chip)
    const weight = blocks
      .filter((item) => chip.ids.includes(item.id))
      .reduce((sum, item) => sum + Math.max(1, item.section.lines.length) * Math.max(1, item.repeat), 0)
    if (!options.enabled) {
      steps.push({
        key: chip.id,
        blockId: chip.id,
        lineIndex: null,
        label: baseLabel,
        chipIds: chip.ids,
        weight: Math.max(1, weight),
      })
      continue
    }
    const heights = options.lineHeights[block.id] ?? []
    const starts = heights.length ? sliceStartLines(heights, options.usableHeight) : [0]
    const count = starts.length
    starts.forEach((lineIndex, sliceIndex) => {
      steps.push({
        key: count > 1 ? sliceKey(block.id, lineIndex) : chip.id,
        blockId: chip.id,
        lineIndex: sliceIndex === 0 ? null : lineIndex,
        label: sliceChipLabel(baseLabel, sliceIndex, count),
        chipIds: chip.ids,
        weight: Math.max(1, weight / count),
      })
    })
  }
  return steps
}

function sameHeightMap(prev: Record<string, number[]>, next: Record<string, number[]>): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of nextKeys) {
    const a = prev[key]
    const b = next[key]
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
  }
  return true
}

function stepTargetTop(step: ViewportNavStep, blockId: string): number | null {
  const el =
    step.lineIndex == null
      ? document.getElementById(`sec-${blockId}`)
      : document.getElementById(`line-${blockId}-${step.lineIndex}`)
  return el?.getBoundingClientRect().top ?? null
}

function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        title={text}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="size-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border bg-popover px-2 py-1.5 text-xs leading-snug text-popover-foreground shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  )
}

function partHint(label: string, copies: number, repeat: number, index: number): string {
  const goes: Record<PartKind, string> = {
    intro: 'Va a la intro.',
    verse: 'Va al verso.',
    chorus: 'Va al coro.',
    bridge: 'Va al puente.',
    other: 'Va a esta parte.',
  }
  const bits = [goes[partKind(label)]]
  if (copies > 1) bits.push(`Sale ${copies} veces.`)
  if (repeat > 1) bits.push(`Se repite ×${repeat}.`)
  if (index < 9) bits.push(`Tecla ${index + 1}.`)
  return bits.join(' ')
}

function kindPip(kind: PartKind): string {
  if (kind === 'intro') return 'bg-muted-foreground/70'
  if (kind === 'verse') return 'bg-chart-chord'
  if (kind === 'chorus') return 'bg-primary'
  if (kind === 'bridge') return 'bg-accent-foreground/80'
  return 'bg-transparent'
}

function kindHeading(kind: PartKind): string {
  if (kind === 'intro') return 'text-muted-foreground'
  if (kind === 'verse') return 'text-chart-chord'
  if (kind === 'chorus') return 'text-primary'
  if (kind === 'bridge') return 'text-accent-foreground'
  return 'text-foreground'
}

function kindEdge(kind: PartKind): string {
  if (kind === 'intro') return 'border-muted-foreground/35'
  if (kind === 'verse') return 'border-chart-chord/45'
  if (kind === 'chorus') return 'border-primary/40'
  if (kind === 'bridge') return 'border-accent-foreground/40'
  return 'border-transparent'
}

/** Widest chart line in ch, chords included, as ChartRow lays it out. */
function widestLineCh(
  blocks: DisplayBlock[],
  songKey: string,
  semitones: number,
  spelling: ViewSettings['spelling'],
  slashAsDegree: boolean,
): number {
  let widest = 0
  for (const block of blocks) {
    for (const line of block.section.lines) {
      const placed = placeChords(
        line.chords.map((chord) => ({
          ...chord,
          name: formatChord(chord.raw, songKey, semitones, spelling, slashAsDegree),
        })),
      )
      const lyric = line.lyric == null ? 0 : displayLyric(line.lyric).trimEnd().length
      widest = Math.max(widest, lyric, placed.cursor)
    }
  }
  return widest
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest('input, textarea, select')))
  )
}
