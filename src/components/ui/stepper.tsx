import { useEffect, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** − number + . Typing works too; arrows step. `null` means empty. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  start,
  label,
  placeholder,
  size = 'default',
  decreaseIcon = <Minus />,
  increaseIcon = <Plus />,
  decreaseLabel,
  increaseLabel,
  title,
  className,
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** First value when stepping from empty. */
  start?: number
  label: string
  placeholder?: string
  size?: 'default' | 'sm' | 'xs'
  decreaseIcon?: ReactNode
  increaseIcon?: ReactNode
  decreaseLabel?: string
  increaseLabel?: string
  title?: string
  className?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const nullable = placeholder !== undefined

  const bump = (delta: number) => {
    const base = value ?? start ?? min
    onChange(clamp(value == null ? base : base + delta, min, max))
  }
  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      onChange(nullable ? null : min)
      return
    }
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) onChange(clamp(Math.round(parsed), min, max))
    else setText(value == null ? '' : String(value))
  }

  const button = cn(
    'inline-flex shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40',
    size === 'xs' ? 'size-5 [&_svg]:size-3' : size === 'sm' ? 'size-7 [&_svg]:size-3.5' : 'size-8 [&_svg]:size-4',
  )
  return (
    <span
      role="group"
      aria-label={label}
      title={title}
      className={cn(
        'inline-flex items-center rounded-md border border-input bg-background',
        size === 'xs' ? 'h-6 gap-0' : size === 'sm' ? 'h-8 gap-0.5 px-0.5' : 'h-10 gap-0.5 px-1',
        className,
      )}
    >
      <button
        type="button"
        className={button}
        aria-label={decreaseLabel ?? `Bajar ${label}`}
        disabled={value != null && value <= min}
        onClick={() => bump(-step)}
      >
        {decreaseIcon}
      </button>
      <input
        value={text}
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = Number(event.target.value)
          if (event.target.value.trim() && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            onChange(Math.round(parsed))
          }
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            bump(step)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            bump(-step)
          } else if (event.key === 'Enter') commit(event.currentTarget.value)
        }}
        className={cn(
          'min-w-0 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground',
          size === 'xs' ? 'w-7 text-xs' : size === 'sm' ? 'w-9 text-sm' : 'w-12 text-base',
        )}
      />
      <button
        type="button"
        className={button}
        aria-label={increaseLabel ?? `Subir ${label}`}
        disabled={value != null && value >= max}
        onClick={() => bump(step)}
      >
        {increaseIcon}
      </button>
    </span>
  )
}
