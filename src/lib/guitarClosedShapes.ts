/** Closed triad / seventh / power shapes on adjacent string sets. */

import { windowed, type Diagram } from '@/lib/guitar'
import { mod12 } from '@/lib/theory'

/** Open-string pitch classes, low E → high e. */
const OPEN_PC = [4, 9, 2, 7, 11, 4] as const

export type StringSetId = '1-2-3' | '2-3-4' | '3-4-5' | '4-5-6' | '1-4' | '2-5' | '3-6'
export type InversionId = 'root' | '1st' | '2nd' | '3rd'

export type LabeledShape = Diagram & {
  stringSet: StringSetId
  inversion: InversionId
  caption: string
}

const STRING_SETS: { id: StringSetId; strings: [number, number, number]; label: string }[] = [
  { id: '1-2-3', strings: [3, 4, 5], label: 'Cuerdas 1–2–3' },
  { id: '2-3-4', strings: [2, 3, 4], label: 'Cuerdas 2–3–4' },
  { id: '3-4-5', strings: [1, 2, 3], label: 'Cuerdas 3–4–5' },
  { id: '4-5-6', strings: [0, 1, 2], label: 'Cuerdas 4–5–6' },
]

const INVERSION_LABEL: Record<InversionId, string> = {
  root: 'Fundamental',
  '1st': '1ª inversión',
  '2nd': '2ª inversión',
  '3rd': '3ª inversión',
}

/** All closed major or minor triads for a root (4 string sets × 3 inversions). */
export function closedTriadShapes(root: number, minor: boolean, name: string): LabeledShape[] {
  const third = minor ? 3 : 4
  const tones = [root, mod12(root + third), mod12(root + 7)]
  const orders: { inversion: InversionId; pcs: number[] }[] = [
    { inversion: 'root', pcs: [tones[0]!, tones[1]!, tones[2]!] },
    { inversion: '1st', pcs: [tones[1]!, tones[2]!, tones[0]!] },
    { inversion: '2nd', pcs: [tones[2]!, tones[0]!, tones[1]!] },
  ]
  return STRING_SETS.flatMap((set) =>
    orders.flatMap(({ inversion, pcs }) => {
      const frets = closedFrets(set.strings, pcs)
      if (!frets) return []
      const diagram = windowed(name, frets)
      return [
        {
          ...diagram,
          id: `triad:${set.id}:${inversion}:${diagram.id}`,
          stringSet: set.id,
          inversion,
          caption: `${set.label} · ${INVERSION_LABEL[inversion]}`,
        },
      ]
    }),
  )
}

/**
 * Common seventh voicings: drop-2 on four adjacent strings (low→high R–5–7–3 / etc.)
 * plus shell voicings (R–3–7) on three strings.
 */
export function seventhShapes(
  root: number,
  quality: '7' | 'maj7' | 'm7',
  name: string,
): LabeledShape[] {
  const third = quality === 'm7' ? 3 : 4
  const seventh = quality === 'maj7' ? 11 : 10
  const tones = [root, mod12(root + third), mod12(root + 7), mod12(root + seventh)]
  const fourSets: { id: StringSetId; strings: [number, number, number, number]; label: string }[] = [
    { id: '1-4', strings: [2, 3, 4, 5], label: 'Cuerdas 1–4' },
    { id: '2-5', strings: [1, 2, 3, 4], label: 'Cuerdas 2–5' },
    { id: '3-6', strings: [0, 1, 2, 3], label: 'Cuerdas 3–6' },
  ]
  // Drop-2 voicings by bass tone (inversion of the seventh chord).
  const dropOrders: { inversion: InversionId; pcs: number[] }[] = [
    { inversion: 'root', pcs: [tones[0]!, tones[2]!, tones[3]!, tones[1]!] }, // R 5 7 3
    { inversion: '1st', pcs: [tones[1]!, tones[3]!, tones[0]!, tones[2]!] }, // 3 7 R 5
    { inversion: '2nd', pcs: [tones[2]!, tones[0]!, tones[1]!, tones[3]!] }, // 5 R 3 7
    { inversion: '3rd', pcs: [tones[3]!, tones[1]!, tones[2]!, tones[0]!] }, // 7 3 5 R
  ]
  const drop2 = fourSets.flatMap((set) =>
    dropOrders.flatMap(({ inversion, pcs }) => {
      const frets = closedFrets(set.strings, pcs)
      if (!frets) return []
      const diagram = windowed(name, frets)
      return [
        {
          ...diagram,
          id: `7drop:${set.id}:${inversion}:${diagram.id}`,
          stringSet: set.id,
          inversion,
          caption: `${set.label} · drop-2 · ${INVERSION_LABEL[inversion]}`,
        },
      ]
    }),
  )
  // Shell: root, third, seventh (omit 5th) on string sets 1-2-3 and 2-3-4.
  const shellOrders: { inversion: InversionId; pcs: number[] }[] = [
    { inversion: 'root', pcs: [tones[0]!, tones[1]!, tones[3]!] },
    { inversion: '1st', pcs: [tones[1]!, tones[3]!, tones[0]!] },
    { inversion: '3rd', pcs: [tones[3]!, tones[0]!, tones[1]!] },
  ]
  const shells = STRING_SETS.slice(0, 2).flatMap((set) =>
    shellOrders.flatMap(({ inversion, pcs }) => {
      const frets = closedFrets(set.strings, pcs)
      if (!frets) return []
      const diagram = windowed(name, frets)
      return [
        {
          ...diagram,
          id: `7shell:${set.id}:${inversion}:${diagram.id}`,
          stringSet: set.id,
          inversion,
          caption: `${set.label} · shell · ${INVERSION_LABEL[inversion]}`,
        },
      ]
    }),
  )
  return [...shells, ...drop2]
}

