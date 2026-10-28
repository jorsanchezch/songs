import { useMemo } from 'react'
import { distinctMarks, markTone, SONG_ICON_SHAPES, SONG_MARK_HUES, type MarkLook } from '@/lib/songMark'
import { WEEKDAYS } from '@/lib/setlists'
import { SongMarkShape } from '@/components/SongMark'
import { cn } from '@/lib/utils'

/** Shapes and tones for the lists on screen. No two lists look the same. */
export function useListMarks(ids: string[]) {
  const key = ids.join('\n')
  return useMemo(() => distinctMarks(key ? key.split('\n') : []), [key])
}

const tile = 'inline-flex size-9 shrink-0 items-center justify-center rounded-md'
const edge = 'inset 0 0 0 1px oklch(0.25 0.03 280 / 0.18)'

export function ListMark({ look, className }: { look?: MarkLook; className?: string }) {
  if (!look) return null
  const tone = markTone(look.tone)
  return (
    <span
      className={cn(tile, className)}
      style={{ backgroundColor: tone.background, color: tone.foreground, boxShadow: edge }}
      aria-hidden="true"
    >
      <SongMarkShape shape={SONG_ICON_SHAPES[look.shape] ?? SONG_ICON_SHAPES[0] ?? []} />
    </span>
  )
}

/** A calendar header over the week, Monday first. The service day is the tall bar. */
export function WeekdayMark({ weekday, className }: { weekday: number; className?: string }) {
  const position = WEEKDAYS.findIndex((day) => day.id === weekday)
  if (position < 0) return null
  // Each service day keeps its own deep color.
  const tone = markTone(SONG_MARK_HUES.length + ((weekday * 5) % SONG_MARK_HUES.length))
  return (
    <span
      className={cn(tile, className)}
      style={{ backgroundColor: tone.background, color: tone.foreground, boxShadow: edge }}
      title={WEEKDAYS[position]?.name}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="size-7" fill="currentColor" stroke="none">
        <rect x="1" y="1.2" width="14" height="3" rx="1" />
        {WEEKDAYS.map((day, index) => {
          const x = 1.05 + index * 2.05
          return day.id === weekday ? (
            <rect key={day.id} x={x - 0.2} y="5.6" width="2" height="9.2" rx="0.8" />
          ) : (
            <rect key={day.id} x={x} y="11.8" width="1.6" height="3" rx="0.6" opacity="0.4" />
          )
        })}
      </svg>
    </span>
  )
}
