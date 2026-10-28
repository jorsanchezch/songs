import { pitchClass } from '@/lib/chords'

const STRINGS = [4, 9, 2, 7]

export function chordTones(name: string): { root: number; tones: number[] } | null {
  const match = name.trim().match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/)
  if (!match?.[1]) return null
  const root = pitchClass(match[1])
  if (root == null) return null
  const tones = intervalsFor(normalize(match[2] ?? '')).map((interval) => (root + interval) % 12)
  const bass = match[3] ? pitchClass(match[3]) : null
  if (bass != null && !tones.includes(bass)) tones.push(bass)
  return { root, tones }
}

export function bassShape(name: string): { frets: number[]; startFret: number } | null {
  const chord = chordTones(name)
  if (!chord) return null
  const frets = STRINGS.map((open) => {
    for (let fret = 0; fret <= 12; fret += 1) {
      if ((open + fret) % 12 === chord.root) return fret
    }
    return -1
  })
  const pressed = frets.filter((fret) => fret > 0)
  const max = pressed.length ? Math.max(...pressed) : 1
  const min = pressed.length ? Math.min(...pressed) : 1
  return { frets, startFret: max <= 4 ? 1 : min }
}

function intervalsFor(quality: string): number[] {
  if (quality === 'm' || quality === 'min') return [0, 3, 7]
  if (quality === '7') return [0, 4, 7, 10]
  if (quality === 'm7') return [0, 3, 7, 10]
  if (quality === 'maj7') return [0, 4, 7, 11]
  if (quality === 'sus4') return [0, 5, 7]
  if (quality === 'sus2') return [0, 2, 7]
  if (quality === 'dim') return [0, 3, 6]
  if (quality === 'm7b5') return [0, 3, 6, 10]
  if (quality === 'aug') return [0, 4, 8]
  if (quality === '5') return [0, 7]
  if (quality === '9') return [0, 2, 4, 7, 10]
  return [0, 4, 7]
}

function normalize(quality: string): string {
  if (quality === '4' || quality === 'sus4') return 'sus4'
  if (quality === '2' || quality === 'sus2' || quality === 'add9') return 'sus2'
  if (quality === '7M' || quality === 'maj7' || quality === 'M7' || quality === '7M(9)' || quality === 'maj9') {
    return 'maj7'
  }
  if (quality === 'm7b5' || quality === 'ø' || quality === 'm7(b5)') return 'm7b5'
  if (quality === 'm7' || quality === 'm9' || quality === 'm11' || quality === 'm7(11)') return 'm7'
  if (quality === '9' || quality === '7(9)') return '9'
  if (quality === 'm' || quality === 'min') return 'm'
  if (quality === '7') return '7'
  if (quality === 'dim' || quality === '°') return 'dim'
  if (quality === 'aug' || quality === '+') return 'aug'
  if (quality === '5') return '5'
  if (quality === '' || quality === 'maj') return ''
  if (quality.startsWith('m')) return 'm'
  if (quality.startsWith('maj') || quality.startsWith('7M')) return 'maj7'
  return ''
}
