/** Read and write YouTube / bpm / duration / audio into chart text (YAML or ChordPro). */

export type ChartMediaPatch = {
  youtubeUrl?: string | null
  bpm?: number | null
  durationMs?: number | null
  audioUrl?: string | null
}

const YOUTUBE_LABEL = 'YouTube'

export function chartHasYoutube(text: string): boolean {
  return /youtu\.?be/i.test(text)
}

export function applyChartMedia(text: string, patch: ChartMediaPatch): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (normalized.trimStart().startsWith('---')) return patchMarkdown(normalized, patch)
  return patchChordPro(normalized, patch)
}

function patchMarkdown(text: string, patch: ChartMediaPatch): string {
  const match = text.match(/^---\n([\s\S]*?)\n---(\n?)/)
  if (!match) return text
  const body = text.slice(match[0].length)
  const front = match[1] ?? ''
  const fields = parseFrontFields(front)
  if (patch.bpm !== undefined) {
    if (patch.bpm == null) delete fields.scalars.bpm
    else fields.scalars.bpm = String(Math.round(patch.bpm))
  }
  if (patch.durationMs !== undefined) {
    if (patch.durationMs == null) delete fields.scalars.duration_ms
    else fields.scalars.duration_ms = String(Math.round(patch.durationMs))
  }
  if (patch.audioUrl !== undefined) {
    if (!patch.audioUrl?.trim()) delete fields.scalars.audio_url
    else fields.scalars.audio_url = patch.audioUrl.trim()
  }
  if (patch.youtubeUrl !== undefined) {
    if (!fields.sources.length && fields.scalars.source?.trim()) {
      fields.sources = [{ url: fields.scalars.source.trim(), label: 'Fuente' }]
    }
    fields.sources = upsertYoutubeSource(fields.sources, patch.youtubeUrl)
  }
  if (!fields.scalars.source && fields.sources[0]) {
    fields.scalars.source = fields.sources[0].url
  }
  const order = ['title', 'artist', 'composer', 'key', 'original_key', 'source', 'bpm', 'duration_ms', 'audio_url']
  const lines: string[] = []
  const seen = new Set<string>()
  for (const key of order) {
    const value = fields.scalars[key]
    if (value == null || !String(value).trim()) continue
    lines.push(`${key}: ${yaml(String(value))}`)
    seen.add(key)
  }
  for (const [key, value] of Object.entries(fields.scalars)) {
    if (seen.has(key) || !String(value).trim()) continue
    lines.push(`${key}: ${yaml(String(value))}`)
  }
  if (fields.sources.length) {
    lines.push('sources:')
    for (const item of fields.sources) {
      lines.push(`  - ${item.url}${item.label ? ` | ${item.label}` : ''}`)
    }
  }
  return `---\n${lines.join('\n')}\n---${match[2] ?? '\n'}${body}`
}

