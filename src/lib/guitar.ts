export type Diagram = {
  name: string
  frets: number[]
  startFret: number
}

const OPEN: Record<string, number[]> = {
  '0:': [-1, 3, 2, 0, 1, 0],
  '2:': [-1, -1, 0, 2, 3, 2],
  '4:': [0, 2, 2, 1, 0, 0],
  '5:': [1, 3, 3, 2, 1, 1],
  '7:': [3, 2, 0, 0, 0, 3],
  '9:': [-1, 0, 2, 2, 2, 0],
  '11:': [-1, 2, 4, 4, 4, 2],
  '0:m': [-1, 3, 5, 5, 4, 3],
  '2:m': [-1, -1, 0, 2, 3, 1],
  '4:m': [0, 2, 2, 0, 0, 0],
  '7:m': [3, 5, 5, 3, 3, 3],
  '9:m': [-1, 0, 2, 2, 1, 0],
  '11:m': [-1, 2, 4, 4, 3, 2],
  '0:7': [-1, 3, 2, 3, 1, 0],
  '2:7': [-1, -1, 0, 2, 1, 2],
  '4:7': [0, 2, 0, 1, 0, 0],
  '7:7': [3, 2, 0, 0, 0, 1],
  '9:7': [-1, 0, 2, 0, 2, 0],
  '11:7': [-1, 2, 1, 2, 0, 2],
  '0:m7': [-1, 3, 5, 3, 4, 3],
  '2:m7': [-1, -1, 0, 2, 1, 1],
  '4:m7': [0, 2, 0, 0, 0, 0],
  '9:m7': [-1, 0, 2, 0, 1, 0],
  '0:maj7': [-1, 3, 2, 0, 0, 0],
  '2:maj7': [-1, -1, 0, 2, 2, 2],
  '7:maj7': [3, 2, 0, 0, 0, 2],
  '9:maj7': [-1, 0, 2, 1, 2, 0],
  '2:sus4': [-1, -1, 0, 2, 3, 3],
  '4:sus4': [0, 2, 2, 2, 0, 0],
  '9:sus4': [-1, 0, 2, 2, 3, 0],
  '2:sus2': [-1, -1, 0, 2, 3, 0],
  '4:sus2': [0, 2, 4, 4, 0, 0],
  '9:sus2': [-1, 0, 2, 2, 0, 0],
  '0:9': [-1, 3, 2, 3, 3, 0],
  '4:9': [0, 2, 0, 1, 0, 2],
  '7:9': [3, 2, 0, 2, 0, 1],
  '0:add9': [-1, 3, 2, 0, 3, 0],
}

const SLASH: Record<string, number[]> = {
  'C/E': [0, 3, 2, 0, 1, 0],
  'C/G': [3, 3, 2, 0, 1, 0],
  'D/F#': [2, -1, 0, 2, 3, 2],
  'G/B': [-1, 2, 0, 0, 0, 3],
  'G/D': [-1, -1, 0, 0, 0, 3],
  'Am/G': [3, 0, 2, 2, 1, 0],
  'Am/F': [1, 0, 2, 2, 1, 0],
  'F/C': [-1, 3, 3, 2, 1, 1],
  'E/G#': [4, 2, 2, 1, 0, 0],
  'A/C#': [-1, 4, 2, 2, 2, 0],
  'A/E': [0, 0, 2, 2, 2, 0],
  'D/A': [-1, 0, 0, 2, 3, 2],
}

const MOVABLE: Record<string, { openPc: number; frets: number[] }[]> = {
  '': [
    { openPc: 4, frets: [0, 2, 2, 1, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 2, 2, 0] },
  ],
  m: [
    { openPc: 4, frets: [0, 2, 2, 0, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 2, 1, 0] },
  ],
  '7': [
    { openPc: 4, frets: [0, 2, 0, 1, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 0, 2, 0] },
  ],
  m7: [
    { openPc: 4, frets: [0, 2, 0, 0, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 0, 1, 0] },
  ],
  maj7: [
    { openPc: 4, frets: [0, 2, 1, 1, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 1, 2, 0] },
  ],
  sus4: [
    { openPc: 4, frets: [0, 2, 2, 2, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 2, 3, 0] },
  ],
  sus2: [
    { openPc: 4, frets: [0, 2, 4, 4, 0, 0] },
    { openPc: 9, frets: [-1, 0, 2, 2, 0, 0] },
  ],
  '9': [
    { openPc: 4, frets: [0, 2, 0, 1, 0, 2] },
    { openPc: 9, frets: [-1, 0, 2, 4, 2, 3] },
  ],
  dim: [
    { openPc: 9, frets: [-1, 0, 1, 2, 1, -1] },
  ],
  aug: [
    { openPc: 4, frets: [0, 3, 2, 1, 1, 0] },
  ],
  '5': [
    { openPc: 4, frets: [0, 2, 2, -1, -1, -1] },
  ],
}

const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function diagramFor(chordName: string): Diagram | null {
  const name = chordName.trim()
  const slash = SLASH[name]
  if (slash) return windowed(name, slash)
  const parsed = name.match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/)
  if (!parsed) return null
  const root = pitch(parsed[1] ?? '')
  if (root == null) return null
  const quality = normalizeQuality(parsed[2] ?? '')
  const open = OPEN[`${root}:${quality}`]
  if (open) return windowed(name, open)
  const shapes = MOVABLE[quality] ?? MOVABLE['']
  let best: number[] | null = null
  let bestFret = 99
  for (const shape of shapes) {
    const fret = (root - shape.openPc + 12) % 12
    const frets = shape.frets.map((value) => (value < 0 ? -1 : value + fret))
    const top = Math.max(...frets)
    if (fret < bestFret || (fret === bestFret && best && top < Math.max(...best))) {
      best = frets
      bestFret = fret
    }
  }
  return best ? windowed(name, best) : null
}

function windowed(name: string, frets: number[]): Diagram {
  const pressed = frets.filter((fret) => fret > 0)
  const max = pressed.length ? Math.max(...pressed) : 1
  const min = pressed.length ? Math.min(...pressed) : 1
  const startFret = max <= 4 ? 1 : min
  return { name, frets, startFret }
}

function pitch(note: string): number | null {
  const match = note.match(/^([A-G])(#|b)?/)
  if (!match || match[1] == null) return null
  const base = BASE[match[1]]
  if (base == null) return null
  const acc = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  return (base + acc + 12) % 12
}

function normalizeQuality(quality: string): string {
  if (quality === '4' || quality === 'sus4') return 'sus4'
  if (quality === '2' || quality === 'sus2' || quality === 'add9') return 'sus2'
  if (
    quality === '7M' ||
    quality === 'maj7' ||
    quality === '7M(9)' ||
    quality === 'maj9' ||
    quality === 'M7'
  ) {
    return 'maj7'
  }
  if (quality === 'm7' || quality === 'm7(11)' || quality === 'm11' || quality === 'm9') return 'm7'
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
