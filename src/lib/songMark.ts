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

export const SONG_MARK_TONES = SONG_MARK_HUES.length * 2

/** One of the light or deep tones around the wheel. */
export function markTone(slot: number): SongMarkTone {
  const wrapped = ((slot % SONG_MARK_TONES) + SONG_MARK_TONES) % SONG_MARK_TONES
  const hue = SONG_MARK_HUES[wrapped % SONG_MARK_HUES.length] ?? SONG_MARK_HUES[0]
  const deep = wrapped >= SONG_MARK_HUES.length
  const lightness = deep ? 0.42 : 0.7
  const chroma = deep ? 0.15 : 0.14
  return {
    background: `oklch(${lightness} ${chroma} ${hue})`,
    foreground: deep ? `oklch(0.985 0.012 ${hue})` : `oklch(0.27 0.05 ${hue})`,
  }
}

function toneSlot(id: string): number {
  return mixHash(hashSongId(id)) % SONG_MARK_TONES
}

export function songMarkTone(id: string): SongMarkTone {
  return markTone(toneSlot(id))
}

export type MarkLook = { shape: number; tone: number }

// Each id starts from its own shape and tone. A clash keeps the earlier id
// and moves the later one to the next free tone, so the result ignores list order.
export function distinctMarks(ids: string[]): Map<string, MarkLook> {
  const used = new Set<string>()
  const looks = new Map<string, MarkLook>()
  const total = SONG_ICON_SHAPES.length * SONG_MARK_TONES
  for (const id of [...new Set(ids)].sort((a, b) => a.localeCompare(b, 'en'))) {
    const start = songIconIndex(id) * SONG_MARK_TONES + toneSlot(id)
    for (let step = 0; step < total; step += 1) {
      const combo = (start + step) % total
      const look = { shape: Math.floor(combo / SONG_MARK_TONES), tone: combo % SONG_MARK_TONES }
      if (used.has(`${look.shape}:${look.tone}`)) continue
      used.add(`${look.shape}:${look.tone}`)
      looks.set(id, look)
      break
    }
  }
  return looks
}
