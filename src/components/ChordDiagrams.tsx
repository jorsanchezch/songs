import { useState } from 'react'
import { diagramFor, shapesFor, type Diagram } from '@/lib/guitar'
import { cn } from '@/lib/utils'

export function ChordDiagram({ diagram, size = 'sm' }: { diagram: Diagram; size?: 'sm' | 'lg' }) {
  const left = 18
  const top = 28
  const gapX = 10
  const gapY = 14
  const rows = 4
  const barre = barreSpan(diagram.frets)

  return (
    <figure className={cn('shrink-0 text-center', size === 'lg' ? 'w-[5.6rem]' : 'w-[4.6rem]')}>
      <figcaption className={cn('truncate font-semibold text-chart-chord', size === 'lg' ? 'text-sm' : 'text-xs')}>
        {diagram.name}
      </figcaption>
      <svg
        viewBox="0 0 78 96"
        className={cn('mt-1 w-full', size === 'lg' ? 'h-[6.6rem]' : 'h-[5.4rem]')}
        role="img"
        aria-label={diagram.name}
      >
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

export function ChordStrip({
  names,
  choices,
  onChoose,
}: {
  names: string[]
  choices: Record<string, string>
  onChoose: (name: string, shapeId: string | null) => void
}) {
  const [openName, setOpenName] = useState<string | null>(null)
  const active = openName && names.includes(openName) ? openName : null
  const options = active ? shapesFor(active) : []
  const selectedId = active ? (choices[active] ?? options[0]?.id) : undefined

  return (
    <div className="mb-4 rounded-xl border bg-card/70 px-3 py-2">
      <div className="flex gap-1 overflow-x-auto">
        {names.map((name) => (
          <ChordBox
            key={name}
            name={name}
            shapeId={choices[name]}
            open={active === name}
            onToggle={() => setOpenName(active === name ? null : name)}
          />
        ))}
      </div>
      {active && options.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Forma de {active}</p>
            {choices[active] && (
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => onChoose(active, null)}
              >
                Forma inicial
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {options.map((shape) => (
              <button
                key={shape.id}
                type="button"
                aria-pressed={shape.id === selectedId}
                aria-label={`${shapeLabel(shape)} de ${active}`}
                className={cn(
                  'rounded-lg px-1 pb-1',
                  shape.id === selectedId && 'bg-primary/15 ring-2 ring-primary',
                )}
                onClick={() => onChoose(active, shape.id)}
              >
                <ChordDiagram diagram={shape} />
                <span className="block text-[10px] text-muted-foreground">{shapeLabel(shape)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function shapeLabel(diagram: Diagram): string {
  const pressed = diagram.frets.filter((fret) => fret > 0)
  if (!pressed.length || diagram.frets.some((fret) => fret === 0)) return 'Al aire'
  return `Traste ${Math.min(...pressed)}`
}

function barreSpan(frets: number[]): { fret: number; from: number; to: number } | null {
  const pressed = frets.filter((fret) => fret > 0)
  if (!pressed.length || frets.includes(0)) return null
  const fret = Math.min(...pressed)
  const indexes = frets.flatMap((value, index) => (value === fret ? [index] : []))
  const from = indexes[0]
  const to = indexes[indexes.length - 1]
  if (from == null || to == null || to - from < 2) return null
  const covered = frets.slice(from, to + 1).every((value) => value >= fret)
  return covered ? { fret, from, to } : null
}

function ChordBox({
  name,
  shapeId,
  open,
  onToggle,
}: {
  name: string
  shapeId?: string
  open: boolean
  onToggle: () => void
}) {
  const diagram = diagramFor(name, shapeId)
  if (!diagram) {
    return (
      <figure className="w-[4.6rem] shrink-0 text-center">
        <figcaption className="truncate text-xs font-semibold">{name}</figcaption>
        <p className="mt-6 text-[10px] text-muted-foreground">Sin forma</p>
      </figure>
    )
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`Cambiar forma de ${name}`}
      className={cn('rounded-lg px-1', open && 'bg-primary/10')}
      onClick={onToggle}
    >
      <ChordDiagram diagram={diagram} />
    </button>
  )
}
