import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Which option is active when a control cycles through several. */
export function OptionDots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: count }, (_, dot) => (
        <span
          key={dot}
          className={cn('size-1 rounded-full bg-current', dot === index ? 'opacity-100' : 'opacity-30')}
        />
      ))}
    </span>
  )
}

/** Small “i”. Hover uses the native title; a tap opens the same text. */
export function ControlHint({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && buttonRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none font-sans font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        title={text}
        aria-label={text}
        aria-expanded={open}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect()
          if (rect) {
            setPlace({
              top: rect.bottom + 4,
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
            })
          }
          setOpen((value) => !value)
        }}
      >
        i
      </button>
      {open && place && (
        <span
          role="tooltip"
          style={{ top: place.top, left: place.left }}
          className="fixed z-50 w-56 rounded-md border bg-popover px-2 py-1.5 text-left font-sans text-xs font-normal tracking-normal text-popover-foreground normal-case shadow-md"
        >
          {text}
        </span>
      )}
    </>
  )
}

export function WithHint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {children}
      <ControlHint text={text} />
    </span>
  )
}

export function CycleButton({
  label,
  title,
  index,
  count,
  onClick,
  size = 'default',
}: {
  label: string
  title: string
  index: number
  count: number
  onClick: () => void
  size?: 'default' | 'sm'
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size={size}
        variant="outline"
        title={title}
        aria-label={`${label}. ${title}`}
        onClick={onClick}
      >
        {label}
        <OptionDots count={count} index={index} />
      </Button>
      <ControlHint text={title} />
    </span>
  )
}
