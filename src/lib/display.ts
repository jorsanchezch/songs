import type { ChartLine, Song, SongSection } from '@/lib/types'

export type FoldMode = 'collapse' | 'byChords' | 'chordsOnly' | 'openChords' | 'full'

/** Identical parts, or same chords, share one header chip. */
export function foldGroupsParts(fold: FoldMode): boolean {
  return fold === 'collapse' || fold === 'byChords' || fold === 'chordsOnly'
}

/** Chords-only modes drop the lyric lines. */
export function foldHidesLyrics(fold: FoldMode): boolean {
  return fold === 'chordsOnly' || fold === 'openChords'
}

export type DisplayBlock = {
  id: string
  ids: string[]
  label: string
  repeat: number
  section: SongSection
  duplicateOf?: string
  duplicateOfId?: string
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

export type PartKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'other'

/** Label used to treat "Coro" and "Coro x2" as the same part. */
export function foldPartLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*(?:\(|\[)?(?:(?:x|×)\s*\d+|\d+\s*(?:x|×))(?:\)|\])?\s*$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .trim()
}

export function partKind(label: string): PartKind {
  const name = foldPartLabel(label)
  if (/^(intro|introduccion)\b/.test(name)) return 'intro'
  if (/^(verso|verse|estrofa)\b/.test(name)) return 'verse'
  if (/^(coro|chorus|estribillo)\b/.test(name)) return 'chorus'
  if (/^(puente|bridge)\b/.test(name)) return 'bridge'
  return 'other'
}

function collapseIdentity(label: string): string {
  const kind = partKind(label)
  return kind === 'other' ? foldPartLabel(label) : kind
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

// Chords per line, lyrics ignored. Same length means the same number of lines.
function musicSignature(section: SongSection): string {
  if (!section.lines.length) return `empty:${section.id}`
  return section.lines.map((line) => line.chords.map((chord) => chord.raw).join(',')).join('\n')
}

export type HeaderChip = {
  id: string
  label: string
  repeat: number
  copies: number
  ids: string[]
}

function trailingRepeat(label: string): number {
  const match = label
    .trim()
    .match(/(?:\(|\[)?(?:(?:x|×)\s*(\d+)|(\d+)\s*(?:x|×))(?:\)|\])?\s*$/i)
  const value = Number(match?.[1] || match?.[2] || 0)
  return value > 1 ? value : 1
}

function playedTimes(block: DisplayBlock): number {
  return Math.max(block.repeat, trailingRepeat(block.label))
}

// Concise modes keep one chip per folded part. The × on the label, and how
// many times that part comes back, stay on the chip.
export function headerChips(blocks: DisplayBlock[], fold: boolean): HeaderChip[] {
  const chips: HeaderChip[] = []
  for (const block of blocks) {
    const previous =
      fold && block.duplicateOfId
        ? chips.find((chip) => chip.id === block.duplicateOfId || chip.ids.includes(block.duplicateOfId ?? ''))
        : undefined
    if (previous) {
      previous.repeat = Math.max(previous.repeat, playedTimes(block))
      previous.copies += 1
      previous.ids.push(block.id)
      continue
    }
    chips.push({
      id: block.id,
      label: block.label,
      repeat: playedTimes(block),
      copies: 1,
      ids: [block.id],
    })
  }
  return chips
}

export function headerChipText(chip: HeaderChip): string {
  const stated = trailingRepeat(chip.label)
  const repeat = chip.repeat > 1 && stated <= 1 ? ` ×${chip.repeat}` : ''
  const copies = chip.copies > 1 ? ` · ${chip.copies}` : ''
  return `${chip.label}${repeat}${copies}`
}

export function blocksFor(song: Song, flow: string[] | null, fold: FoldMode = 'full'): DisplayBlock[] {
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

  const seenExact = new Map<string, { label: string; id: string }>()
  const seenMusic = new Map<string, { label: string; id: string }>()
  return merged.map((block) => {
    const signature = sectionSignature(block.section)
    const music = musicSignature(block.section)
    if (!signature.startsWith('empty:')) {
      const exactKey = `${collapseIdentity(block.label)}\n${signature}`
      const exact = seenExact.get(exactKey)
      const sameMusic = seenMusic.get(music)
      if (!seenExact.has(exactKey)) seenExact.set(exactKey, { label: block.label, id: block.id })
      if (!music.startsWith('empty:') && !seenMusic.has(music)) seenMusic.set(music, { label: block.label, id: block.id })
      if ((fold === 'collapse' || fold === 'chordsOnly') && exact) {
        return { ...block, duplicateOf: exact.label, duplicateOfId: exact.id }
      }
      if (fold === 'byChords' && sameMusic) return { ...block, duplicateOf: sameMusic.label, duplicateOfId: sameMusic.id }
    }
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
