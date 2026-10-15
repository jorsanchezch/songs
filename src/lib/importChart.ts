const CHORD_TOKEN =
  /^[A-G](?:#|b)?(?:(?:maj|min|m|dim|aug|sus|add|M)?\d*(?:M)?(?:\([^)]*\))?)?(?:\/[A-G](?:#|b)?)?$/

export function isChordToken(token: string): boolean {
  if (!CHORD_TOKEN.test(token)) return false
  const quality = token.replace(/^[A-G](?:#|b)?/, '').replace(/\/.*$/, '')
  if (!quality) return true
  return /^(?:maj|min|m|dim|aug|sus|add|M)?\d*(?:M)?(?:\([^)]*\))?$/.test(quality)
}

export function chartToCho(raw: string, sourceUrl = ''): string {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (/\{title\s*:/i.test(text) && /\[[A-G]/.test(text)) return ensureSource(text, sourceUrl)
  if (/<[a-z!/]/i.test(text)) return htmlToCho(text, sourceUrl)
  return plainToCho(text, sourceUrl)
}

export async function fetchChartPage(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('El enlace tiene que empezar por http o https.')
  }
  const endpoint = `${import.meta.env.BASE_URL}api/import-chart?url=${encodeURIComponent(url)}`
  try {
    const local = await fetch(endpoint)
    if (local.headers.get('content-type')?.includes('json')) {
      const data = (await local.json()) as { html?: string; error?: string }
      if (data.html) return data.html
      if (local.status === 400 && data.error) throw new Error(data.error)
    }
  } catch (reason) {
    if (reason instanceof Error && reason.message === 'Ese enlace no se puede leer.') throw reason
  }
  try {
    const direct = await fetch(url)
    if (direct.ok) return direct.text()
  } catch {
    // The chart site does not allow the browser to read it directly.
  }
  const proxy = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
  if (proxy.ok) {
    const data = (await proxy.json()) as { contents?: string }
    if (data.contents) return data.contents
  }
  throw new Error('No pude leer ese enlace. Ábrelo, copia la cifra y pégala abajo.')
}

function htmlToCho(html: string, sourceUrl: string): string {
  const titleBlock = extractHeading(html)
  const key = extractKey(html)
  const composer = extractComposer(html)
  const body = extractBody(html)
  return renderCho(body, { ...titleBlock, key, composer, sourceUrl })
}

function plainToCho(text: string, sourceUrl: string): string {
  const lines = text.split('\n')
  const first = lines.findIndex((line) => line.trim())
  let title = 'Sin título'
  let rest = lines
  if (first >= 0) {
    const line = lines[first]?.trim() ?? ''
    if (line && line.length < 80 && !line.startsWith('[') && !isPlainChordLine(line) && !isTabLine(line)) {
      title = line
      rest = lines.slice(first + 1)
    }
  }
  return renderCho(rest.join('\n'), { title, artist: '', key: '', composer: '', sourceUrl })
}

function renderCho(
  fragment: string,
  meta: { title: string; artist: string; key: string; composer: string; sourceUrl: string },
): string {
  const lines = toLines(fragment)
  let body = ''
  let open: string | null = null
  let skippingTab = false

  const close = () => {
    if (!open) return
    body += `{end_of_${open}}\n\n`
    open = null
  }
  const openSection = (tag: string, label: string) => {
    close()
    body += `{start_of_${tag}${label ? `: ${label}` : ''}}\n`
    open = tag
    skippingTab = false
  }

  const writeLine = (raw: string) => {
    const plain = raw.includes('<') ? stripTags(raw) : raw
    const trimmed = plain.trim()
    if (!trimmed) return
    if (isPlainChordLine(trimmed)) {
      body += `${wrapPlainChordLine(plain)}\n`
      return
    }
    if (raw.includes('<')) {
      const rich = parseRichLine(raw)
      if (rich.chords.length) {
        body += `${chordLine(rich.chords)}\n`
        if (rich.lyric.trim()) body += `${rich.lyric.trimEnd()}\n`
        return
      }
    }
    body += `${plain.trimEnd()}\n`
  }

  for (const line of lines) {
    const plain = line.includes('<') ? stripTags(line) : line
    const trimmed = plain.trim()
    if (!trimmed) continue
    if (skippingTab) {
      const heading = headingAndRest(trimmed)
      if (heading && heading.tag !== 'comment') {
        openSection(heading.tag, heading.label)
        if (heading.rest) writeLine(heading.rest)
      }
      continue
    }
    if (isTabLine(trimmed)) {
      body += `{comment: Tablatura en la cifra original}\n`
      skippingTab = true
      continue
    }
    const heading = headingAndRest(trimmed)
    if (heading) {
      if (heading.tag === 'comment') {
        body += `{comment: ${heading.label}}\n`
        skippingTab = true
        continue
      }
      openSection(heading.tag, heading.label)
      if (heading.rest) writeLine(heading.rest)
      continue
    }
    writeLine(line)
  }
  close()

  const header = [
    `{title: ${meta.title || 'Sin título'}}`,
    `{artist: ${meta.artist}}`,
    meta.composer ? `{composer: ${meta.composer}}` : '',
    `{key: ${meta.key}}`,
    meta.sourceUrl ? `{source: ${meta.sourceUrl}}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return `${header}\n\n${body.trim()}\n`
}

function extractHeading(html: string): { title: string; artist: string } {
  const raw =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ??
    ''
  const decoded = decodeEntities(raw).replace(/\s+/g, ' ').trim()
  const cifra = decoded.match(/^(.*?)\s+-\s+(.*?)\s+-\s+Cifra Club/i)
  if (!cifra) return { title: decoded.replace(/\s*\(acordes\)\s*/i, '').trim() || 'Sin título', artist: '' }
  return {
    title: (cifra[1] ?? '').replace(/\s*\(acordes\)\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
    artist: (cifra[2] ?? '').trim(),
  }
}

function extractComposer(html: string): string {
  const block = html.match(/"composer"\s*:\s*(\[[\s\S]*?\])/)
  if (block?.[1]) {
    try {
      const people = JSON.parse(block[1]) as Array<{ name?: string }>
      const names = people.map((person) => person.name?.trim()).filter((name): name is string => Boolean(name))
      if (names.length) return names.join(' y ')
    } catch {
      // The composer field was not a list of names.
    }
  }
  return decodeEntities(html.match(/Composici[oó]n:\s*([^<\n]+)/i)?.[1] ?? '').trim()
}

function extractKey(html: string): string {
  const patterns = [
    /"tone"\s*:\s*"([A-G](?:#|b)?m?)"/i,
    /"key"\s*:\s*"([A-G](?:#|b)?m?)"/i,
    /data-tone="([A-G](?:#|b)?m?)"/i,
    /chord-tone"[^>]*>\s*([A-G](?:#|b)?m?)\s*</i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

function extractBody(html: string): string {
  const marked = html.match(/<pre[^>]*data-chord-content[^>]*>([\s\S]*?)<\/pre>/i)?.[1]
  if (marked && marked.length > 30) return marked
  const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((match) => match[1] ?? '')
  const pre = pres.sort((a, b) => b.length - a.length)[0]
  if (pre && pre.length > 30) return pre
  const embedded = longestJsonString(html)
  if (embedded && /<b[\s>]/i.test(embedded)) return embedded
  return html
}

function longestJsonString(html: string): string {
  let best = ''
  for (const match of html.matchAll(/"((?:\\.|[^"\\]){40,})"/g)) {
    const slice = match[1]
    if (!slice || !slice.includes('<')) continue
    try {
      const decoded = JSON.parse(`"${slice}"`) as string
      if (decoded.length > best.length && /<b[\s>]/i.test(decoded)) best = decoded
    } catch {
      // Not a JSON string.
    }
  }
  return best
}

type Rich = { chords: { col: number; name: string }[]; lyric: string; chordOnly: boolean }

function parseRichLine(line: string): Rich {
  const events: Array<{ type: 'text'; text: string } | { type: 'chord'; name: string }> = []
  let index = 0
  while (index < line.length) {
    if (line[index] !== '<') {
      const next = line.indexOf('<', index)
      const text = line.slice(index, next < 0 ? line.length : next)
      events.push({ type: 'text', text: decodeEntities(text).replace(/\u00a0/g, ' ') })
      index = next < 0 ? line.length : next
      continue
    }
    const end = line.indexOf('>', index)
    if (end < 0) break
    const tag = line.slice(index, end + 1)
    const open = /^<(b|strong)\b[^>]*>$/i.test(tag)
    if (open) {
      const rest = line.slice(end + 1)
      const close = rest.match(/^([\s\S]*?)<\/(b|strong)>/i)
      if (!close) {
        index = end + 1
        continue
      }
      const name = decodeEntities(close[1] ?? '').replace(/\u00a0/g, ' ').trim()
      if (isChordToken(name)) events.push({ type: 'chord', name })
      else if (name) events.push({ type: 'text', text: name })
      index = end + 1 + (close[0]?.length ?? 0)
      continue
    }
    index = end + 1
  }

  const textOnly = events
    .filter((event) => event.type === 'text')
    .map((event) => event.text)
    .join('')
  const chordOnly = events.some((event) => event.type === 'chord') && textOnly.trim() === ''
  const chords: { col: number; name: string }[] = []
  let lyric = ''
  let column = 0
  for (const event of events) {
    if (event.type === 'text') {
      lyric += event.text
      column += event.text.length
      continue
    }
    chords.push({ col: chordOnly ? column : lyric.length, name: event.name })
    if (chordOnly) column += event.name.length
  }
  return { chords, lyric: chordOnly ? '' : lyric, chordOnly }
}

function chordLine(chords: { col: number; name: string }[]): string {
  let out = ''
  for (const chord of chords) {
    const col = Math.max(chord.col, out.length)
    if (col > out.length) out += ' '.repeat(col - out.length)
    out += `[${chord.name}]`
  }
  return out
}

export function isPlainChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/)
  return tokens.length > 0 && tokens.every((token) => isChordToken(token))
}

export function wrapPlainChordLine(line: string): string {
  const tokens: { index: number; text: string }[] = []
  const pattern = /[A-G](?:#|b)?(?:(?:maj|min|m|dim|aug|sus|add|M)?\d*(?:M)?(?:\([^)]*\))?)?(?:\/[A-G](?:#|b)?)?/g
  for (const match of line.matchAll(pattern)) {
    if (match.index == null || !isChordToken(match[0])) continue
    tokens.push({ index: match.index, text: match[0] })
  }
  if (!tokens.length) return line.trimEnd()
  const first = tokens[0]
  if (!first) return line.trimEnd()
  let result = line.slice(0, first.index) + `[${first.text}]`
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1]
    const current = tokens[index]
    if (!previous || !current) continue
    let gap = line.slice(previous.index + previous.text.length, current.index)
    if (gap.length >= 2) gap = gap.slice(0, gap.length - 2)
    result += `${gap}[${current.text}]`
  }
  const last = tokens[tokens.length - 1]
  if (last) result += line.slice(last.index + last.text.length)
  return result.replace(/\s+$/, '')
}

function headingAndRest(line: string): { tag: string; label: string; rest: string } | null {
  const match = line.trim().match(/^\[([^\]\n]+)\]\s*(.*)$/)
  if (!match) return null
  const label = (match[1] ?? '').trim()
  if (!label || label.length > 80) return null
  return {
    tag: /^tab\b/i.test(label) ? 'comment' : sectionTag(label),
    label,
    rest: (match[2] ?? '').trim(),
  }
}

function sectionTag(label: string): string {
  if (/intro/i.test(label)) return 'intro'
  if (/pre/i.test(label)) return 'pre-chorus'
  if (/estrib|coro|chorus/i.test(label)) return 'chorus'
  if (/puente|bridge/i.test(label)) return 'bridge'
  if (/solo/i.test(label)) return 'solo'
  if (/final|outro/i.test(label)) return 'outro'
  if (/inter/i.test(label)) return 'interlude'
  return 'verse'
}

function isTabLine(line: string): boolean {
  return (
    /^[eEBGDA]\|/.test(line.trim()) ||
    /\|[-0-9hpb/\\]{3,}\|/.test(line) ||
    /^Parte\s+\d+\s+de\s+\d+$/i.test(line.trim())
  )
}

function toLines(fragment: string): string[] {
  return fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .split('\n')
}

function ensureSource(text: string, sourceUrl: string): string {
  if (!sourceUrl || /\{source\s*:/i.test(text)) return text.endsWith('\n') ? text : `${text}\n`
  return text.replace(/(\{key:[^}\n]*\})/i, `$1\n{source: ${sourceUrl}}`)
}

function stripTags(line: string): string {
  return decodeEntities(line.replace(/<[^>]+>/g, '')).replace(/\u00a0/g, ' ')
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, num: string) => String.fromCharCode(parseInt(num, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
