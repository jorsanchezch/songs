import type {
  ChordMark,
  NoteType,
  Song,
  SongNote,
  SongSection,
  SongSource,
  SongVersion,
} from '@/lib/types'
import { NOTE_TYPES } from '@/lib/types'

const TAG_LABEL: Record<string, string> = {
  intro: 'Intro',
  verse: 'Verso',
  chorus: 'Coro',
  bridge: 'Puente',
  solo: 'Solo',
  tab: 'Tablatura',
  outro: 'Final',
  ending: 'Final',
  interlude: 'Interludio',
  'pre-chorus': 'Pre-coro',
  prechorus: 'Pre-coro',
  tag: 'Tag',
}

const DIRECTIVE = /^\{([a-z0-9_-]+)(?::\s*([^}]*))?\}\s*$/i

export function parseChart(text: string, filePath: string): Song {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimStart()
  if (filePath.endsWith('.song.md') || body.startsWith('---\n')) return parseMarkdown(body, filePath)
  return parseChordPro(body, filePath)
}

function parseChordPro(text: string, filePath: string): Song {
  const lines = text.split('\n')
  const meta: Record<string, string> = {}
  const sourceEntries: SongSource[] = []
  const usesDirectives = lines.some((line) =>
    /^\{start_of_[a-z0-9_-]+/i.test(line.trim()),
  )
  const notes = noteFactory()
  const usedIds = new Set<string>()
  const labelCounts = new Map<string, number>()
  const sections: SongSection[] = []
  let current: SongSection | null = null
  let pending: SongNote[] = []
  let explicitSection = false

  const open = (label: string) => {
    if (current) {
      attachPending(current, pending)
      pending = []
    }
    explicitSection = true
    const unique = uniqueLabel(label, labelCounts)
    current = {
      id: allocId(undefined, unique, usedIds),
      label: unique,
      repeat: 1,
      notes: [],
      lines: [],
    }
    sections.push(current)
    if (pending.length) current.notes.push(...pending.splice(0))
  }

  const ensure = () => {
    if (!current) {
      current = {
        id: allocId(undefined, 'Intro', usedIds),
        label: 'Intro',
        repeat: 1,
        notes: [],
        lines: [],
      }
      sections.push(current)
    }
    return current
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const trimmed = raw.trim()
    if (!trimmed) continue

    const directive = trimmed.match(DIRECTIVE)
    if (directive) {
      const name = (directive[1] ?? '').toLowerCase()
      const value = (directive[2] ?? '').trim()
      if (name.startsWith('start_of_')) {
        const tag = name.slice('start_of_'.length)
        open(value || TAG_LABEL[tag] || tag)
        continue
      }
      if (name.startsWith('end_of_')) {
        attachPending(current, pending)
        pending = []
        current = null
        continue
      }
      if (name === 'comment') {
        pending.push(notes(classifyComment(value, false), value))
        continue
      }
      if (['title', 'artist', 'composer', 'key'].includes(name)) {
        meta[name] = value
      }
      if (name === 'source' && value) {
        const parsed = parseSourceEntry(value)
        if (parsed) sourceEntries.push(parsed)
      }
      continue
    }

    if (!usesDirectives) {
      const heading = headingLabel(trimmed)
      if (heading) {
        open(heading)
        continue
      }
    }

    const repeats = repeatMarker(trimmed)
    if (repeats) {
      ensure().repeat = repeats
      continue
    }

    if (isChordLine(raw)) {
      const section = ensure()
      const parsed = parseChordTokens(raw, notes, true)
      const { lyric, consumed, afterNotes } = takeLyric(lines, index, notes)
      index += consumed
      section.lines.push({
        chords: parsed.chords,
        lyric,
        notes: [...takeLineNotes(section, pending), ...parsed.lineNotes, ...afterNotes],
      })
      continue
    }

    const section = ensure()
    section.lines.push({
      chords: [],
      lyric: raw.trimEnd(),
      notes: pending.splice(0),
    })
  }

  attachPending(current, pending)

  if (!explicitSection && sections.length === 1 && sections[0]?.label === 'Intro') {
    sections[0].label = 'Canción'
    sections[0].id = 'cancion'
  }

  return finishSong(filePath, meta, sourceEntries, sections.filter(hasBody), [])
}

function parseMarkdown(text: string, filePath: string): Song {
  const { meta, sources, body } = frontMatter(text)
  const lines = body.split('\n')
  const notes = noteFactory()
  const usedIds = new Set<string>()
  const sections: SongSection[] = []
  const versions: SongVersion[] = []
  let current: SongSection | null = null
  let pending: SongNote[] = []
  let inVersions = false
  let version: SongVersion | null = null

  const open = (label: string, id: string | undefined, same: string | undefined, repeat: number) => {
    if (current) {
      attachPending(current, pending)
      pending = []
    }
    current = {
      id: allocId(id, label, usedIds),
      label,
      sameAs: same,
      repeat,
      notes: [],
      lines: [],
    }
    sections.push(current)
    if (pending.length) {
      current.notes.push(...pending.splice(0))
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const trimmed = raw.trim()
    if (!trimmed) continue

    if (/^##\s+versions\s*$/i.test(trimmed)) {
      inVersions = true
      current = null
      continue
    }

    if (inVersions) {
      const versionHeading = trimmed.match(/^###\s+(.+)$/)
      if (versionHeading) {
        const label = (versionHeading[1] ?? '').trim()
        version = {
          id: allocId(undefined, label, usedIds),
          label,
          flow: [],
          openNotes: [],
        }
        versions.push(version)
        continue
      }
      const flow = trimmed.match(/^-\s*flow:\s*(.*)$/i)
      if (flow && version) {
        version.flow = (flow[1] ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
        continue
      }
      const noteLine = trimmed.match(/^-\s*notes:\s*(.*)$/i)
      if (noteLine && version) {
        version.openNotes = (noteLine[1] ?? '')
          .split(',')
          .map((type) => type.trim().toLowerCase())
          .filter((type): type is NoteType =>
            (NOTE_TYPES as string[]).includes(type),
          )
      }
      continue
    }

    const heading = markdownHeading(trimmed)
    if (heading) {
      open(heading.label, heading.id, heading.same, heading.repeat ?? 1)
      continue
    }

    const noteLine = trimmed.match(
      /^>\s*(cue|how|repeat|arrange|free)\s*:\s*(.+)$/i,
    )
    if (noteLine) {
      const type = noteLine[1]!.toLowerCase() as NoteType
      pending.push(notes(type, (noteLine[2] ?? '').trim()))
      continue
    }

    if (!current) {
      current = {
        id: allocId(undefined, 'Canción', usedIds),
        label: 'Canción',
        repeat: 1,
        notes: [],
        lines: [],
      }
      sections.push(current)
    }

    if (isChordLine(raw)) {
      const parsed = parseChordTokens(raw, notes, false)
      const { lyric, consumed, afterNotes } = takeLyric(lines, index, notes)
      index += consumed
      current.lines.push({
        chords: parsed.chords,
        lyric,
        notes: [
          ...takeLineNotes(current, pending),
          ...parsed.lineNotes,
          ...afterNotes,
        ],
      })
      continue
    }

    current.lines.push({
      chords: [],
      lyric: raw.trimEnd(),
      notes: pending.splice(0),
    })
  }

  attachPending(current, pending)

  return finishSong(
    filePath,
    meta,
    sources,
    sections.filter((section) => section.sameAs || hasBody(section)),
    versions,
  )
}

function finishSong(
  filePath: string,
  meta: Record<string, string>,
  sourceEntries: SongSource[],
  sections: SongSection[],
  versions: SongVersion[],
): Song {
  const title = meta.title || titleFromPath(filePath)
  const artist =
    meta.artist ||
    titleFromPath(filePath).split(/\s+-\s+/)[1] ||
    ''
  const lyricsText = sections
    .flatMap((section) => section.lines.map((line) => line.lyric ?? ''))
    .join('\n')
    .replace(/_+/g, ' ')
  const sources = mergeSources(sourceEntries, meta.source ?? '')
  return {
    id: filePath.replace(/\.(song\.md|chopro|cho)$/i, ''),
    title,
    artist,
    composer: meta.composer ?? '',
    key: (meta.key ?? '').trim(),
    source: sources[0]?.url ?? '',
    sources,
    sections,
    versions,
    lyricsText,
  }
}

function attachPending(section: SongSection | null, pending: SongNote[]) {
  if (!section || !pending.length) return
  if (!section.lines.length) section.notes.push(...pending.splice(0))
  else section.lines[section.lines.length - 1]?.notes.push(...pending.splice(0))
}

function takeLineNotes(section: SongSection, pending: SongNote[]): SongNote[] {
  if (!pending.length) return []
  if (!section.lines.length) {
    section.notes.push(...pending.splice(0))
    return []
  }
  return pending.splice(0)
}

function hasBody(section: SongSection): boolean {
  return section.lines.length > 0 || section.notes.length > 0
}

function frontMatter(text: string): {
  meta: Record<string, string>
  sources: SongSource[]
  body: string
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { meta: {}, sources: [], body: text }
  const meta: Record<string, string> = {}
  const sources: SongSource[] = []
  const lines = (match[1] ?? '').split('\n')
  let inSources = false
  for (const line of lines) {
    if (/^sources:\s*$/i.test(line.trim())) {
      inSources = true
      continue
    }
    if (inSources) {
      const item = line.match(/^\s*-\s+(.+)$/)
      if (item) {
        const parsed = parseSourceEntry(item[1] ?? '')
        if (parsed) sources.push(parsed)
        continue
      }
      if (/^\s/.test(line) && line.trim()) continue
      inSources = false
    }
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (pair) meta[pair[1]!.toLowerCase()] = unquote(pair[2] ?? '')
  }
  return { meta, sources, body: text.slice(match[0].length) }
}

function parseSourceEntry(raw: string): SongSource | null {
  const text = unquote(raw.trim())
  if (!text) return null
  const split = text.match(/^(https?:\/\/\S+)\s*\|\s*(.+)$/i) || text.match(/^(\S+)\s*\|\s*(.+)$/)
  if (split) {
    return { url: (split[1] ?? '').trim(), label: (split[2] ?? '').trim() }
  }
  if (/^https?:\/\//i.test(text) || text.includes('.')) {
    return { url: text, label: defaultSourceLabel(text) }
  }
  return null
}

function mergeSources(entries: SongSource[], legacy: string): SongSource[] {
  const out: SongSource[] = []
  const seen = new Set<string>()
  const add = (item: SongSource | null) => {
    if (!item?.url || seen.has(item.url)) return
    seen.add(item.url)
    out.push(item)
  }
  for (const entry of entries) add(entry)
  add(parseSourceEntry(legacy))
  return out
}

function defaultSourceLabel(url: string): string {
  if (/youtu(\.be|be\.com)/i.test(url)) return 'YouTube'
  if (/\.pdf($|\?)/i.test(url)) return 'Cifra PDF'
  return 'Fuente'
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return trimmed
}

function markdownHeading(line: string): {
  label: string
  id?: string
  same?: string
  repeat?: number
} | null {
  const match = line.match(/^##\s+(.+)$/)
  if (!match) return null
  let label = (match[1] ?? '').trim()
  const brace = label.match(/^(.*)\s+\{([^}]*)\}\s*$/)
  let attrs = ''
  if (brace) {
    label = (brace[1] ?? '').trim()
    attrs = brace[2] ?? ''
  }
  const id = attrs.match(/#([a-z0-9-]+)/)?.[1]
  const same = attrs.match(/\bsame=([a-z0-9-]+)/)?.[1]
  const repeat = attrs.match(/\brepeat=(\d+)/)?.[1]
  return {
    label,
    id,
    same,
    repeat: repeat ? Number(repeat) : undefined,
  }
}

function headingLabel(line: string): string | null {
  if (line.length > 80 || line.includes('[') || line.includes('{')) return null
  if (!line.endsWith(':')) return null
  const label = line.slice(0, -1).trim()
  return label || null
}

function repeatMarker(line: string): number | null {
  const match =
    line.match(/^(?:x|×)\s*(\d+)$/i) ||
    line.match(/^(\d+)\s*(?:x|×)$/i) ||
    line.match(/^\((?:x|×)\s*(\d+)\)$/i)
  if (!match) return null
  const value = Number(match[1] ?? match[2])
  return Number.isFinite(value) && value > 0 ? value : null
}

function isChordLine(line: string): boolean {
  if (!line.includes('[')) return false
  const stripped = line
    .replace(/\{(?:comment|cue|how|repeat|arrange|free):[^}]*\}/gi, '')
    .replace(/\[[^\]]*\]/g, '')
  return stripped.trim() === ''
}

function parseChordTokens(
  line: string,
  notes: (type: NoteType, text: string) => SongNote,
  fromChordPro: boolean,
): { chords: ChordMark[]; lineNotes: SongNote[] } {
  const chords: ChordMark[] = []
  const lineNotes: SongNote[] = []
  let pending: SongNote[] = []
  let index = 0

  while (index < line.length) {
    if (line[index] === '{') {
      const end = line.indexOf('}', index)
      if (end < 0) break
      const inner = line.slice(index + 1, end)
      const match = inner.match(
        /^(comment|cue|how|repeat|arrange|free)\s*:\s*([\s\S]*)$/i,
      )
      if (match) {
        const kind = match[1]!.toLowerCase()
        const text = (match[2] ?? '').trim()
        const type =
          kind === 'comment'
            ? classifyComment(text, true)
            : (kind as NoteType)
        pending.push(notes(type, text))
      }
      index = end + 1
      continue
    }

    if (line[index] === '[') {
      const end = line.indexOf(']', index)
      if (end < 0) break
      const raw = line.slice(index + 1, end).trim()
      const column = index
      index = end + 1
      const chordNotes = pending.splice(0)
      while (line[index] === '{') {
        const endNote = line.indexOf('}', index)
        if (endNote < 0) break
        const inner = line.slice(index + 1, endNote)
        const match = inner.match(/^(cue|how|repeat|arrange|free)\s*:\s*([\s\S]*)$/i)
        if (!match) break
        chordNotes.push(notes(match[1]!.toLowerCase() as NoteType, (match[2] ?? '').trim()))
        index = endNote + 1
      }
      if (raw) {
        chords.push({ raw, column, notes: chordNotes })
      }
      continue
    }

    index += 1
  }

  if (pending.length) {
    if (fromChordPro && chords.length) {
      chords[chords.length - 1]?.notes.push(...pending)
    } else {
      lineNotes.push(...pending)
    }
  }

  return { chords, lineNotes }
}

function takeLyric(
  lines: string[],
  chordIndex: number,
  notes: (type: NoteType, text: string) => SongNote,
): { lyric: string | null; consumed: number; afterNotes: SongNote[] } {
  const afterNotes: SongNote[] = []
  let cursor = chordIndex + 1
  while (cursor < lines.length) {
    const trimmed = (lines[cursor] ?? '').trim()
    const comment = trimmed.match(/^\{comment:\s*([^}]*)\}\s*$/i)
    const markdownNote = trimmed.match(
      /^>\s*(cue|how|repeat|arrange|free)\s*:\s*(.+)$/i,
    )
    if (comment) {
      afterNotes.push(notes(classifyComment(comment[1] ?? '', false), (comment[1] ?? '').trim()))
      cursor += 1
      continue
    }
    if (markdownNote) {
      afterNotes.push(
        notes(
          markdownNote[1]!.toLowerCase() as NoteType,
          (markdownNote[2] ?? '').trim(),
        ),
      )
      cursor += 1
      continue
    }
    break
  }

  const candidate = lines[cursor] ?? ''
  const trimmed = candidate.trim()
  if (
    !trimmed ||
    isChordLine(candidate) ||
    headingLabel(trimmed) ||
    trimmed.startsWith('##') ||
    DIRECTIVE.test(trimmed) ||
    repeatMarker(trimmed)
  ) {
    return { lyric: null, consumed: cursor - chordIndex - 1, afterNotes }
  }

  return {
    lyric: candidate.trimEnd(),
    consumed: cursor - chordIndex,
    afterNotes,
  }
}

function classifyComment(text: string, inline: boolean): NoteType {
  const value = text.toLowerCase()
  if (/repeat|two-time|\(\/\/\)|×|x\s*\d/.test(value)) return 'repeat'
  if (/guitar out|solo|bater[ií]a|drums/.test(value)) return 'arrange'
  if (inline && /arpegg|arpegiat|muted|slide|riff/.test(value)) return 'how'
  if (inline) return 'cue'
  return 'free'
}

function noteFactory(): (type: NoteType, text: string) => SongNote {
  let seq = 0
  return (type, text) => {
    seq += 1
    return { id: `n${seq}`, type, text }
  }
}

function allocId(preferred: string | undefined, label: string, used: Set<string>): string {
  const base = preferred || slugify(label) || 'seccion'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let count = 2
  while (used.has(`${base}-${count}`)) count += 1
  const id = `${base}-${count}`
  used.add(id)
  return id
}

function uniqueLabel(label: string, counts: Map<string, number>): string {
  const next = (counts.get(label) ?? 0) + 1
  counts.set(label, next)
  return next === 1 ? label : `${label} ${next}`
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.(song\.md|chopro|cho)$/i, '')
}
