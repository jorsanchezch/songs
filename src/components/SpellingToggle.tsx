import { Button } from '@/components/ui/button'
import type { Spelling } from '@/lib/types'

const OPTIONS: { id: Spelling; label: string; title: string }[] = [
  { id: 'letters', label: 'Letras', title: 'Solo la letra del acorde, como C o Dm.' },
  { id: 'degrees', label: 'Grados', title: 'Solo el grado del acorde, como 1 o 6m.' },
  { id: 'both', label: 'Ambos', title: 'El grado y la letra del acorde juntos.' },
]

export function SpellingToggle({
  value,
  onChange,
  size = 'default',
}: {
  value: Spelling
  onChange: (value: Spelling) => void
  size?: 'default' | 'sm'
}) {
  return (
    <div className="flex rounded-lg border p-0.5">
      {OPTIONS.map((option) => (
        <Button
          key={option.id}
          size={size}
          variant={value === option.id ? 'default' : 'ghost'}
          aria-pressed={value === option.id}
          title={option.title}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
