import type { Diagram } from '@/lib/guitar'
import { diagramFor } from '@/lib/guitar'

export function ChordDiagram({ diagram }: { diagram: Diagram }) {
  const left = 18
  const top = 28
  const gapX = 10
  const gapY = 14
  const rows = 4
  const barre = barreSpan(diagram.frets)

  return (
    <figure className="w-[4.6rem] shrink-0 text-center">
      <figcaption className="truncate text-xs font-semibold text-chart-chord">{diagram.name}</figcaption>
      <svg viewBox="0 0 78 96" className="mt-1 h-[5.4rem] w-full" role="img" aria-label={diagram.name}>
        {diagram.frets.map((fret, index) => {
          const x = left + index * gapX
          if (fret === -1) {
            return (
              <text key={index} x={x} y="16" textAnchor="middle" className="fill-muted-foreground text-[11px]">
                ×
              </text>
            )
          }
          if (fret === 0) {
            return (
              <circle key={index} cx={x} cy="12" r="3.5" className="fill-none stroke-foreground" strokeWidth="1.2" />
            )
          }
          return null
        })}
        {diagram.startFret > 1 && (
          <text x="4" y={top + gapY * 0.72} className="fill-muted-foreground text-[10px]">
            {diagram.startFret}
          </text>
        )}
        {Array.from({ length: rows + 1 }, (_, row) => (
          <line
            key={row}
            x1={left}
            x2={left + 5 * gapX}
            y1={top + row * gapY}
            y2={top + row * gapY}
            className="stroke-foreground"
            strokeWidth={row === 0 && diagram.startFret === 1 ? 3 : 1}
          />
        ))}
        {Array.from({ length: 6 }, (_, string) => (
          <line
            key={string}
            x1={left + string * gapX}
            x2={left + string * gapX}
            y1={top}
            y2={top + rows * gapY}
            className="stroke-foreground"
            strokeWidth="1"
          />
        ))}
        {barre && (
          <rect
            x={left + barre.from * gapX - 4}
            y={top + (barre.fret - diagram.startFret) * gapY + gapY / 2 - 4}
            width={(barre.to - barre.from) * gapX + 8}
            height="8"
            rx="4"
            className="fill-chart-chord"
          />
        )}
        {diagram.frets.map((fret, index) => {
          if (fret <= 0) return null
          if (barre && fret === barre.fret) return null
          const offset = fret - diagram.startFret
          if (offset < 0 || offset >= rows) return null
          return (
            <circle
              key={index}
              cx={left + index * gapX}
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

export function ChordStrip({ names }: { names: string[] }) {
  return (
    <div className="mb-4 flex gap-3 overflow-x-auto rounded-xl border bg-card/70 px-3 py-2">
      {names.map((name) => (
        <ChordBox key={name} name={name} />
      ))}
    </div>
  )
}

function barreSpan(frets: number[]): { fret: number; from: number; to: number } | null {
  const pressed = frets.filter((fret) => fret > 0)
  if (!pressed.length) return null
  const fret = Math.min(...pressed)
  const indexes = frets.flatMap((value, index) => (value === fret ? [index] : []))
  const from = indexes[0]
  const to = indexes[indexes.length - 1]
  if (from == null || to == null || to - from < 2) return null
  const covered = frets.slice(from, to + 1).every((value) => value >= fret)
  return covered ? { fret, from, to } : null
}

function ChordBox({ name }: { name: string }) {
  const diagram = diagramFor(name)
  if (!diagram) {
    return (
      <figure className="w-[4.6rem] shrink-0 text-center">
        <figcaption className="truncate text-xs font-semibold">{name}</figcaption>
        <p className="mt-6 text-[10px] text-muted-foreground">Sin forma</p>
      </figure>
    )
  }
  return <ChordDiagram diagram={diagram} />
}
