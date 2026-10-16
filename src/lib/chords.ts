import type { Spelling } from '@/lib/types'

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']
const BASE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const MAJOR_PREFERS_FLATS = [
  false,
  true,
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
]

export type ParsedKey = {
  pc: number
  minor: boolean
  valid: boolean
}

export function parseKey(key: string): ParsedKey {
  const match = key.trim().match(/^([A-G])(#|b)?(m)?/)
  if (!match) return { pc: 0, minor: false, valid: false }
  const pc = pitchClass(`${match[1]}${match[2] ?? ''}`)
  if (pc == null) return { pc: 0, minor: false, valid: false }
  return { pc, minor: Boolean(match[3]), valid: true }
}

export function pitchClass(note: string): number | null {
  const match = note.match(/^([A-G])(#|b)?/)
  if (!match || match[1] == null) return null
  const base = BASE[match[1]]
  if (base == null) return null
  const acc = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  return (base + acc + 12) % 12
}

export function prefersFlats(tonic: number, minor: boolean): boolean {
  const majorPc = (tonic + (minor ? 3 : 0)) % 12
  return MAJOR_PREFERS_FLATS[majorPc] ?? false
}

export function spellPitch(pc: number, flats: boolean): string {
  const table = flats ? FLAT : SHARP
  return table[(pc % 12 + 12) % 12] ?? 'C'
}

export function transposeKeyName(key: string, semitones: number): string {
  const parsed = parseKey(key)
  if (!parsed.valid) return key.trim() || '—'
  const pc = mod12(parsed.pc + semitones)
  const name = spellPitch(pc, prefersFlats(pc, parsed.minor))
  return parsed.minor ? `${name}m` : name
}

type SplitChord = {
  raw: string
  root: string
  quality: string
  bass?: string
  bassQuality: string
}

function splitChord(raw: string): SplitChord {
  const trimmed = raw.trim()
  const match = trimmed.match(
    /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?)([^/]*))?$/,
  )
  if (!match) {
    return { raw: trimmed, root: trimmed, quality: '', bassQuality: '' }
  }
  return {
    raw: trimmed,
    root: match[1] ?? trimmed,
    quality: match[2] ?? '',
    bass: match[3],
    bassQuality: match[4] ?? '',
  }
}

function degreeQuality(quality: string): string {
  if (quality === '4') return 'sus4'
  if (quality === '7M(9)') return 'maj9'
  if (quality === '7M') return 'maj7'
  if (quality === 'm7(11)') return 'm11'
  return quality
}

function withDigitQuality(degree: string, quality: string): string {
  if (/^\d/.test(quality)) return `${degree}(${quality})`
  return `${degree}${quality}`
}

export function formatChord(
  raw: string,
  key: string,
  semitones: number,
  spelling: Spelling,
): string {
  const parsed = parseKey(key)
  const tonic = mod12(parsed.pc + semitones)
  const flats = prefersFlats(tonic, parsed.minor)
  const chord = splitChord(raw)
  const rootPc = pitchClass(chord.root)
  if (rootPc == null) return chord.raw

  const letters = letterChord(chord, semitones, flats)
  if (spelling === 'letters') return letters
  if (spelling === 'degrees') return degreeChord(chord, parsed.pc)

  const bassPc = chord.bass ? pitchClass(chord.bass) : null
  const prefix =
    bassPc == null
      ? (DEGREE[mod12(rootPc - parsed.pc)] ?? '1')
      : `${DEGREE[mod12(rootPc - parsed.pc)] ?? '1'}/${DEGREE[mod12(bassPc - parsed.pc)] ?? '1'}`
  return `${prefix}(${letters})`
}

function letterChord(chord: SplitChord, semitones: number, flats: boolean): string {
  const rootPc = pitchClass(chord.root)
  if (rootPc == null) return chord.raw
  const root = spellPitch(mod12(rootPc + semitones), flats)
  let text = `${root}${chord.quality}`
  if (chord.bass) {
    const bassPc = pitchClass(chord.bass)
    text +=
      bassPc == null
        ? `/${chord.bass}`
        : `/${spellPitch(mod12(bassPc + semitones), flats)}${chord.bassQuality}`
  }
  return text
}

function degreeChord(chord: SplitChord, tonic: number): string {
  const rootPc = pitchClass(chord.root)
  if (rootPc == null) return chord.raw
  const number = DEGREE[mod12(rootPc - tonic)] ?? '1'
  let text = withDigitQuality(number, degreeQuality(chord.quality))
  if (chord.bass) {
    const bassPc = pitchClass(chord.bass)
    text +=
      bassPc == null
        ? `/${chord.bass}`
        : `/${withDigitQuality(DEGREE[mod12(bassPc - tonic)] ?? '1', chord.bassQuality)}`
  }
  return text
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}
