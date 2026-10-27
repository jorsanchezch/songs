import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STATUS_LABEL: Record<string, string> = {
  waiting: 'En espera',
  importing: 'Importando',
  saved: 'Guardada',
  failed: 'Falló',
  exists: 'Ya está',
  name: 'Sin enlace',
  searching: 'Buscando',
  suggestion: 'Sugerencia',
  none: 'Sin resultado',
}

export function BulkAddLayout({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh pb-16">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[52.8rem] items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/" aria-label="Volver a la biblioteca">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{lede}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[52.8rem] flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'failed'
      ? 'bg-destructive/15 text-destructive'
      : status === 'saved' || status === 'importing' || status === 'suggestion' || status === 'searching'
        ? 'bg-primary/15 text-primary'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
