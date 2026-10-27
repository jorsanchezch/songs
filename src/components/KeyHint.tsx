import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/80 bg-muted/80 px-1 font-sans text-[10px] leading-none font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function ShortcutLegend({
  items,
  className,
}: {
  items: { id: string; keys: ReactNode; label: string }[]
  className?: string
}) {
  if (!items.length) return null
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground', className)}
      aria-label="Atajos de teclado"
    >
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          <span className="inline-flex items-center gap-0.5">{item.keys}</span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
