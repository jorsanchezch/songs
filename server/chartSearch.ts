const SEARCH = 'https://www.bing.com/search'
const AGENT = 'Songbook/1.0 (chart search)'

const HOSTS: { host: string; score: number }[] = [
  { host: 'cifraclub.com', score: 100 },
  { host: 'cifraclub.com.br', score: 85 },
  { host: 'lacuerda.net', score: 90 },
  { host: 'e-chords.com', score: 70 },
  { host: 'bananacifras.com', score: 65 },
  { host: 'miscuerdas.com', score: 65 },
  { host: 'cifras.com.br', score: 60 },
  { host: 'ultimate-guitar.com', score: 55 },
]

export type ChartHit = {
  title: string
  url: string
  score: number
}

const FAILED = 'No pude buscar en la web. Pega un enlace.'

export async function findPublicChart(query: string): Promise<ChartHit | null> {
  const target = new URL(SEARCH)
  target.searchParams.set('q', query)
  target.searchParams.set('setlang', 'es')
  target.searchParams.set('cc', 'ES')
  let response: Response
  try {
    response = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: 'text/html',
        'accept-language': 'es',
        'user-agent': AGENT,
      },
    })
  } catch {
    throw new Error(FAILED)
  }
  const html = await response.text()
  if (!response.ok || searchBlocked(html)) throw new Error(FAILED)
  return pickChart(suggestionsFromBing(html))
}

export function suggestionsFromBing(html: string): ChartHit[] {
  const hits: ChartHit[] = []
  const pattern = /<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const href = decodeHtml(match[1] ?? '')
    const title = decodeHtml(match[2] ?? '')
    const url = decodeBingTarget(href)
    if (!title || !url) continue
    const score = scoreChartUrl(url)
    if (score <= 0) continue
    hits.push({ title, url, score })
  }
  return hits
}

export function pickChart(hits: ChartHit[]): ChartHit | null {
  let best: ChartHit | null = null
  const seen = new Set<string>()
  for (const hit of hits) {
    const key = hit.url.replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!best || hit.score > best.score) best = hit
  }
  return best
}

export function scoreChartUrl(raw: string): number {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 0
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 0
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  let score = 0
  for (const item of HOSTS) {
    if (host === item.host || host.endsWith(`.${item.host}`)) score = Math.max(score, item.score)
  }
  if (!score) return 0
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) score -= 45
  const path = url.pathname.toLowerCase()
  if (path.includes('letra') || path.includes('lyric')) score -= 25
  if (parts.some((part) => part === 'video' || part === 'videos')) score -= 40
  return score
}

function searchBlocked(html: string): boolean {
  const sample = html.slice(0, 2500).toLowerCase()
  if (sample.includes('<title>captcha</title>')) return true
  if (sample.includes('unusual traffic')) return true
  if (!html.includes('<h2') && html.length < 40000) return true
  return false
}

function decodeBingTarget(href: string): string {
  const clean = decodeHtml(href)
  let parsed: URL
  try {
    parsed = new URL(clean)
  } catch {
    return ''
  }
  const token = parsed.searchParams.get('u')
  if (!token) return httpUrl(clean)
  return httpUrl(decodeBingToken(token))
}

function decodeBingToken(token: string): string {
  const body = token.startsWith('a1') ? token.slice(2) : token
  try {
    const normalized = body.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    return atob(normalized + pad)
  } catch {
    return ''
  }
}

function httpUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, num: string) => String.fromCharCode(parseInt(num, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
