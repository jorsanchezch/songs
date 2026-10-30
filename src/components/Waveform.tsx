import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { BeatGrid } from '@/lib/audioAnalysis'
import { cn } from '@/lib/utils'

export type WaveMark = { ms: number; label?: string }

/**
 * The song's waveform with the playhead, optional bar lines and part markers.
 * Click or drag to seek. Played sound is drawn in the accent color.
 */
export function Waveform({
  peaks,
  durationMs,
  timeMs,
  grid,
  marks,
  onSeek,
  height = 56,
  className,
  label = 'Onda del audio',
}: {
  peaks: number[]
  durationMs: number
  timeMs: number
  grid?: BeatGrid | null
  marks?: WaveMark[]
  onSeek?: (ms: number) => void
  height?: number
  className?: string
  label?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const [size, setSize] = useState(0)

  useEffect(() => {
    const element = canvas.current
    const host = wrap.current
    if (!element || !host || !peaks.length || durationMs <= 0) return
    const ratio = window.devicePixelRatio || 1
    const width = host.clientWidth
    if (!width) return
    void size
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
    const ctx = element.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, width, height)
    const accent = getComputedStyle(host).color
    const quiet = getComputedStyle(element).color
    const mid = height / 2
    const played = Math.max(0, Math.min(1, timeMs / durationMs)) * width

    for (let x = 0; x < width; x += 2) {
      const from = Math.floor((x / width) * peaks.length)
      const to = Math.max(from + 1, Math.floor(((x + 2) / width) * peaks.length))
      let top = 0
      for (let i = from; i < Math.min(peaks.length, to); i += 1) top = Math.max(top, peaks[i]!)
      const half = Math.max(1, top * (mid - 2))
      ctx.fillStyle = x < played ? accent : quiet
      ctx.globalAlpha = x < played ? 1 : 0.55
      ctx.fillRect(x, mid - half, 1.4, half * 2)
    }

    if (grid) {
      const barMs = (60_000 / grid.bpm) * grid.beatsPerBar
      const spacing = (barMs / durationMs) * width
      if (spacing > 0.5) {
        let every = 1
        while (spacing * every < 7) every *= 2
        ctx.fillStyle = quiet
        ctx.globalAlpha = 0.35
        const first = Math.ceil(-grid.anchorMs / barMs)
        for (let bar = first; grid.anchorMs + bar * barMs <= durationMs; bar += 1) {
          if (bar % every) continue
          const x = ((grid.anchorMs + bar * barMs) / durationMs) * width
          ctx.fillRect(x, bar % (every * 4) === 0 ? 0 : height - 6, 1, bar % (every * 4) === 0 ? height : 6)
        }
      }
    }

    ctx.globalAlpha = 1
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    for (const mark of marks ?? []) {
      const x = Math.round((mark.ms / durationMs) * width)
      ctx.fillStyle = accent
      ctx.fillRect(x, 0, 2, height)
      if (mark.label) {
        const text = mark.label.length > 9 ? `${mark.label.slice(0, 8)}…` : mark.label
        const room = width - x - 4
        if (ctx.measureText(text).width < room) ctx.fillText(text, x + 4, 1)
      }
    }
    // Playhead.
    ctx.fillStyle = accent
    ctx.fillRect(Math.max(0, played - 1), 0, 2, height)
  }, [peaks, durationMs, timeMs, grid, marks, height, size])

  // Redraw when the width changes.
  useEffect(() => {
    const host = wrap.current
    if (!host) return
    const observer = new ResizeObserver(() => setSize(host.clientWidth))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const seekTo = (event: PointerEvent) => {
    const host = wrap.current
    if (!host || !onSeek) return
    const box = host.getBoundingClientRect()
    onSeek(Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * durationMs))
  }
  const onKey = (event: KeyboardEvent) => {
    if (!onSeek) return
    const step = event.shiftKey ? 15_000 : 5_000
    if (event.key === 'ArrowLeft') onSeek(Math.max(0, timeMs - step))
    else if (event.key === 'ArrowRight') onSeek(Math.min(durationMs, timeMs + step))
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={wrap}
      role={onSeek ? 'slider' : 'img'}
      aria-label={label}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? Math.round(durationMs / 1000) : undefined}
      aria-valuenow={onSeek ? Math.round(timeMs / 1000) : undefined}
      tabIndex={onSeek ? 0 : undefined}
      style={{ height }}
      className={cn('relative w-full touch-none select-none text-primary', onSeek && 'cursor-pointer', className)}
      onKeyDown={onKey}
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        seekTo(event)
      }}
      onPointerMove={(event) => dragging.current && seekTo(event)}
      onPointerUp={() => (dragging.current = false)}
    >
      <canvas ref={canvas} style={{ width: '100%', height }} className="block text-muted-foreground" />
    </div>
  )
}
