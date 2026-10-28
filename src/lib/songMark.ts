export type SongRef = {
  id: string
  title: string
}

export type IconPart =
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { type: 'path'; d: string }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate: number }

// Filled silhouettes. The same index is always the same shape.
export const SONG_ICON_SHAPES: IconPart[][] = [
  [{ type: 'circle', cx: 8, cy: 8, r: 5.6 }],
  [{ type: 'rect', x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4 }],
  [{ type: 'path', d: 'M8 1.2L14.6 8L8 14.8L1.4 8Z' }],
  [{ type: 'path', d: 'M8 1.5L14.8 14.3H1.2Z' }],
  [{ type: 'path', d: 'M8 1.5L9.56 5.86L14.18 5.99L10.52 8.82L11.82 13.26L8 10.65L4.18 13.26L5.48 8.82L1.82 5.99L6.44 5.86Z' }],
  [{ type: 'path', d: 'M8 13.8C3.2 10.6 1.6 8.4 1.6 5.9C1.6 3.6 3.3 2.2 5.2 2.2C6.4 2.2 7.4 2.8 8 3.8C8.6 2.8 9.6 2.2 10.8 2.2C12.7 2.2 14.4 3.6 14.4 5.9C14.4 8.4 12.8 10.6 8 13.8Z' }],
  [{ type: 'path', d: 'M4 2.2H12L14.8 8L12 13.8H4L1.2 8Z' }],
  [{ type: 'path', d: 'M9.1 1L3.4 8.7H7.3L6.5 15L13 6.6H9Z' }],
  [{ type: 'path', d: 'M8 1.2C8 1.2 2.6 7.2 2.6 10.4A5.4 5.4 0 1 0 13.4 10.4C13.4 7.2 8 1.2 8 1.2Z' }],
  [{ type: 'path', d: 'M6.15 1.6H9.85V6.15H14.4V9.85H9.85V14.4H6.15V9.85H1.6V6.15H6.15Z' }],
  [{ type: 'path', d: 'M8 1.2L14.3 3.5V8.3C14.3 11.2 11.2 13.3 8 14.8C4.8 13.3 1.7 11.2 1.7 8.3V3.5Z' }],
  [
    { type: 'ellipse', cx: 5.7, cy: 12.2, rx: 3.15, ry: 2.15, rotate: -24 },
    { type: 'rect', x: 8.05, y: 1.7, width: 1.6, height: 9.35, rx: 0.35 },
    { type: 'path', d: 'M9.65 1.7C13.2 2.35 14.45 4.55 14.2 6.45C12.55 5.55 11.15 4.7 9.65 4.2Z' },
  ],
]

const ARTICLES = new Set([
  'a',
  'an',
  'the',
  'el',
  'la',
  'los',
  'las',
  'lo',
  'un',
  'una',
  'unos',
  'unas',
])

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function hashSongId(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function songIconIndex(id: string): number {
  return hashSongId(id) % SONG_ICON_SHAPES.length
}

// Even steps around the wheel. A mixed hash, not the icon index, picks the slot,
// so two songs can share a shape and still wear different colors.
export const SONG_MARK_HUES = [12, 42, 72, 102, 132, 162, 192, 222, 252, 282, 312, 342] as const

export type SongMarkTone = {
  background: string
  foreground: string
}

function mixHash(hash: number): number {
  let value = hash >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16
  return value >>> 0
}

export function songMarkTone(id: string): SongMarkTone {
  const mixed = mixHash(hashSongId(id))
  const slot = mixed % (SONG_MARK_HUES.length * 2)
  const hue = SONG_MARK_HUES[slot % SONG_MARK_HUES.length] ?? SONG_MARK_HUES[0]
  const deep = slot >= SONG_MARK_HUES.length
  const lightness = deep ? 0.42 : 0.7
  const chroma = deep ? 0.15 : 0.14
  return {
    background: `oklch(${lightness} ${chroma} ${hue})`,
    foreground: deep ? `oklch(0.985 0.012 ${hue})` : `oklch(0.27 0.05 ${hue})`,
  }
}

function letterWords(title: string): string[] {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
}

function pairFrom(words: string[]): string | null {
  if (words.length >= 2) {
    const first = words[0]
    const second = words[1]
    if (!first || !second) return null
    return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase()
  }
  const word = words[0]
  if (!word) return null
  const first = word[0] ?? ''
  const second = word[1] ?? first
  return `${first}${second}`.toUpperCase()
}

export function titleLetters(title: string): string {
  const words = letterWords(title)
  const significant = words.filter((word) => !ARTICLES.has(word.toLowerCase()))
  return pairFrom(significant) ?? pairFrom(words) ?? 'XX'
}

function lettersFromId(id: string, step: number): string {
  const slot = (hashSongId(id) + step) % (ALPHABET.length * ALPHABET.length)
  const first = ALPHABET[Math.floor(slot / ALPHABET.length)] ?? 'A'
  const second = ALPHABET[slot % ALPHABET.length] ?? 'A'
  return `${first}${second}`
}

// Title letters stay when that icon and pair are free in this list.
// A clash keeps the earlier id and takes the next free pair from the later id.
export function songMarkLetters(songs: SongRef[]): Map<string, string> {
  const ordered = [...songs].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const used = new Set<string>()
  const marks = new Map<string, string>()
  for (const song of ordered) {
    if (marks.has(song.id)) continue
    const icon = songIconIndex(song.id)
    let letters = titleLetters(song.title)
    if (used.has(`${icon}:${letters}`)) {
      for (let step = 0; step < ALPHABET.length * ALPHABET.length; step += 1) {
        const next = lettersFromId(song.id, step)
        if (!used.has(`${icon}:${next}`)) {
          letters = next
          break
        }
      }
    }
    used.add(`${icon}:${letters}`)
    marks.set(song.id, letters)
  }
  return marks
}

export function lettersForSong(marks: Map<string, string>, song: SongRef): string {
  return marks.get(song.id) ?? titleLetters(song.title)
}
