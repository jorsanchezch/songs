/** YouTube lookup for media backfill: Data API when keyed, else public search fallback. */

export type YoutubeHit = {
  videoId: string
  url: string
  title: string
  durationMs: number | null
  bpm: number | null
  via: 'youtube_api' | 'public_search' | 'chart'
}

export type YoutubeLookupEnv = {
  YOUTUBE_API_KEY?: string
}

const AGENTS = [
  'Mozilla/5.0 (compatible; SongbookMedia/1.0; +https://github.com/jorsanchezch/songs)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
]
const SEARCH = 'https://www.bing.com/search'

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youtubeVideoIdFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.replace(/^(www|m|music)\./, '').toLowerCase()
    const valid = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null)
    if (host === 'youtu.be') return valid(parsed.pathname.split('/')[1])
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
    const fromQuery = valid(parsed.searchParams.get('v'))
    if (fromQuery) return fromQuery
    const [, kind, id] = parsed.pathname.split('/')
    return kind && ['embed', 'shorts', 'live', 'v'].includes(kind) ? valid(id) : null
  } catch {
    const match = trimmed.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/)
    return match?.[1] ?? null
  }
}

export function parseIsoDurationMs(iso: string): number | null {
  const match = iso.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000
  return total > 0 ? total : null
}

export function bpmFromText(...chunks: Array<string | null | undefined>): number | null {
  for (const chunk of chunks) {
    if (!chunk) continue
    const match = chunk.match(/\b(\d{2,3})\s*(?:bpm|beats?\s*per\s*minute)\b/i)
    if (!match?.[1]) continue
    const value = Number(match[1])
    if (value >= 40 && value <= 240) return value
  }
  return null
}

export function searchLanguage(title: string, artist: string): { relevanceLanguage: string; regionCode: string } {
  const text = `${title} ${artist}`.toLowerCase()
  if (
    /[áéíóúñü¿¡]/.test(text) ||
    /\b(señor|dios|espiritu|espíritu|verdad|corazón|alabanza|adoraci[oó]n|marcos brunet|barak|su presencia|en espiritu|en espíritu|jesús|jesus adrian|marco barrientos|danilo montero)\b/.test(
      text,
    )
  ) {
    return { relevanceLanguage: 'es', regionCode: 'MX' }
  }
  return { relevanceLanguage: 'en', regionCode: 'US' }
}

let lastPublicSearchAt = 0
let publicSearchCount = 0

/** Enrich an existing video id with duration + BPM from description (Data API). */
export async function enrichYoutubeVideo(
  videoId: string,
  env: YoutubeLookupEnv,
): Promise<YoutubeHit | null> {
  const id = videoId.trim()
  if (!/^[\w-]{11}$/.test(id)) return null
  const key = env.YOUTUBE_API_KEY?.trim()
  if (!key) {
    return {
      videoId: id,
      url: youtubeWatchUrl(id),
      title: '',
      durationMs: null,
      bpm: null,
      via: 'chart',
    }
  }
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  videosUrl.searchParams.set('part', 'contentDetails,snippet')
  videosUrl.searchParams.set('id', id)
  videosUrl.searchParams.set('key', key)
  const videosResponse = await fetch(videosUrl, { signal: AbortSignal.timeout(12000) })
  if (!videosResponse.ok) return null
  const videosJson = (await videosResponse.json()) as {
    items?: Array<{
      id?: string
      contentDetails?: { duration?: string }
      snippet?: { title?: string; description?: string }
    }>
  }
  const item = videosJson.items?.[0]
  if (!item) return null
  return {
    videoId: id,
    url: youtubeWatchUrl(id),
    title: item.snippet?.title?.trim() ?? '',
    durationMs: parseIsoDurationMs(item.contentDetails?.duration ?? ''),
    bpm: bpmFromText(item.snippet?.description, item.snippet?.title),
    via: 'youtube_api',
  }
}

export async function findYoutubeMedia(
  title: string,
  artist: string,
  env: YoutubeLookupEnv,
): Promise<YoutubeHit | null> {
  const key = env.YOUTUBE_API_KEY?.trim()
  if (key) {
    const apiHit = await searchYoutubeApi(title, artist, key)
    if (apiHit) return apiHit
  }
  // YouTube HTML search throttles anonymous scrapers after a handful of hits.
  const wait = 1600 - (Date.now() - lastPublicSearchAt)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastPublicSearchAt = Date.now()
  const hit = await searchYoutubePublic(title, artist)
  if (hit) return hit
  await new Promise((resolve) => setTimeout(resolve, 1200))
  lastPublicSearchAt = Date.now()
  return searchYoutubePublic(title, artist)
}

