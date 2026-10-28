import { CycleButton } from '@/components/ControlHint'
import type { FoldMode } from '@/lib/display'

const OPTIONS: { id: FoldMode; label: string; title: string }[] = [
  {
    id: 'collapse',
    label: 'Colapsar',
    title: 'Pliega las partes idénticas. Muestra la letra de la primera, con los acordes encima.',
  },
  {
    id: 'byChords',
    label: 'Colapsar por acordes',
    title: 'Pliega si los acordes y el número de líneas coinciden, aunque la letra cambie. Muestra la letra de antes bajo los acordes.',
  },
  {
    id: 'chordsOnly',
    label: 'Colapsar sin letra',
    title: 'Pliega las partes idénticas. Solo las partes y los acordes, sin letra.',
  },
  {
    id: 'openChords',
    label: 'Completo sin letra',
    title: 'Muestra cada parte abierta, solo acordes, sin letra.',
  },
  {
    id: 'full',
    label: 'Completo',
    title: 'Muestra cada parte abierta, con la letra.',
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
  const option = OPTIONS[index] ?? OPTIONS[4]!
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
