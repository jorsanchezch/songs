import { prefersFlats, spellPitch } from '@/lib/chords'

/** Major tonics around the circle of fifths: C G D A E B F# Db Ab Eb Bb F. */
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]

export type StudyKey = { pc: number; minor: boolean }

export type Quality = { id: string; label: string; intervals: number[] }

export const QUALITIES: Quality[] = [
  { id: '', label: 'Mayor', intervals: [0, 4, 7] },
  { id: 'm', label: 'Menor', intervals: [0, 3, 7] },
  { id: '7', label: 'Séptima', intervals: [0, 4, 7, 10] },
  { id: 'maj7', label: 'Séptima mayor', intervals: [0, 4, 7, 11] },
  { id: 'm7', label: 'Menor séptima', intervals: [0, 3, 7, 10] },
  { id: 'sus2', label: 'Sus2', intervals: [0, 2, 7] },
  { id: 'sus4', label: 'Sus4', intervals: [0, 5, 7] },
  { id: 'dim', label: 'Disminuido', intervals: [0, 3, 6] },
  { id: 'm7b5', label: 'Semidisminuido', intervals: [0, 3, 6, 10] },
  { id: 'aug', label: 'Aumentado', intervals: [0, 4, 8] },
]

const INTERVAL = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', '#5', '6', 'b7', '7']
const SCALE_DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']

export function qualityById(id: string): Quality {
  return QUALITIES.find((quality) => quality.id === id) ?? QUALITIES[0]!
}

export function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}

export function keyFlats(key: StudyKey): boolean {
  return prefersFlats(key.pc, key.minor)
}

export function keyName(key: StudyKey): string {
  return `${spellPitch(key.pc, keyFlats(key))}${key.minor ? 'm' : ''}`
}

/** Tonics in circle order for the chosen mode. Minor keys follow their relative major. */
export function circleKeys(minor: boolean): StudyKey[] {
  return CIRCLE.map((pc) => ({ pc: minor ? mod12(pc + 9) : pc, minor }))
}

/** Sharps or flats in the key signature, read from the relative major. */
export function signature(key: StudyKey): string {
  const major = key.minor ? mod12(key.pc + 3) : key.pc
  const index = CIRCLE.indexOf(major)
  if (index === 0) return '0'
  if (index <= 6) return `${index}♯`
  return `${12 - index}♭`
}

export function parseStudyKey(value: string | null): StudyKey | null {
  const match = value?.trim().match(/^([A-G])(#|b)?(m)?$/)
  if (!match) return null
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1] as 'C']
  const acc = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  return { pc: mod12(base + acc), minor: Boolean(match[3]) }
}

export type StudyChord = {
  root: number
  quality: string
  name: string
  degree: string
  role?: string
}

export function chordName(root: number, quality: string, flats: boolean): string {
  return `${spellPitch(root, flats)}${quality}`
}

/** Same shape as the app's degree spelling: 5(7), 6m, 2m7b5. */
function degreeLabel(offset: number, quality: string): string {
  const degree = SCALE_DEGREE[mod12(offset)] ?? '1'
  return /^\d/.test(quality) ? `${degree}(${quality})` : `${degree}${quality}`
}

type Step = [offset: number, quality: string, role?: string]

const MAJOR_TRIADS: Step[] = [
  [0, '', 'Tónica'],
  [2, 'm', 'Subdominante'],
  [4, 'm', 'Tónica'],
  [5, '', 'Subdominante'],
  [7, '', 'Dominante'],
  [9, 'm', 'Tónica'],
  [11, 'dim', 'Dominante'],
]
const MAJOR_SEVENTHS: Step[] = [
  [0, 'maj7', 'Tónica'],
  [2, 'm7', 'Subdominante'],
  [4, 'm7', 'Tónica'],
  [5, 'maj7', 'Subdominante'],
  [7, '7', 'Dominante'],
  [9, 'm7', 'Tónica'],
  [11, 'm7b5', 'Dominante'],
]
const MINOR_TRIADS: Step[] = [
  [0, 'm', 'Tónica'],
  [2, 'dim', 'Subdominante'],
  [3, '', 'Tónica'],
  [5, 'm', 'Subdominante'],
  [7, 'm', 'Dominante'],
  [8, '', 'Subdominante'],
  [10, '', 'Dominante'],
]
const MINOR_SEVENTHS: Step[] = [
  [0, 'm7', 'Tónica'],
  [2, 'm7b5', 'Subdominante'],
  [3, 'maj7', 'Tónica'],
  [5, 'm7', 'Subdominante'],
  [7, 'm7', 'Dominante'],
  [8, 'maj7', 'Subdominante'],
  [10, '7', 'Dominante'],
]
const MAJOR_EXTRA: Step[] = [
  [10, '', 'Prestado del menor'],
  [5, 'm', 'Prestado del menor'],
  [8, '', 'Prestado del menor'],
  [2, '7', 'Dominante del 5'],
  [4, '7', 'Dominante del 6m'],
  [0, '7', 'Dominante del 4'],
]
const MINOR_EXTRA: Step[] = [
  [7, '7', 'Dominante armónica'],
  [7, '', 'Dominante mayor'],
  [5, '', 'Cuarto dórico'],
  [11, 'dim', 'Sensible'],
]

