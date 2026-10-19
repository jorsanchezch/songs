export type ChartMeta = {
  title: string
  artist: string
  composer: string
  key: string
  source: string
  lyrics: string
}

export function chartMeta(text: string, fileId: string): ChartMeta {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const fallback = titleFromFile(fileId)
  const fromFront = frontMatter(body)
  const fromTags = chordProMeta(body)
  const meta = { ...fromTags, ...fromFront }
  const lyrics = stripLyrics(body)
  return {
    title: clean(meta.title) || fallback.title,
    artist: clean(meta.artist) || fallback.artist,
    composer: clean(meta.composer),
    key: clean(meta.key),
    source: clean(meta.source),
    lyrics,
  }
}

function frontMatter(body: string): Record<string, string> {
  if (!body.startsWith('---\n')) return {}
  const end = body.indexOf('\n---', 4)
  if (end < 0) return {}
  const meta: Record<string, string> = {}
  for (const line of body.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (!match?.[1]) continue
    meta[match[1].toLowerCase()] = match[2] ?? ''
  }
  return meta
}

function chordProMeta(body: string): Record<string, string> {
  const meta: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const match = line.trim().match(/^\{(title|artist|composer|key|source):\s*([^}]*)\}/i)
    if (!match?.[1]) continue
    meta[match[1].toLowerCase()] = match[2] ?? ''
  }
  return meta
}

function stripLyrics(body: string): string {
  const withoutFront = body.startsWith('---\n') ? body.replace(/^---\n[\s\S]*?\n---\n?/, '') : body
  return withoutFront
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/^#+\s+.*$/gm, ' ')
    .replace(/_+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function titleFromFile(fileId: string): { title: string; artist: string } {
  const base = fileId.split('/').pop() || fileId
  const parts = base.split(/\s+-\s+/)
  return { title: parts[0] || base, artist: parts[1] || '' }
}

function clean(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
