import { songIconIndex, songMarkTone, SONG_ICON_SHAPES } from '@/lib/songMark'
import { cn } from '@/lib/utils'

/** A colored tile with the song's shape. Both come from the id, so a song always looks the same. */
export function SongMark({ songId, className }: { songId: string; className?: string }) {
  const shape = SONG_ICON_SHAPES[songIconIndex(songId)] ?? SONG_ICON_SHAPES[0]
  const tone = songMarkTone(songId)
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md',
        className,
      )}
      style={{
        backgroundColor: tone.background,
        color: tone.foreground,
        boxShadow: 'inset 0 0 0 1px oklch(0.25 0.03 280 / 0.18)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="size-5" fill="currentColor" stroke="none">
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
    </span>
  )
}
