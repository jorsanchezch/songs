import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Select as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export type SelectOption<T extends string = string> = {
  value: T
  label: string
  icon?: ReactNode
}

// Radix reserves '' for “no value”, so an empty option rides on this.
const NONE = '__none__'

/** Radix Select styled like Input. An option with value '' works as “none”. */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  size = 'default',
  disabled,
  className,
  title,
  'aria-label': ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  size?: 'default' | 'sm'
  disabled?: boolean
  className?: string
  title?: string
  'aria-label'?: string
}) {
  const current = options.find((option) => option.value === value)
  return (
    <Primitive.Root
      value={value === '' ? (current ? NONE : '') : value}
      onValueChange={(next) => onValueChange((next === NONE ? '' : next) as T)}
      disabled={disabled}
    >
      <Primitive.Trigger
        aria-label={ariaLabel}
        title={title}
        className={cn(
          'inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[placeholder]:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0',
          size === 'sm' ? 'h-8 px-2 text-xs [&_svg]:size-3.5' : 'h-10 px-3 text-sm',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <Primitive.Value placeholder={placeholder}>
            {current ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {current.icon}
                <span className="truncate">{current.label}</span>
              </span>
            ) : null}
          </Primitive.Value>
        </span>
        <Primitive.Icon asChild>
          <ChevronDown className="opacity-60" />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <Primitive.Viewport className="p-1">
            {options.map((option) => (
              <Primitive.Item
                key={option.value || NONE}
                value={option.value || NONE}
                className={cn(
                  'relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0',
                  size === 'sm' ? 'text-xs' : 'text-sm',
                )}
              >
                {option.icon}
                <Primitive.ItemText>{option.label}</Primitive.ItemText>
                <Primitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check />
                </Primitive.ItemIndicator>
              </Primitive.Item>
            ))}
          </Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
