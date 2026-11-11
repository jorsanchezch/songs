/** Keep in sync with `serviceListName` in src/lib/setlists.ts (Spanish weekday + date). */

const WEEKDAYS: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function nextServiceDate(from: Date, weekday: number): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const delta = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + delta)
  return isoDate(date)
}

function formatListDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function serviceListTitle(weekday: number, serviceDate?: string | null, today = new Date()): string {
  const name = WEEKDAYS[weekday] ?? 'Día'
  const iso =
    serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? serviceDate : nextServiceDate(today, weekday)
  return `${name} (${formatListDate(iso)})`
}
