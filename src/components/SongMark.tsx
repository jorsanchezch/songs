import { useMemo } from 'react'
import {
  lettersForSong,
  songIconIndex,
  songMarkLetters,
  songMarkTone,
  SONG_ICON_SHAPES,
  type SongRef,
} from '@/lib/songMark'
import { cn } from '@/lib/utils'

export function useSongMarks(songs: SongRef[]) {
  return useMemo(() => songMarkLetters(songs), [songs])
}

export function SongMark({
  songId,
  letters,
  className,
}: {
  songId: string
  letters: string
  className?: string
}) {
  const shape = SONG_ICON_SHAPES[songIconIndex(songId)] ?? SONG_ICON_SHAPES[0]
  const tone = songMarkTone(songId)
  return (
    <span
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md pr-2 pl-1.5 text-sm font-bold leading-none tracking-wide',
        className,
      )}
      style={{
        backgroundColor: tone.background,
        color: tone.foreground,
        boxShadow: 'inset 0 0 0 1px oklch(0.25 0.03 280 / 0.18)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="size-6" fill="currentColor" stroke="none">
        {shape?.map((part, index) => {
          if (part.type === 'circle') return <circle key={index} cx={part.cx} cy={part.cy} r={part.r} />
          if (part.type === 'rect') {
            return <rect key={index} x={part.x} y={part.y} width={part.width} height={part.height} rx={part.rx} />
          }
          if (part.type === 'ellipse') {
            return (
              <ellipse
                key={index}
                cx={part.cx}
                cy={part.cy}
                rx={part.rx}
                ry={part.ry}
                transform={`rotate(${part.rotate} ${part.cx} ${part.cy})`}
              />
            )
          }
          return <path key={index} d={part.d} />
        })}
      </svg>
      <span>{letters}</span>
    </span>
  )
}

export function markLetters(marks: Map<string, string>, song: SongRef): string {
  return lettersForSong(marks, song)
}
