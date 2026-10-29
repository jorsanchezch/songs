import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { handleApi } from './app.ts'
import { readCatalogFiles } from './catalog.ts'
import { seedCatalog } from './seed.ts'
import type { Sql } from './sql.ts'
import { openSqlite } from './sqlite.ts'

export function songbookApi(options: { mode: string; d1Url: string; rootDir: string; youtubeKey?: string }): Plugin {
  if (options.mode !== 'sqlite' && options.mode !== 'd1') {
    throw new Error(`SONGBOOK_DB debe ser sqlite o d1 (recibí ${options.mode}).`)
  }
  return {
    name: 'songbook-api',
    configureServer(server) {
      let opening: Promise<Sql> | null = null
      const database = () => {
        if (!opening) {
          opening = (async () => {
            const file = path.join(options.rootDir, 'data', 'songbook.sqlite')
            const sql = openSqlite(file)
            const files = await readCatalogFiles(options.rootDir)
            const added = await seedCatalog(sql, files)
            console.log(`Songbook sqlite listo (${files.length} archivos, ${added} filas nuevas)`)
            return sql
          })()
        }
        return opening
      }
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? ''
        if (!isApi(raw)) {
          next()
          return
        }
        void answer(req, res, options, database).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Error del servidor'
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: message }))
        })
      })
    },
  }
}

function isApi(url: string): boolean {
  const pathname = url.split('?')[0] ?? ''
  return (
    pathname === '/api/session' ||
    pathname === '/api/users' ||
    pathname === '/api/profile/password' ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/search-charts' ||
    pathname === '/api/songs' ||
    pathname.startsWith('/api/songs/') ||
    pathname === '/api/catalog' ||
    pathname === '/api/setlists' ||
    pathname === '/api/import-local' ||
    pathname === '/api/prefs'
  )
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  options: { mode: string; d1Url: string; youtubeKey?: string },
  database: () => Promise<Sql>,
) {
  if (options.mode === 'd1') {
    await proxy(req, res, options.d1Url)
    return
  }
  const sql = await database()
  const method = req.method ?? 'GET'
  const headers = new Headers()
  if (typeof req.headers.authorization === 'string') headers.set('authorization', req.headers.authorization)
  if (typeof req.headers['content-type'] === 'string') headers.set('content-type', req.headers['content-type'])
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRaw(req)
  const request = new Request(`http://127.0.0.1${req.url ?? '/'}`, { method, headers, body })
  const response = await handleApi(sql, request, {
    YOUTUBE_API_KEY: options.youtubeKey || process.env.YOUTUBE_API_KEY,
    AUDIO_BUCKET: process.env.SONGBOOK_AUDIO_BUCKET ? { configured: true } : undefined,
  })
  await writeResponse(res, response)
}

async function proxy(req: IncomingMessage, res: ServerResponse, remoteUrl: string) {
  if (!remoteUrl) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Falta SONGBOOK_D1_URL para SONGBOOK_DB=d1.' }))
    return
  }
  const method = req.method ?? 'GET'
  const headers = new Headers()
  if (typeof req.headers.authorization === 'string') headers.set('authorization', req.headers.authorization)
  if (typeof req.headers['content-type'] === 'string') headers.set('content-type', req.headers['content-type'])
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRaw(req)
  const target = new URL(req.url ?? '/', remoteUrl.endsWith('/') ? remoteUrl : `${remoteUrl}/`)
  const response = await fetch(target, { method, headers, body, redirect: 'manual' })
  await writeResponse(res, response)
}

async function writeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  const type = response.headers.get('content-type')
  if (type) res.setHeader('content-type', type)
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function readRaw(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}
