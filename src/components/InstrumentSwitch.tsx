import { INSTRUMENTS, type InstrumentId } from '@/lib/instruments'
import { cn } from '@/lib/utils'

export function InstrumentSwitch({
  value,
  onChange,
}: {
  value: InstrumentId
  onChange: (id: InstrumentId) => void
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Instrumento">
      {INSTRUMENTS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium',
            value === item.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
