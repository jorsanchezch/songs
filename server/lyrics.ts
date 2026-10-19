type Slot = {
  before: string[]
  lyric: string | null
}

type Section = {
  label: string
  open: string
  close: string
  slots: Slot[]
}

type Parsed = {
  format: 'md' | 'cho'
  key: string
  preamble: string
  sections: Section[]
  trailing: string
}

/** Copy lyric lines and section labels onto another full chart. Chords and playing notes stay. */
export function shareLyrics(targetText: string, savedText: string): string {
  const target = parseParts(targetText)
  const saved = parseParts(savedText)
  const merged = applySharedWords(target, saved)
  if (sameWords(target, merged)) return targetText
  return renderParts(merged)
}

function applySharedWords(target: Parsed, saved: Parsed): Parsed {
  const sections = target.sections.map((section, index) => {
    const from = saved.sections[index]
    if (!from) {
      return {
        ...section,
        slots: section.slots
          .map((slot) => ({ ...slot, lyric: null }))
          .filter((slot) => slot.before.length > 0),
      }
    }
    const lyrics = from.slots.map((slot) => slot.lyric)
    const slots = section.slots.map((slot, slotIndex) => ({
      ...slot,
      lyric: slotIndex < lyrics.length ? (lyrics[slotIndex] ?? null) : null,
    }))
    for (const extra of from.slots.slice(section.slots.length)) {
      if (extra.lyric) slots.push({ before: [], lyric: extra.lyric })
    }
    const label = from.label || section.label
    return {
      ...section,
      label,
      open: label === section.label ? section.open : withLabel(section.open, label),
      slots,
    }
  })
  for (const extra of saved.sections.slice(target.sections.length)) {
    const slots = extra.slots.flatMap((slot) => (slot.lyric ? [{ before: [], lyric: slot.lyric }] : []))
    if (!slots.length) continue
    sections.push({
      label: extra.label,
      open: target.format === 'md' ? `## ${extra.label}` : `{start_of_verse: ${extra.label}}`,
      close: target.format === 'md' ? '' : '{end_of_verse}',
      slots,
    })
  }
  return {
    ...target,
    key: saved.key || target.key,
    sections,
  }
}

function sameWords(left: Parsed, right: Parsed): boolean {
  if ((left.key || '') !== (right.key || '')) return false
  if (left.sections.length !== right.sections.length) return false
  for (let index = 0; index < left.sections.length; index += 1) {
    const a = left.sections[index]
    const b = right.sections[index]
    if (!a || !b || a.label !== b.label || a.slots.length !== b.slots.length) return false
    for (let slot = 0; slot < a.slots.length; slot += 1) {
      if ((a.slots[slot]?.lyric ?? null) !== (b.slots[slot]?.lyric ?? null)) return false
    }
  }
  return true
}

function parseParts(text: string): Parsed {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  return normalized.trimStart().startsWith('---') ? parseMarkdown(normalized) : parseChordPro(normalized)
}

function parseMarkdown(text: string): Parsed {
  const front = text.match(/^---\n[\s\S]*?\n---\n?/)
  const preamble = front?.[0] ?? ''
  const key = unquote(preamble.match(/^key:\s*(.*)$/m)?.[1] ?? '')
  return parseBody(text.slice(preamble.length), 'md', key, preamble)
}

function parseChordPro(text: string): Parsed {
  const lines = text.split('\n')
  const head: string[] = []
  let index = 0
  for (; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (!trimmed) {
      head.push(lines[index] ?? '')
      continue
    }
    if (isSectionStart(trimmed) || isChordLine(lines[index] ?? '') || isLyricLine(trimmed)) break
    head.push(lines[index] ?? '')
  }
  const preamble = head.join('\n')
  const key = preamble.match(/^\{key:\s*([^}]*)\}/im)?.[1]?.trim() ?? ''
  return parseBody(lines.slice(index).join('\n'), 'cho', key, preamble)
}

function parseBody(body: string, format: 'md' | 'cho', key: string, preamble: string): Parsed {
  const lines = body.split('\n')
  const sections: Section[] = []
  let current: Section | null = null
  let pending: string[] = []
  let trailingAt = -1

  const ensure = () => {
    if (!current) {
      current = { label: 'Canción', open: '', close: '', slots: [] }
      sections.push(current)
    }
    return current
  }

  const flush = (lyric: string | null) => {
    const section = ensure()
    section.slots.push({ before: pending, lyric })
    pending = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (/^##\s+versions\s*$/i.test(trimmed)) {
      trailingAt = index
      break
    }
    if (isSectionStart(trimmed)) {
      if (pending.length) flush(null)
      current = { label: sectionLabel(trimmed), open: raw.trimEnd(), close: '', slots: [] }
      sections.push(current)
      continue
    }
    if (isSectionEnd(trimmed)) {
      if (pending.length) flush(null)
      if (current) current.close = raw.trimEnd()
      current = null
      continue
    }
    if (isNoteLine(trimmed) || isRepeatMarker(trimmed)) {
      pending.push(raw.trimEnd())
      continue
    }
    if (isChordLine(raw)) {
      pending.push(raw.trimEnd())
      let cursor = index + 1
      while (cursor < lines.length) {
        const next = lines[cursor] ?? ''
        const nextTrim = next.trim()
        if (!nextTrim) {
          cursor += 1
          continue
        }
        if (isNoteLine(nextTrim)) {
          pending.push(next.trimEnd())
          cursor += 1
          continue
        }
        break
      }
      const candidate = lines[cursor] ?? ''
      const candidateTrim = candidate.trim()
      if (candidateTrim && isLyricLine(candidateTrim) && !isChordLine(candidate)) {
        flush(candidate.trimEnd())
        index = cursor
      } else {
        flush(null)
        index = cursor - 1
      }
      continue
    }
    if (isLyricLine(trimmed)) flush(raw.trimEnd())
  }
  if (pending.length) flush(null)
  const trailing = trailingAt >= 0 ? lines.slice(trailingAt).join('\n') : ''
  return { format, key, preamble, sections: sections.filter(hasContent), trailing }
}

