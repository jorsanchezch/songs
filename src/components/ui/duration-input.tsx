import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatDurationMmSs, parseDurationMmSs } from '@/lib/songMedia'
import { cn } from '@/lib/utils'

/** m:ss field. Takes “4:05” or plain seconds (“245”); tidies up on blur. */
export function DurationInput({
  value,
  onChange,
  className,
  title,
  'aria-label': ariaLabel,
}: {
  value: number | null | undefined
  onChange: (ms: number | null) => void
  className?: string
  title?: string
  'aria-label': string
}) {
  const [text, setText] = useState(formatDurationMmSs(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(formatDurationMmSs(value))
  }, [focused, value])
  const invalid = Boolean(text.trim()) && parseDurationMmSs(text) == null

  return (
    <span className="flex flex-col gap-1">
      <Input
        value={text}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={title}
        placeholder="4:00"
        inputMode="numeric"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setText(event.target.value)
          const ms = parseDurationMmSs(event.target.value)
          if (ms != null || !event.target.value.trim()) onChange(ms)
        }}
        onBlur={() => setFocused(false)}
        className={cn('tabular-nums', invalid && 'border-destructive', className)}
      />
      {invalid ? (
        <span className="text-xs font-normal text-destructive" role="alert">
          Usa m:ss, como 4:05, o los segundos.
        </span>
      ) : null}
    </span>
  )
}