/** Power chords (root + 5th, optional octave) with root on strings 6, 5, and 4. */
export function powerShapes(root: number, name: string): LabeledShape[] {
  const templates: { stringSet: StringSetId; openPc: number; frets: number[]; caption: string }[] = [
    {
      stringSet: '4-5-6',
      openPc: 4,
      frets: [0, 2, 2, -1, -1, -1],
      caption: 'Raíz en 6ª · quinta',
    },
    {
      stringSet: '4-5-6',
      openPc: 4,
      frets: [0, 2, 2, 0, -1, -1],
      caption: 'Raíz en 6ª · con octava',
    },
    {
      stringSet: '3-4-5',
      openPc: 9,
      frets: [-1, 0, 2, 2, -1, -1],
      caption: 'Raíz en 5ª · quinta',
    },
    {
      stringSet: '3-4-5',
      openPc: 9,
      frets: [-1, 0, 2, 2, 0, -1],
      caption: 'Raíz en 5ª · con octava',
    },
    {
      stringSet: '2-3-4',
      openPc: 2,
      frets: [-1, -1, 0, 2, 2, -1],
      caption: 'Raíz en 4ª · quinta',
    },
    {
      stringSet: '2-3-4',
      openPc: 2,
      frets: [-1, -1, 0, 2, 2, 0],
      caption: 'Raíz en 4ª · con octava',
    },
  ]
  return templates.map((template) => {
    const fret = (root - template.openPc + 12) % 12
    const frets = template.frets.map((value) => (value < 0 ? -1 : value + fret))
    const diagram = windowed(name, frets)
    return {
      ...diagram,
      id: `power:${template.caption}:${diagram.id}`,
      stringSet: template.stringSet,
      inversion: 'root' as const,
      caption: template.caption,
    }
  })
}

/** Compact fretting for pitch classes on the given string indexes (low → high). */
export function closedFrets(strings: readonly number[], pcs: number[]): number[] | null {
  if (strings.length !== pcs.length) return null
  const options = strings.map((stringIndex, index) => fretsForPc(stringIndex, pcs[index]!))
  if (options.some((list) => list.length === 0)) return null
  let best: number[] | null = null
  let bestScore = Infinity
  const walk = (depth: number, chosen: number[]) => {
    if (depth === options.length) {
      const score = spanScore(chosen)
      if (score < bestScore) {
        bestScore = score
        best = [...chosen]
      }
      return
    }
    for (const fret of options[depth]!) {
      chosen.push(fret)
      walk(depth + 1, chosen)
      chosen.pop()
    }
  }
  walk(0, [])
  if (!best) return null
  const frets = [-1, -1, -1, -1, -1, -1]
  strings.forEach((stringIndex, index) => {
    frets[stringIndex] = best![index]!
  })
  return frets
}

function fretsForPc(stringIndex: number, pc: number): number[] {
  const open = OPEN_PC[stringIndex]
  if (open == null) return []
  const first = (pc - open + 12) % 12
  return [first, first + 12].filter((fret) => fret <= 15)
}

function spanScore(frets: number[]): number {
  const pressed = frets.filter((fret) => fret > 0)
  if (!pressed.length) return frets.every((fret) => fret === 0) ? 0 : 99
  const min = Math.min(...pressed)
  const max = Math.max(...pressed)
  const span = max - min
  // Prefer shapes that fit in a 4-fret window; penalize high positions lightly.
  return span * 10 + min * 0.05 + (span > 4 ? 40 : 0)
}
