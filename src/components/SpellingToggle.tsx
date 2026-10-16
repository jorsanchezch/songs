import { Button } from '@/components/ui/button'
import type { Spelling } from '@/lib/types'

const OPTIONS: { id: Spelling; label: string }[] = [
  { id: 'letters', label: 'Letras' },
  { id: 'degrees', label: 'Grados' },
  { id: 'both', label: 'Ambos' },
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
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
