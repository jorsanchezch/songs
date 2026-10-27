import { ChordStrip } from '@/components/ChordDiagrams'
import type { InstrumentId } from '@/lib/instruments'
import { bassShape, chordTones } from '@/lib/voicing'

const WHITE = [0, 2, 4, 5, 7, 9, 11, 0, 2, 4, 5, 7, 9, 11]
const BLACK = [1, 3, null, 6, 8, 10, null, 1, 3, null, 6, 8, 10, null]
const DRUMS = [
  { label: 'Charles', hits: [1, 1, 1, 1, 1, 1, 1, 1] },
  { label: 'Caja', hits: [0, 0, 1, 0, 0, 0, 1, 0] },
  { label: 'Bombo', hits: [1, 0, 0, 1, 0, 1, 0, 0] },
]

export function InstrumentCharts({
  instrument,
  names,
  choices,
  onChoose,
}: {
  instrument: InstrumentId
  names: string[]
  choices: Record<string, string>
  onChoose: (name: string, shapeId: string | null) => void
}) {
  if (instrument === 'drums') return <DrumPart />
  if (!names.length) return null
  if (instrument === 'piano') return <PianoStrip names={names} />
  if (instrument === 'bass') return <BassStrip names={names} />
  if (instrument === 'guitar' || instrument === 'electric_guitar') {
    return <ChordStrip names={names} choices={choices} onChoose={onChoose} />
  }
  return null
}

function PianoStrip({ names }: { names: string[] }) {
  return (
    <div className="mb-4 rounded-xl border bg-card/70 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Piano</p>
      <div className="flex gap-3 overflow-x-auto">
        {names.map((name) => (
          <PianoChord key={name} name={name} />
        ))}
      </div>
    </div>
  )
}

function PianoChord({ name }: { name: string }) {
  const chord = chordTones(name)
  const width = 168
  const keyW = 11
  const height = 78
  return (
    <figure className="shrink-0 text-center">
      <figcaption className="truncate text-xs font-semibold text-chart-chord">{name}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-16 w-40" role="img" aria-label={`Piano ${name}`}>
        {WHITE.map((pc, index) => {
          const on = chord?.tones.includes(pc)
          const root = chord?.root === pc
          return (
            <rect
              key={`w${index}`}
              x={index * keyW + 4}
              y="4"
              width={keyW - 1}
              height="62"
              rx="1"
              className={root ? 'fill-chart-chord' : on ? 'fill-primary' : undefined}
              fill={root || on ? undefined : 'white'}
              stroke="currentColor"
              strokeWidth="1"
            />
          )
        })}
        {BLACK.map((pc, index) => {
          if (pc == null) return null
          const on = chord?.tones.includes(pc)
          const root = chord?.root === pc
          return (
            <rect
              key={`b${index}`}
              x={index * keyW + keyW - 2}
              y="4"
              width="7"
              height="36"
              rx="1"
              className={root ? 'fill-chart-chord' : on ? 'fill-primary' : undefined}
              fill={root || on ? undefined : '#1c1917'}
            />
          )
        })}
      </svg>
    </figure>
  )
}

function BassStrip({ names }: { names: string[] }) {
  return (
    <div className="mb-4 rounded-xl border bg-card/70 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Bajo · fundamental</p>
      <div className="flex gap-2 overflow-x-auto">
        {names.map((name) => {
          const shape = bassShape(name)
          return shape ? <BassDiagram key={name} name={name} frets={shape.frets} startFret={shape.startFret} /> : null
        })}
      </div>
    </div>
  )
}

function BassDiagram({ name, frets, startFret }: { name: string; frets: number[]; startFret: number }) {
  const left = 18
  const top = 22
  const gapX = 14
  const gapY = 14
  const rows = 4
  return (
    <figure className="w-[4.4rem] shrink-0 text-center">
      <figcaption className="truncate text-xs font-semibold text-chart-chord">{name}</figcaption>
      <svg viewBox="0 0 78 90" className="mt-1 h-20 w-full" role="img" aria-label={`Bajo ${name}`}>
        {startFret > 1 && (
          <text x="2" y={top + 10} className="fill-muted-foreground text-[10px]">
            {startFret}
          </text>
        )}
        {Array.from({ length: rows + 1 }, (_, row) => (
          <line
            key={row}
            x1={left}
            x2={left + 3 * gapX}
            y1={top + row * gapY}
            y2={top + row * gapY}
            className="stroke-foreground"
            strokeWidth={row === 0 && startFret === 1 ? 3 : 1}
          />
        ))}
        {frets.map((_, string) => (
          <line
            key={string}
            x1={left + string * gapX}
            x2={left + string * gapX}
            y1={top}
            y2={top + rows * gapY}
            className="stroke-foreground"
          />
        ))}
        {frets.map((fret, string) => {
          if (fret < 0) return null
          if (fret === 0) {
            return (
              <circle
                key={string}
                cx={left + string * gapX}
                cy="12"
                r="3.5"
                className="fill-none stroke-chart-chord"
                strokeWidth="1.4"
              />
            )
          }
          const offset = fret - startFret
          if (offset < 0 || offset >= rows) return null
          return (
            <circle
              key={string}
              cx={left + string * gapX}
              cy={top + offset * gapY + gapY / 2}
              r="4"
              className="fill-chart-chord"
            />
          )
        })}
      </svg>
    </figure>
  )
}

function DrumPart() {
  return (
    <div className="mb-4 rounded-xl border bg-card/70 px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">Batería · patrón de la parte</p>
      <div className="mt-2 grid grid-cols-[4.5rem_repeat(8,minmax(0,1fr))] items-center gap-y-1 text-center text-[10px]">
        <span />
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="text-muted-foreground">
            {index + 1}
          </span>
        ))}
        {DRUMS.map((row) => (
          <DrumRow key={row.label} label={row.label} hits={row.hits} />
        ))}
      </div>
    </div>
  )
}

function DrumRow({ label, hits }: { label: string; hits: number[] }) {
  return (
    <>
      <span className="text-left text-xs font-medium">{label}</span>
      {hits.map((hit, index) => (
        <span key={index} className="flex justify-center" aria-hidden>
          <span className={hit ? 'size-2.5 rounded-full bg-chart-chord' : 'size-1.5 rounded-full bg-muted-foreground/40'} />
        </span>
      ))}
    </>
  )
}
