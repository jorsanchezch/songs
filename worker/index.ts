import { handleApi } from '../server/app.ts'
import { openD1, type D1Database } from '../server/d1.ts'
import { ensureSchema } from '../server/seed.ts'

type Env = {
  DB: D1Database
  SONGBOOK_ORIGIN?: string
  YOUTUBE_API_KEY?: string
  /** Optional R2 bucket for future MP3 hosting. When absent, backfill skips extract. */
  AUDIO_BUCKET?: unknown
}

let ready: Promise<void> | null = null

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.SONGBOOK_ORIGIN?.trim() || '*'
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin)
    const url = new URL(request.url)
    if (!ready) ready = ensureSchema(openD1(env.DB))
    await ready
    if (url.pathname === '/' || url.pathname === '') {
      return cors(text('Songbook API. Las rutas van en /api/.'), origin)
    }
    const response = await handleApi(openD1(env.DB), request, {
      YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
      AUDIO_BUCKET: env.AUDIO_BUCKET,
    })
    return cors(response, origin)
  },
}

function text(message: string): Response {
  return new Response(message, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

function cors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-headers', 'authorization, content-type')
  headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('access-control-max-age', '86400')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
