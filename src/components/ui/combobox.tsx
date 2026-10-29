import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { cn } from '@/lib/utils'

function fold(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
}

/** Free text with type-to-filter suggestions underneath. */
export function Combobox({
  value,
  onChange,
  suggestions,
  placeholder,
  clearLabel,
  icon,
  title,
  className,
  inputClassName,
  onBlur,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  /** Shows an × that empties the field. */
  clearLabel?: string
  icon?: ReactNode
  title?: string
  className?: string
  inputClassName?: string
  onBlur?: () => void
  'aria-label': string
}) {
  const id = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const matches = useMemo(() => {
    const needle = typed ? fold(value.trim()) : ''
    const unique = [...new Set(suggestions.filter(Boolean))]
    return (needle ? unique.filter((item) => fold(item).includes(needle)) : unique).slice(0, 60)
  }, [suggestions, typed, value])
  const shown = open && matches.length > 0

  const pick = (item: string) => {
    onChange(item)
    setOpen(false)
    setTyped(false)
    setActive(-1)
  }

  return (
    <Popover.Root open={shown} onOpenChange={(next) => !next && setOpen(false)}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={cn('relative min-w-0', className)}>
          {icon ? (
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <input
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={shown}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
            autoComplete="off"
            title={title}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value)
              setTyped(true)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => {
              setTyped(false)
              setOpen(true)
            }}
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false)
              setActive(-1)
              onBlur?.()
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setOpen(true)
                const delta = event.key === 'ArrowDown' ? 1 : -1
                setActive((index) => (matches.length ? (index + delta + matches.length) % matches.length : -1))
              } else if (event.key === 'Enter' && shown && active >= 0 && matches[active] !== undefined) {
                event.preventDefault()
                pick(matches[active]!)
              } else if (event.key === 'Escape' && shown) {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
              }
            }}
            className={cn(
              'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              icon && 'pl-9',
              clearLabel && value && 'pr-9',
              inputClassName,
            )}
          />
          {clearLabel && value ? (
            <button
              type="button"
              aria-label={clearLabel}
              title={clearLabel}
              className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => pick('')}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchorRef.current?.contains(event.target)) event.preventDefault()
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-[min(18rem,var(--radix-popover-content-available-height))] overflow-auto"
          >
            {matches.map((item, index) => (
              <li
                key={item}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'cursor-default truncate rounded-sm px-2 py-1.5 text-sm select-none',
                  index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  item === value && 'font-semibold',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(item)}
              >
                {item}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
