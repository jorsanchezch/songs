import { cn } from '@/lib/utils'

export type KeyMark = { note: number; label?: string; root?: boolean }

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
/** White key index, within the octave, that each black key sits after. */
const BLACK_AFTER: [pc: number, white: number][] = [
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
]

export function PianoKeys({
  marks,
  octaves = 2,
  showLabels = false,
  className,
  label,
}: {
  marks: KeyMark[]
  octaves?: number
  showLabels?: boolean
  className?: string
  label: string
}) {
  const keyW = 20
  const whiteH = 84
  const blackW = 12
  const blackH = 52
  const byNote = new Map(marks.map((mark) => [mark.note, mark]))
  const whites = Array.from({ length: octaves * 7 }, (_, index) => ({
    note: Math.floor(index / 7) * 12 + (WHITE_PCS[index % 7] ?? 0),
    x: index * keyW + 1,
  }))
  const blacks = Array.from({ length: octaves }, (_, octave) =>
    BLACK_AFTER.map(([pc, white]) => ({
      note: octave * 12 + pc,
      x: (octave * 7 + white + 1) * keyW + 1 - blackW / 2,
    })),
  ).flat()

  return (
    <svg
      viewBox={`0 0 ${octaves * 7 * keyW + 2} ${whiteH + 2}`}
      className={cn('block', className)}
      role="img"
      aria-label={label}
    >
      {whites.map(({ note, x }) => {
        const mark = byNote.get(note)
        return (
          <g key={`w${note}`}>
            <rect
              x={x}
              y="1"
              width={keyW - 1}
              height={whiteH}
              rx="2"
              className={mark?.root ? 'fill-chart-chord' : mark ? 'fill-study-tone' : undefined}
              fill={mark ? undefined : 'white'}
              stroke="#78716c"
              strokeWidth="1"
            />
            {showLabels && mark?.label && (
              <text
                x={x + (keyW - 1) / 2}
                y={whiteH - 8}
                textAnchor="middle"
                className={cn('text-[9px] font-semibold', mark.root ? 'fill-background' : 'fill-white')}
              >
                {mark.label}
              </text>
            )}
          </g>
        )
      })}
      {blacks.map(({ note, x }) => {
        const mark = byNote.get(note)
        return (
          <g key={`b${note}`}>
            <rect
              x={x}
              y="1"
              width={blackW}
              height={blackH}
              rx="1.5"
              className={mark?.root ? 'fill-chart-chord' : mark ? 'fill-study-tone' : undefined}
              fill={mark ? undefined : '#1c1917'}
              stroke={mark ? '#1c1917' : undefined}
              strokeWidth="1"
            />
            {showLabels && mark?.label && (
              <text
                x={x + blackW / 2}
                y={blackH - 6}
                textAnchor="middle"
                className={cn('text-[7.5px] font-semibold', mark.root ? 'fill-background' : 'fill-white')}
              >
                {mark.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** High e on top, as in tablature. */
const STRINGS_TOP_DOWN = [4, 11, 7, 2, 9, 4]
const INLAYS = [3, 5, 7, 9, 15]

export function Fretboard({
  tones,
  root,
  labelFor,
  showAll = false,
  frets = 15,
}: {
  tones: number[]
  root: number
  labelFor: (pc: number) => string
  showAll?: boolean
  frets?: number
}) {
  const left = 26
  const top = 12
  const gapX = 34
  const gapY = 18
  const width = left + frets * gapX + 8
  const bottom = top + 5 * gapY
  const xFor = (fret: number) => (fret === 0 ? left - 13 : left + (fret - 0.5) * gapX)
  const middle = top + 2.5 * gapY

  return (
    <svg viewBox={`0 0 ${width} ${bottom + 22}`} className="block w-full min-w-[36rem]" role="img" aria-label="Diapasón">
      {INLAYS.filter((fret) => fret <= frets).map((fret) => (
        <circle key={fret} cx={xFor(fret)} cy={middle} r="4" className="fill-muted" />
      ))}
      {frets >= 12 && (
        <>
          <circle cx={xFor(12)} cy={top + 1.5 * gapY} r="4" className="fill-muted" />
          <circle cx={xFor(12)} cy={top + 3.5 * gapY} r="4" className="fill-muted" />
        </>
      )}
      {Array.from({ length: frets + 1 }, (_, fret) => (
        <line
          key={fret}
          x1={left + fret * gapX}
          x2={left + fret * gapX}
          y1={top}
          y2={bottom}
          className="stroke-muted-foreground"
          strokeWidth={fret === 0 ? 4 : 1}
        />
      ))}
      {STRINGS_TOP_DOWN.map((_, string) => (
        <line
          key={string}
          x1={left}
          x2={left + frets * gapX}
          y1={top + string * gapY}
          y2={top + string * gapY}
          className="stroke-foreground/70"
          strokeWidth={0.8 + string * 0.25}
        />
      ))}
      {Array.from({ length: frets }, (_, index) => index + 1)
        .filter((fret) => INLAYS.includes(fret) || fret === 12 || fret === 1)
        .map((fret) => (
          <text key={fret} x={xFor(fret)} y={bottom + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {fret}
          </text>
        ))}
      {STRINGS_TOP_DOWN.map((open, string) =>
        Array.from({ length: frets + 1 }, (_, fret) => {
          const pc = (open + fret) % 12
          const x = xFor(fret)
          const y = top + string * gapY
          if (!tones.includes(pc)) {
            if (!showAll) return null
            return (
              <text
                key={`${string}-${fret}`}
                x={x}
                y={y + 3}
                textAnchor="middle"
                className="fill-muted-foreground/70 text-[8px]"
              >
                {labelFor(pc)}
              </text>
            )
          }
          const isRoot = pc === root
          return (
            <g key={`${string}-${fret}`}>
              <circle cx={x} cy={y} r="7.5" className={isRoot ? 'fill-chart-chord' : 'fill-study-tone'} />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                className={cn('text-[8.5px] font-semibold', isRoot ? 'fill-background' : 'fill-white')}
              >
                {labelFor(pc)}
              </text>
            </g>
          )
        }),
      )}
    </svg>
  )
}
