import { CycleButton } from '@/components/ControlHint'
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
  const index = Math.max(0, OPTIONS.findIndex((option) => option.id === value))
  const option = OPTIONS[index] ?? OPTIONS[2]!
  const next = OPTIONS[(index + 1) % OPTIONS.length] ?? OPTIONS[0]!
  return (
    <CycleButton
      label={option.label}
      title={option.title}
      index={index}
      count={OPTIONS.length}
      size={size}
      onClick={() => onChange(next.id)}
    />
  )
}