function build(key: StudyKey, steps: Step[]): StudyChord[] {
  const flats = keyFlats(key)
  return steps.map(([offset, quality, role]) => {
    const root = mod12(key.pc + offset)
    return { root, quality, name: chordName(root, quality, flats), degree: degreeLabel(offset, quality), role }
  })
}

export function diatonicChords(key: StudyKey, sevenths: boolean): StudyChord[] {
  if (key.minor) return build(key, sevenths ? MINOR_SEVENTHS : MINOR_TRIADS)
  return build(key, sevenths ? MAJOR_SEVENTHS : MAJOR_TRIADS)
}

export function borrowedChords(key: StudyKey): StudyChord[] {
  return build(key, key.minor ? MINOR_EXTRA : MAJOR_EXTRA)
}

export type Progression = { label: string; steps: number[] }

export const MAJOR_PROGRESSIONS: Progression[] = [
  { label: 'Alabanza / pop', steps: [0, 4, 5, 3] },
  { label: 'Desde el 6m', steps: [5, 3, 0, 4] },
  { label: 'Clásica', steps: [0, 3, 4] },
  { label: 'Años 50', steps: [0, 5, 3, 4] },
  { label: 'Subida al 6m', steps: [3, 4, 5] },
  { label: 'Cadencia 2–5–1', steps: [1, 4, 0] },
  { label: 'Balada', steps: [0, 3, 5, 4] },
]

export const MINOR_PROGRESSIONS: Progression[] = [
  { label: 'Épica', steps: [0, 5, 2, 6] },
  { label: 'Clásica menor', steps: [0, 3, 4] },
  { label: 'Andaluza', steps: [0, 6, 5, 4] },
  { label: 'Vaivén', steps: [0, 6, 5, 6] },
  { label: 'Ciclo', steps: [0, 3, 6, 2] },
]

export function progressionsFor(key: StudyKey): Progression[] {
  return key.minor ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS
}

export type Scale = { id: string; label: string; intervals: number[] }

export const SCALES: Scale[] = [
  { id: 'major', label: 'Mayor', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Menor natural', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'pent-major', label: 'Pentatónica mayor', intervals: [0, 2, 4, 7, 9] },
  { id: 'pent-minor', label: 'Pentatónica menor', intervals: [0, 3, 5, 7, 10] },
  { id: 'harmonic', label: 'Menor armónica', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
]

export function scaleById(id: string | null, minor: boolean): Scale {
  return SCALES.find((scale) => scale.id === id) ?? SCALES[minor ? 1 : 0]!
}

/** Label for a note: its letter, or its degree against `root`. */
export function noteLabel(pc: number, root: number, labels: 'notes' | 'degrees', flats: boolean, chord = false) {
  if (labels === 'notes') return spellPitch(pc, flats)
  return (chord ? INTERVAL : SCALE_DEGREE)[mod12(pc - root)] ?? '1'
}

/** Root position and each inversion, as semitones above the C that starts a two-octave keyboard. */
export function pianoVoicings(root: number, intervals: number[]): number[][] {
  const base = intervals.map((interval) => root + interval)
  return base.map((_, inversion) => {
    const notes = [...base.slice(inversion), ...base.slice(0, inversion).map((note) => note + 12)]
    const shift = (notes[0] ?? 0) >= 12 ? -12 : 0
    return notes.map((note) => note + shift)
  })
}

export const INVERSION_LABEL = ['Fundamental', '1ª inversión', '2ª inversión', '3ª inversión']

export function chordTonesText(root: number, intervals: number[], flats: boolean): string {
  return intervals.map((interval) => spellPitch(root + interval, flats)).join(' · ')
}

export function intervalText(intervals: number[]): string {
  return intervals.map((interval) => INTERVAL[interval % 12] ?? '').join(' · ')
}
