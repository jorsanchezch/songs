import { chartToSongMd, fetchChartPage } from '@/lib/importChart'
import { parseChart } from '@/lib/parseChart'
import type { Song, SongOrigin } from '@/lib/types'

export const BULK_LIMIT = 40

export type ParsedLine = {
  name: string
  url: string
}

export type KnownSong = {
  id: string
  title: string
  artist: string
  source: string
  origin?: SongOrigin
  ownerId?: string
}

export type ImportResult = {
  status: 'saved' | 'exists'
  id: string
  title: string
  message: string
}

type MatchHint = {
  url?: string
  source?: string
  title?: string
  artist?: string
}

type Match = {
  song: KnownSong
  kind: 'catalog' | 'own'
}

export function parseBulkLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = []
  for (const raw of text.split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(/https?:\/\/[^\s<>)\]]+/i)
    if (!match || match.index == null) {
      lines.push({ name: line, url: '' })
      continue
    }
    const url = cleanUrl(match[0])
    if (!url) {
      lines.push({ name: line, url: '' })
      continue
    }
    const name = `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-–—,:]+|[-–—,:]+$/g, '')
      .trim()
    lines.push({ name, url })
  }
  return lines
}

export function parseSongQuery(line: string): { title: string; artist: string } {
  const trimmed = line.trim()
  const spaced = trimmed.split(/\s+[-–—]\s+/)
  if (spaced.length >= 2 && spaced[0]?.trim() && spaced[1]?.trim()) {
    return { title: spaced[0].trim(), artist: spaced.slice(1).join(' - ').trim() }
  }
  const comma = trimmed.split(',')
  if (comma.length === 2 && comma[0]?.trim() && comma[1]?.trim()) {
    return { title: comma[0].trim(), artist: comma[1].trim() }
  }
  return { title: trimmed, artist: '' }
}

export function chartQuery(title: string, artist: string): string {
  return [title, artist, 'cifra'].filter(Boolean).join(' ')
}

export function cleanUrl(token: string): string {
  const stripped = token.trim().replace(/[),.;:]+$/g, '')
  try {
    const url = new URL(stripped)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    let path = url.pathname
    try {
      path = decodeURIComponent(path)
    } catch {
      // Keep the raw path when it is not valid encoding.
    }
    path = path.replace(/\/+$/, '').toLowerCase()
    return `${host}${path}`
  } catch {
    return ''
  }
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export class SongIndex {
  private songs: KnownSong[]
  private userId: string

  constructor(songs: KnownSong[], userId: string) {
    this.userId = userId
    this.songs = songs.map((song) => ({ ...song }))
  }

  find(hint: MatchHint): Match | null {
    const keys = [normalizeUrl(hint.url ?? ''), normalizeUrl(hint.source ?? '')].filter(Boolean)
    for (const key of keys) {
      const catalog = this.byUrl(key, 'catalog')
      if (catalog) return { song: catalog, kind: 'catalog' }
      const own = this.byUrl(key, 'own')
      if (own) return { song: own, kind: 'own' }
    }
    const title = normalizeName(hint.title ?? '')
    if (!title) return null
    const artist = normalizeName(hint.artist ?? '')
    const catalog = this.byTitle(title, artist, 'catalog')
    if (catalog) return { song: catalog, kind: 'catalog' }
    const own = this.byTitle(title, artist, 'own')
    if (own) return { song: own, kind: 'own' }
    return null
  }

  remember(song: { id: string; title: string; artist: string; source: string }) {
    this.songs.push({ ...song, origin: 'local', ownerId: this.userId })
  }

  private byUrl(key: string, scope: 'catalog' | 'own'): KnownSong | undefined {
    return this.songs.find((song) => this.inScope(song, scope) && normalizeUrl(song.source) === key)
  }

  private byTitle(title: string, artist: string, scope: 'catalog' | 'own'): KnownSong | undefined {
    const titled = this.songs.filter((song) => this.inScope(song, scope) && normalizeName(song.title) === title)
    if (artist) return titled.find((song) => normalizeName(song.artist) === artist)
    return titled.length === 1 ? titled[0] : undefined
  }

  private inScope(song: KnownSong, scope: 'catalog' | 'own'): boolean {
    if (scope === 'catalog') return song.origin === 'catalog'
    return song.ownerId === this.userId && song.origin !== 'catalog'
  }
}

export function existsMessage(kind: 'catalog' | 'own', title: string): string {
  if (kind === 'catalog') return `Ya está en el catálogo: ${title}.`
  return `Ya la tienes: ${title}.`
}

export async function importChartUrl(
  url: string,
  hint: { title?: string; artist?: string },
  index: SongIndex,
  saveNew: (markdown: string) => Promise<string>,
): Promise<ImportResult> {
  const link = cleanUrl(url)
  if (!link) throw new Error('Ese texto no es un enlace, así que no lo importo.')
  const known = index.find({ url: link, title: hint.title, artist: hint.artist })
  if (known) {
    return {
      status: 'exists',
      id: known.song.id,
      title: known.song.title,
      message: existsMessage(known.kind, known.song.title),
    }
  }
  const page = await fetchChartPage(link)
  const markdown = chartToSongMd(page, link)
  const parsed = parseChart(markdown, 'import.song.md')
  const again = index.find({
    url: link,
    source: parsed.source,
    title: parsed.title,
    artist: parsed.artist,
  })
  if (again) {
    return {
      status: 'exists',
      id: again.song.id,
      title: again.song.title,
      message: existsMessage(again.kind, again.song.title),
    }
  }
  const id = await saveNew(markdown)
  index.remember({
    id,
    title: parsed.title,
    artist: parsed.artist,
    source: parsed.source || link,
  })
  return { status: 'saved', id, title: parsed.title, message: `Guardada: ${parsed.title}.` }
}

export function songsFromLibrary(songs: Song[]): KnownSong[] {
  return songs.map((song) => ({
    id: song.id,
    title: song.title,
    artist: song.artist,
    source: song.source,
    origin: song.origin,
    ownerId: song.ownerId,
  }))
}

export function summarizeImports(rows: { status: string }[]): string {
  const count = (status: string) => rows.filter((row) => row.status === status).length
  const saved = count('saved')
  const exists = count('exists')
  const failed = count('failed')
  const names = count('name')
  return `Listo: ${saved} guardadas, ${exists} ya estaban, ${failed} fallaron. ${names} sin enlace, no se importaron.`
}
