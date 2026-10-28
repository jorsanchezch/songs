import { CycleButton } from '@/components/ControlHint'
import type { FoldMode } from '@/lib/display'

const OPTIONS: { id: FoldMode; label: string; title: string }[] = [
  {
    id: 'full',
    label: 'Completo',
    title: 'Muestra cada parte abierta, también las que se repiten.',
  },
  {
    id: 'concise',
    label: 'Conciso',
    title: 'Pliega las partes idénticas, como Coro y Coro ×2.',
  },
  {
    id: 'music',
    label: 'Conciso (música)',
    title: 'Pliega si los acordes y el número de líneas coinciden, aunque la letra cambie. Muestra la letra de antes.',
  },
]

export function nextFold(fold: FoldMode): FoldMode {
  const index = OPTIONS.findIndex((option) => option.id === fold)
  return OPTIONS[(Math.max(0, index) + 1) % OPTIONS.length]?.id ?? 'full'
}

export function FoldToggle({
  value,
  onChange,
  size = 'default',
}: {
  value: FoldMode
  onChange: (value: FoldMode) => void
  size?: 'default' | 'sm'
}) {
  const index = Math.max(0, OPTIONS.findIndex((option) => option.id === value))
  const option = OPTIONS[index] ?? OPTIONS[0]!
  return (
    <CycleButton
      label={option.label}
      title={option.title}
      index={index}
      count={OPTIONS.length}
      size={size}
      onClick={() => onChange(nextFold(value))}
    />
  )
}

export function foldMessage(fold: FoldMode, label: string): string {
  if (fold === 'music') return `Misma música que ${label}. Muestra esa letra.`
  return `Igual que ${label}. Mostrar.`
}
