import { Flag, Hand, Layers, Repeat, StickyNote, type LucideIcon } from 'lucide-react'
import { NOTE_LABEL, NOTE_TYPES, type NoteType } from '@/lib/types'
import type { SelectOption } from '@/components/ui/select'

export const NOTE_ICON: Record<NoteType, LucideIcon> = {
  cue: Flag,
  how: Hand,
  repeat: Repeat,
  arrange: Layers,
  free: StickyNote,
}

export const NOTE_OPTIONS: SelectOption<NoteType>[] = NOTE_TYPES.map((type) => {
  const Icon = NOTE_ICON[type]
  return { value: type, label: NOTE_LABEL[type], icon: <Icon aria-hidden className="text-muted-foreground" /> }
})