function hasContent(section: Section): boolean {
  return Boolean(section.open || section.close || section.slots.length)
}

function renderParts(chart: Parsed): string {
  const chunks = [setKey(chart.preamble, chart.format, chart.key).replace(/\s*$/, '')]
  for (const section of chart.sections) {
    const lines: string[] = []
    if (section.open) lines.push(section.open)
    for (const slot of section.slots) {
      lines.push(...slot.before)
      if (slot.lyric != null) lines.push(slot.lyric)
    }
    if (section.close) lines.push(section.close)
    const block = lines.join('\n')
    if (block.trim()) chunks.push(block)
  }
  if (chart.trailing.trim()) chunks.push(chart.trailing.replace(/^\n+/, '').replace(/\s*$/, ''))
  return `${chunks.filter((chunk) => chunk.trim()).join('\n\n')}\n`
}

function setKey(preamble: string, format: 'md' | 'cho', key: string): string {
  if (!key) return preamble
  if (format === 'md') {
    if (/^key:\s*.*$/m.test(preamble)) return preamble.replace(/^key:\s*.*$/m, `key: ${key}`)
    if (preamble.startsWith('---\n')) return preamble.replace('---\n', `---\nkey: ${key}\n`)
    return preamble
  }
  if (/^\{key:\s*[^}]*\}/im.test(preamble)) return preamble.replace(/^\{key:\s*[^}]*\}/im, `{key: ${key}}`)
  return preamble.trim() ? `{key: ${key}}\n${preamble}` : `{key: ${key}}`
}

function withLabel(open: string, label: string): string {
  if (open.startsWith('##')) {
    const attrs = open.match(/\s\{[^}]*\}\s*$/)?.[0]?.trim() ?? ''
    return attrs ? `## ${label} {${attrs.slice(1, -1).trim()}}` : `## ${label}`
  }
  const cho = open.match(/^\{(start_of_[A-Za-z0-9_-]+)(?::[^}]*)?\}/i)
  if (cho?.[1]) return `{${cho[1]}: ${label}}`
  if (/:$/.test(open.trim()) && !open.includes('{') && !open.includes('[')) return `${label}:`
  return open
}

function sectionLabel(open: string): string {
  const markdown = open.match(/^##\s+(.+?)(?:\s+\{[^}]*\})?\s*$/)
  if (markdown?.[1]) return markdown[1].trim()
  const labeled = open.match(/^\{start_of_[A-Za-z0-9_-]+\s*:\s*([^}]*)\}/i)
  if (labeled) return labeled[1]?.trim() || 'Parte'
  const bare = open.match(/^\{start_of_([A-Za-z0-9_-]+)\}/i)
  if (bare?.[1]) return bare[1]
  if (open.endsWith(':')) return open.slice(0, -1).trim()
  return 'Parte'
}

function isSectionStart(line: string): boolean {
  if (/^##\s+/.test(line) && !/^##\s+versions\s*$/i.test(line)) return true
  if (/^\{start_of_[A-Za-z0-9_-]+/i.test(line)) return true
  if (line.length > 80 || line.includes('[') || line.includes('{')) return false
  return line.endsWith(':') && line.slice(0, -1).trim().length > 0
}

function isSectionEnd(line: string): boolean {
  return /^\{end_of_[A-Za-z0-9_-]+/i.test(line)
}

function isNoteLine(line: string): boolean {
  return (
    /^\{(?:comment|cue|how|repeat|arrange|free)\s*:/i.test(line) ||
    /^>\s*(?:cue|how|repeat|arrange|free)\s*:/i.test(line)
  )
}

function isRepeatMarker(line: string): boolean {
  return /^(?:x|×)\s*\d+$/i.test(line) || /^\d+\s*(?:x|×)$/i.test(line) || /^\((?:x|×)\s*\d+\)$/i.test(line)
}

function isChordLine(line: string): boolean {
  if (!line.includes('[')) return false
  const stripped = line.replace(/\{(?:comment|cue|how|repeat|arrange|free):[^}]*\}/gi, '').replace(/\[[^\]]*\]/g, '')
  return stripped.trim() === ''
}

function isLyricLine(line: string): boolean {
  if (!line || isSectionStart(line) || isSectionEnd(line) || isNoteLine(line) || isRepeatMarker(line)) return false
  if (isChordLine(line)) return false
  if (/^\{[A-Za-z0-9_-]+\s*:/.test(line)) return false
  return true
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
