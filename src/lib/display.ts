import type { ChartLine, Song, SongSection } from '@/lib/types'

export type DisplayBlock = {
  id: string
  ids: string[]
  label: string
  repeat: number
  section: SongSection
  duplicateOf?: string
}

export function resolveSections(sections: SongSection[]): SongSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]))
  return sections.map((section) => {
    if (!section.sameAs) return section
    const source = byId.get(section.sameAs)
    if (!source || source.sameAs) return section
    return {
      ...section,
      lines: source.lines.map((line) => ({
        ...line,
        notes: [...line.notes],
        chords: line.chords.map((chord) => ({
          ...chord,
          notes: [...chord.notes],
        })),
      })),
      notes: [...source.notes, ...section.notes],
    }
  })
}

export function sectionSignature(section: SongSection): string {
  if (!section.lines.length) return `empty:${section.id}`
  return section.lines
    .map((line) => {
      const chords = line.chords.map((chord) => `${chord.column}:${chord.raw}`).join(',')
      return `${chords}|${(line.lyric ?? '').trimEnd()}`
    })
    .join('\n')
}

export function blocksFor(song: Song, flow: string[] | null): DisplayBlock[] {
  const resolved = resolveSections(song.sections)
  const ordered = orderSections(resolved, flow)
  const merged: DisplayBlock[] = []

  for (const section of ordered) {
    const signature = sectionSignature(section)
    const previous = merged[merged.length - 1]
    if (
      previous &&
      signature === sectionSignature(previous.section) &&
      !signature.startsWith('empty:')
    ) {
      previous.repeat += section.repeat
      previous.ids.push(section.id)
      continue
    }
    merged.push({
      id: section.id,
      ids: [section.id],
      label: section.label,
      repeat: section.repeat,
      section,
    })
  }

  const seen = new Map<string, string>()
  return merged.map((block) => {
    const signature = sectionSignature(block.section)
    if (signature.startsWith('empty:')) return block
    const first = seen.get(signature)
    if (first && first !== block.label) {
      return { ...block, duplicateOf: first }
    }
    seen.set(signature, block.label)
    return block
  })
}

function orderSections(sections: SongSection[], flow: string[] | null): SongSection[] {
  if (!flow?.length) return sections
  const byId = new Map(sections.map((section) => [section.id, section]))
  const picked: SongSection[] = []
  for (const id of flow) {
    const section = byId.get(id)
    if (section) picked.push(section)
  }
  return picked.length ? picked : sections
}

export function chordSequence(lines: ChartLine[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const line of lines) {
    for (const chord of line.chords) {
      if (seen.has(chord.raw)) continue
      seen.add(chord.raw)
      order.push(chord.raw)
    }
  }
  return order
}

export function displayLyric(lyric: string): string {
  return lyric.replace(/_+/g, (run) => ' '.repeat(run.length))
}
