import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/utils'
import type { SelectOption } from '@/components/ui/select'

/** One-of-few choice as a row of chips. Arrow keys move between them. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = 'default',
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  options: SelectOption<T>[]
  size?: 'default' | 'sm'
  disabled?: boolean
  className?: string
  'aria-label': string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('inline-flex flex-wrap rounded-md border border-input bg-background p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-4px)] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground [&_svg]:size-4 [&_svg]:shrink-0',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
