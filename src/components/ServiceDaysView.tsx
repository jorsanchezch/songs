import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserBadge } from '@/components/UserBadge'
import { useSetlists } from '@/hooks/useSetlists'
import { useUser } from '@/hooks/useUser'
import { can } from '@/lib/access'
import { loadServiceDays, saveServiceDays, WEEKDAYS } from '@/lib/setlists'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

export function ServiceDaysView() {
  const navigate = useNavigate()
  const user = useUser()
  const setlists = useSetlists()
  const [days, setDays] = useState<number[]>(() => loadServiceDays())

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      event.preventDefault()
      navigate('/listas')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [navigate])

  const toggle = (weekday: number, name: string) => {
    const selected = days.includes(weekday)
    if (selected) {
      const list = setlists.find((item) => item.evergreen?.weekday === weekday)
      if (list && list.items.length > 0 && !window.confirm(`¿Quitar ${name}? Se borra esa lista.`)) return
      const next = days.filter((day) => day !== weekday)
      saveServiceDays(next)
      setDays(next)
      return
    }
    const next = [...days, weekday]
    saveServiceDays(next)
    setDays(next)
  }

  return (
    <div className="min-h-svh pb-12">
      <header className="border-b bg-card/80">
        <div className={`${page} flex items-center gap-3 py-4`}>
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to="/listas">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Días de servicio</h1>
          <div className="ml-auto">
            <UserBadge />
          </div>
        </div>
      </header>
      <main className={`${page} flex flex-col gap-4 py-4`}>
        <p className="text-sm text-muted-foreground">
          Cada día marcado tiene una lista fija. Guarda lo último que agregaste. Si agregas una canción después de
          ese servicio, la lista se vacía y la canción queda para el siguiente.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => {
            const selected = days.includes(day.id)
            return (
              <Button
                key={day.id}
                variant={selected ? 'default' : 'outline'}
                aria-pressed={selected}
                disabled={!can(user, 'update')}
                onClick={() => toggle(day.id, day.name)}
              >
                {day.name}
              </Button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