function patchChordPro(text: string, patch: ChartMediaPatch): string {
  const lines = text.split('\n')
  let metaEnd = lines.length
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (!trimmed) continue
    if (/^\{start_of_/i.test(trimmed) || /^#/.test(trimmed) || /^\[[^\]]+\]/.test(trimmed)) {
      metaEnd = index
      break
    }
    if (!trimmed.startsWith('{') && !trimmed.startsWith('#')) {
      metaEnd = index
      break
    }
  }
  const meta = lines.slice(0, metaEnd)
  const rest = lines.slice(metaEnd)
  const nextMeta = [...meta]

  const setDirective = (name: string, value: string | null) => {
    const pattern = new RegExp(`^\\{${name}:\\s*[^}]*\\}\\s*$`, 'i')
    const index = nextMeta.findIndex((line) => pattern.test(line.trim()))
    if (value == null || !value.trim()) {
      if (index >= 0) nextMeta.splice(index, 1)
      return
    }
    const line = `{${name}: ${value.trim()}}`
    if (index >= 0) nextMeta[index] = line
    else insertMeta(nextMeta, line, name)
  }

  if (patch.bpm !== undefined) {
    setDirective('bpm', patch.bpm == null ? null : String(Math.round(patch.bpm)))
  }
  if (patch.durationMs !== undefined) {
    setDirective('duration_ms', patch.durationMs == null ? null : String(Math.round(patch.durationMs)))
  }
  if (patch.audioUrl !== undefined) {
    setDirective('audio_url', patch.audioUrl?.trim() ? patch.audioUrl.trim() : null)
  }
  if (patch.youtubeUrl !== undefined) {
    const youtubePattern = /\{source:\s*([^}]*)\}/i
    const youtubeIndexes: number[] = []
    for (let index = 0; index < nextMeta.length; index += 1) {
      const match = (nextMeta[index] ?? '').trim().match(youtubePattern)
      if (!match) continue
      const raw = (match[1] ?? '').trim()
      if (/youtu\.?be/i.test(raw) || /\|\s*youtube\s*$/i.test(raw)) youtubeIndexes.push(index)
    }
    const url = patch.youtubeUrl?.trim() ?? ''
    if (!url) {
      for (const index of youtubeIndexes.reverse()) nextMeta.splice(index, 1)
    } else {
      const line = `{source: ${url} | ${YOUTUBE_LABEL}}`
      if (youtubeIndexes.length) {
        nextMeta[youtubeIndexes[0]!] = line
        for (const index of youtubeIndexes.slice(1).reverse()) nextMeta.splice(index, 1)
      } else {
        insertMeta(nextMeta, line, 'source')
      }
    }
  }

  while (nextMeta.length && !(nextMeta[nextMeta.length - 1] ?? '').trim()) nextMeta.pop()
  const spacer = rest.length && (rest[0] ?? '').trim() ? [''] : []
  return [...nextMeta, ...spacer, ...rest].join('\n')
}

function insertMeta(meta: string[], line: string, name: string) {
  const priority = ['title', 'artist', 'composer', 'key', 'original_key', 'source', 'bpm', 'duration_ms', 'audio_url']
  const rank = priority.indexOf(name)
  let insertAt = meta.length
  for (let index = meta.length - 1; index >= 0; index -= 1) {
    const match = (meta[index] ?? '').trim().match(/^\{([A-Za-z_]+):/)
    if (!match?.[1]) continue
    const other = priority.indexOf(match[1].toLowerCase())
    if (other >= 0 && (rank < 0 || other <= rank)) {
      insertAt = index + 1
      break
    }
  }
  meta.splice(insertAt, 0, line)
}

type FrontFields = {
  scalars: Record<string, string>
  sources: { url: string; label: string }[]
}

function parseFrontFields(front: string): FrontFields {
  const scalars: Record<string, string> = {}
  const sources: { url: string; label: string }[] = []
  let inSources = false
  for (const line of front.split('\n')) {
    if (/^sources:\s*$/i.test(line.trim())) {
      inSources = true
      continue
    }
    if (inSources) {
      const item = line.match(/^\s*-\s+(.+)$/)
      if (item) {
        const parsed = parseSource(item[1] ?? '')
        if (parsed) sources.push(parsed)
        continue
      }
      if (/^\s/.test(line) && line.trim()) continue
      inSources = false
    }
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (!match?.[1]) continue
    scalars[match[1].toLowerCase()] = unquote(match[2] ?? '')
  }
  return { scalars, sources }
}

function upsertYoutubeSource(
  sources: { url: string; label: string }[],
  youtubeUrl: string | null | undefined,
): { url: string; label: string }[] {
  const trimmed = youtubeUrl?.trim() ?? ''
  const index = sources.findIndex(
    (item) => item.label.trim().toLowerCase() === 'youtube' || /youtu\.?be/i.test(item.url),
  )
  if (!trimmed) {
    if (index < 0) return sources
    return sources.filter((_, entryIndex) => entryIndex !== index)
  }
  const next = { url: trimmed, label: YOUTUBE_LABEL }
  if (index >= 0) return sources.map((item, entryIndex) => (entryIndex === index ? next : item))
  return [...sources, next]
}

function parseSource(raw: string): { url: string; label: string } | null {
  const text = unquote(raw)
  if (!text) return null
  const [urlPart, ...labelParts] = text.split('|')
  const url = (urlPart ?? '').trim()
  if (!url) return null
  return { url, label: labelParts.join('|').trim() }
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function yaml(value: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || /^\s|\s$/.test(value) || value === '') {
    return JSON.stringify(value)
  }
  return value
}
