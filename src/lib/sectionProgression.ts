import { formatChord, parseKey } from '@/lib/chords'
import { chordName, keyFlats, keyName, mod12, type StudyKey } from '@/lib/theory'

const DEGREE_OFFSET: Record<string, number> = {
  '1': 0,
  b2: 1,
  '2': 2,
  b3: 3,
  '3': 4,
  '4': 5,
  b5: 6,
  '5': 7,
  b6: 8,
  '6': 9,
  b7: 10,
  '7': 11,
}

export type ProgressionSong = {
  id: string
  title: string
  key: string
  origin?: string
  catalogId?: string | null
  sections: { label: string; lines: { chords: { raw: string }[] }[] }[]
}

export type ProgressionAlternative = {
  key: string
  chords: string
  songId: string
  title: string
  section: string
}

export type SectionProgression = {
  degrees: string
  steps: string[]
  reference: { songId: string; title: string; section: string; key: string }
  alternatives: ProgressionAlternative[]
}

/** Root degree of a chord in the song key. C/E in C is 1. Am7 is 6m. */
export function skeletonDegree(raw: string, key: string): string | null {
  if (!parseKey(key).valid) return null
  const full = formatChord(raw, key, 0, 'degrees')
  const head = full.split('/')[0] ?? ''
  const match = head.match(/^(1|b2|2|b3|3|4|b5|5|b6|6|b7|7)(.*)$/)
  if (!match) return null
  const number = match[1] ?? ''
  const rest = match[2] ?? ''
  if (rest.startsWith('dim')) return `${number}dim`
  if (rest.startsWith('aug')) return `${number}aug`
  if (rest.startsWith('m') && !rest.startsWith('maj')) return `${number}m`
  return number
}

export function sectionDegrees(key: string, raws: string[]): string[] {
  const degrees: string[] = []
  for (const raw of raws) {
    const degree = skeletonDegree(raw, key)
    if (!degree) continue
    if (degrees[degrees.length - 1] === degree) continue
    degrees.push(degree)
  }
  return repeatingCell(degrees)
}

export function spellStep(step: string, key: StudyKey): string {
  const match = step.match(/^(1|b2|2|b3|3|4|b5|5|b6|6|b7|7)(m|dim|aug)?$/)
  if (!match) return step
  const offset = DEGREE_OFFSET[match[1] ?? ''] ?? 0
  const quality = match[2] ?? ''
  return chordName(mod12(key.pc + offset), quality, keyFlats(key))
}

export function spellProgression(steps: string[], key: StudyKey): string {
  return steps.map((step) => spellStep(step, key)).join(' – ')
}

/** Degree pattern of each section, plus the same pattern played in another key. */
export function sectionProgressions(songs: ProgressionSong[]): SectionProgression[] {
  const present = new Set(songs.map((song) => song.id))
  const usable = songs.filter((song) => song.origin !== 'copy' || !song.catalogId || !present.has(song.catalogId))
  const groups = new Map<
    string,
    {
      steps: string[]
      hits: {
        songId: string
        title: string
        section: string
        key: string
        pc: number
        minor: boolean
        catalog: boolean
      }[]
    }
  >()

  for (const song of usable) {
    const parsed = parseKey(song.key)
    if (!parsed.valid) continue
    for (const section of song.sections) {
      const raws = section.lines.flatMap((line) => line.chords.map((chord) => chord.raw))
      const steps = sectionDegrees(song.key, raws)
      if (steps.length < 3 || steps.length > 6) continue
      const id = steps.join('-')
      const group = groups.get(id) ?? { steps, hits: [] }
      group.hits.push({
        songId: song.id,
        title: song.title,
        section: section.label,
        key: song.key.trim(),
        pc: parsed.pc,
        minor: parsed.minor,
        catalog: song.origin === 'catalog',
      })
      groups.set(id, group)
    }
  }

  const found: SectionProgression[] = []
  for (const [degrees, group] of groups) {
    const hits = [...group.hits].sort((a, b) => {
      if (a.catalog !== b.catalog) return a.catalog ? -1 : 1
      return a.title.localeCompare(b.title, 'es') || a.section.localeCompare(b.section, 'es')
    })
    const reference = hits[0]
    if (!reference) continue
    const seen = new Set<string>([`${reference.pc}:${reference.minor}`])
    const alternatives: ProgressionAlternative[] = []
    for (const hit of hits) {
      const mark = `${hit.pc}:${hit.minor}`
      if (seen.has(mark)) continue
      seen.add(mark)
      const key = { pc: hit.pc, minor: hit.minor }
      alternatives.push({
        key: keyName(key),
        chords: spellProgression(group.steps, key),
        songId: hit.songId,
        title: hit.title,
        section: hit.section,
      })
      if (alternatives.length >= 4) break
    }
    found.push({
      degrees,
      steps: group.steps,
      reference: {
        songId: reference.songId,
        title: reference.title,
        section: reference.section,
        key: reference.key,
      },
      alternatives,
    })
  }

  found.sort((a, b) => b.alternatives.length - a.alternatives.length || a.reference.title.localeCompare(b.reference.title, 'es') || a.degrees.localeCompare(b.degrees, 'es'))
  return found
}

function repeatingCell(degrees: string[]): string[] {
  const count = degrees.length
  if (count < 4) return degrees
  for (let size = 2; size <= Math.floor(count / 2); size += 1) {
    const cell = degrees.slice(0, size)
    let times = 1
    while (times * size < count) {
      const next = degrees.slice(times * size, (times + 1) * size)
      const matches = next.every((degree, index) => degree === cell[index])
      if (!matches) break
      times += 1
    }
    if (times >= 2 && times * size === count) return cell
  }
  return degrees
}