async function searchYoutubeApi(title: string, artist: string, key: string): Promise<YoutubeHit | null> {
  const { relevanceLanguage, regionCode } = searchLanguage(title, artist)
  const query = [title, artist].map((part) => part.trim()).filter(Boolean).join(' ')
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', '5')
  searchUrl.searchParams.set('q', query)
  searchUrl.searchParams.set('relevanceLanguage', relevanceLanguage)
  searchUrl.searchParams.set('regionCode', regionCode)
  searchUrl.searchParams.set('key', key)
  const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(12000) })
  if (!searchResponse.ok) {
    const detail = await searchResponse.text().catch(() => '')
    throw new Error(`YouTube search.list falló (${searchResponse.status}). ${detail.slice(0, 180)}`)
  }
  const searchJson = (await searchResponse.json()) as {
    items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string } }>
  }
  const candidates = (searchJson.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId?.trim() ?? '',
      title: item.snippet?.title?.trim() ?? '',
      description: item.snippet?.description ?? '',
    }))
    .filter((item) => item.videoId)
  if (!candidates.length) return null

  const ids = candidates.map((item) => item.videoId).join(',')
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  videosUrl.searchParams.set('part', 'contentDetails,snippet')
  videosUrl.searchParams.set('id', ids)
  videosUrl.searchParams.set('key', key)
  const videosResponse = await fetch(videosUrl, { signal: AbortSignal.timeout(12000) })
  if (!videosResponse.ok) {
    const first = candidates[0]!
    return {
      videoId: first.videoId,
      url: youtubeWatchUrl(first.videoId),
      title: first.title,
      durationMs: null,
      bpm: bpmFromText(first.description, first.title),
      via: 'youtube_api',
    }
  }
  const videosJson = (await videosResponse.json()) as {
    items?: Array<{
      id?: string
      contentDetails?: { duration?: string }
      snippet?: { title?: string; description?: string }
    }>
  }
  const details = new Map(
    (videosJson.items ?? []).map((item) => [
      item.id ?? '',
      {
        durationMs: parseIsoDurationMs(item.contentDetails?.duration ?? ''),
        title: item.snippet?.title?.trim() ?? '',
        description: item.snippet?.description ?? '',
      },
    ]),
  )
  const pick = candidates.find((item) => details.has(item.videoId)) ?? candidates[0]!
  const meta = details.get(pick.videoId)
  return {
    videoId: pick.videoId,
    url: youtubeWatchUrl(pick.videoId),
    title: meta?.title || pick.title,
    durationMs: meta?.durationMs ?? null,
    bpm: bpmFromText(meta?.description, meta?.title, pick.description, pick.title),
    via: 'youtube_api',
  }
}

async function searchYoutubePublic(title: string, artist: string): Promise<YoutubeHit | null> {
  const { relevanceLanguage, regionCode } = searchLanguage(title, artist)
  const query = [title, artist].map((part) => part.trim()).filter(Boolean).join(' ')
  const fromYoutube = await scrapeYoutubeSearch(query, relevanceLanguage)
  if (fromYoutube) return fromYoutube
  const target = new URL(SEARCH)
  target.searchParams.set('q', `site:youtube.com ${query}`)
  target.searchParams.set('setlang', relevanceLanguage)
  target.searchParams.set('cc', regionCode)
  let response: Response
  try {
    response = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: 'text/html',
        'accept-language': relevanceLanguage === 'es' ? 'es' : 'en',
        'user-agent': AGENTS[0]!,
      },
    })
  } catch {
    return null
  }
  const html = await response.text()
  if (!response.ok) return null
  const videoId = firstYoutubeId(html)
  if (!videoId) return null
  return {
    videoId,
    url: youtubeWatchUrl(videoId),
    title: `${title} ${artist}`.trim(),
    durationMs: null,
    bpm: null,
    via: 'public_search',
  }
}

async function scrapeYoutubeSearch(query: string, lang: string): Promise<YoutubeHit | null> {
  const target = new URL('https://www.youtube.com/results')
  target.searchParams.set('search_query', query)
  target.searchParams.set('hl', lang)
  const agent = AGENTS[publicSearchCount % AGENTS.length]!
  publicSearchCount += 1
  let response: Response
  try {
    response = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': lang === 'es' ? 'es,en;q=0.8' : 'en,es;q=0.8',
        'user-agent': agent,
      },
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  const html = await response.text()
  const videoId = firstYoutubeIdFromYtInitial(html) ?? firstYoutubeId(html)
  if (!videoId) return null
  return {
    videoId,
    url: youtubeWatchUrl(videoId),
    title: query,
    durationMs: null,
    bpm: null,
    via: 'public_search',
  }
}

function firstYoutubeIdFromYtInitial(html: string): string | null {
  const match = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/)
  return match?.[1] ?? null
}

function firstYoutubeId(html: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}
