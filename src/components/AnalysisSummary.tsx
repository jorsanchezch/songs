import { Button } from '@/components/ui/button'
import type { AudioAnalysis } from '@/lib/audioAnalysis'
import { formatDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

const bpmText = (bpm: number) => String(Math.round(bpm * 10) / 10).replace('.', ',')

export function confidenceWord(confidence: number): string {
  return confidence >= 0.75 ? 'alta' : confidence >= 0.5 ? 'media' : 'baja'
}

/** What the analysis found, with one-tap fixes for the song's BPM and length. */
export function AnalysisSummary({
  analysis,
  bpm,
  durationMs,
  onBpm,
  onDuration,
  onRetempo,
  className,
}: {
  analysis: AudioAnalysis
  /** What the song stores now. */
  bpm: number | null
  durationMs: number | null
  onBpm?: (bpm: number) => void
  onDuration?: (ms: number) => void
  /** Count the pulse at another level (re-reads the audio). */
  onRetempo?: (bpm: number) => void
  className?: string
}) {
  const found = analysis.grid.bpm
  const sameBpm = bpm != null && Math.abs(bpm - found) < 0.6
  const sameLength = durationMs != null && Math.abs(durationMs - analysis.durationMs) < 2000
  const matching = bpm == null ? null : analysis.alternatives.find((item) => Math.abs(item.bpm - bpm) < 1.2)
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm font-normal', className)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-base font-semibold tabular-nums">{bpmText(found)} BPM</span>
        <span className="text-muted-foreground">
          {analysis.grid.beatsPerBar}/4 · confianza {confidenceWord(analysis.confidence)}
          {analysis.driftMs > 60 ? ' · tempo irregular' : ''}
        </span>
        {onBpm && !sameBpm ? (
          <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-sm" onClick={() => onBpm(Math.round(found))}>
            Usar {bpmText(Math.round(found))}
          </Button>
        ) : sameBpm ? (
          <span className="text-muted-foreground">= guardado</span>
        ) : null}
      </p>
      {matching ? (
        <p className="text-muted-foreground">
          Tu {bpmText(bpm!)} BPM es la misma pulsación contada a {matching.label}: no hace falta cambiarlo.
        </p>
      ) : null}
      {!sameBpm && !matching && bpm != null ? <p className="text-muted-foreground">Guardado: {bpmText(bpm)} BPM.</p> : null}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular-nums">Duración {formatDurationMmSs(analysis.durationMs)}</span>
        {onDuration && !sameLength ? (
          <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-sm" onClick={() => onDuration(analysis.durationMs)}>
            Usar {formatDurationMmSs(analysis.durationMs)}
            {durationMs ? ` (era ${formatDurationMmSs(durationMs)})` : ''}
          </Button>
        ) : sameLength ? (
          <span className="text-muted-foreground">= guardada</span>
        ) : null}
      </p>
      {onRetempo || onBpm ? (
        <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
          ¿Otro nivel?
          {analysis.alternatives.map((item) => (
            <Button
              key={item.label}
              type="button"
              size="sm"
              variant={matching?.label === item.label ? 'secondary' : 'ghost'}
              className="h-8 px-2.5 text-sm tabular-nums"
              title={`Contar el pulso a ${item.label}: ${bpmText(item.bpm)} BPM.`}
              onClick={() => (onRetempo ? onRetempo(item.bpm) : onBpm?.(Math.round(item.bpm)))}
            >
              {item.label} · {bpmText(item.bpm)}
            </Button>
          ))}
        </p>
      ) : null}
    </div>
  )
}
