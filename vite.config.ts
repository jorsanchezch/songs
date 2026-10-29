import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { songbookApi } from './server/vitePlugin.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: rootDir, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function formatStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  if (!year || !month || !day || !hour || !minute) return ''
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function versionStamp(): { label: string; commit: string } {
  const commit = process.env.GITHUB_SHA || git('rev-parse HEAD')
  const short = commit ? commit.slice(0, 7) : 'dev'
  // GitHub stores when the push arrived. That is a moment after it was launched.
  const pushed = process.env.GITHUB_PUSHED_AT ? formatStamp(process.env.GITHUB_PUSHED_AT) : ''
  const committed = formatStamp(git('log -1 --format=%cI'))
  const when = pushed || committed
  return { label: when ? `${short} · ${when}` : short, commit }
}

const appVersion = versionStamp()
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'songs'
const defaultBase = process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/'

function spaFallback(): Plugin {
  return {
    name: 'gh-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      const index = path.join(rootDir, 'dist', 'index.html')
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(rootDir, 'dist', '404.html'))
      }
    },
  }
}

function blockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '0.0.0.0' || host === '::1' || host === '::') return true
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const a = parts[0] ?? 0
  const b = parts[1] ?? 0
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function importChart(): Plugin {
  return {
    name: 'import-chart',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? ''
        if (!raw.includes('/api/import-chart')) {
          next()
          return
        }
        void (async () => {
          const target = new URL(raw, 'http://127.0.0.1').searchParams.get('url') ?? ''
          res.setHeader('content-type', 'application/json; charset=utf-8')
          try {
            const page = new URL(target)
            if ((page.protocol !== 'http:' && page.protocol !== 'https:') || blockedHost(page.hostname)) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Ese enlace no se puede leer.' }))
              return
            }
            const response = await fetch(page, {
              redirect: 'follow',
              signal: AbortSignal.timeout(15000),
              headers: {
                accept: 'text/html,application/xhtml+xml',
                'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
                'user-agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              },
            })
            const html = await response.text()
            const sample = html.slice(0, 2500)
            const blocked = /access denied/i.test(sample) && /permission|edgesuite|akamai/i.test(sample)
            if (!response.ok || blocked) {
              res.statusCode = 502
              res.end(
                JSON.stringify({
                  blocked: true,
                  error:
                    'Ese sitio bloqueó la lectura automática. Ábrelo, copia la cifra y pégala abajo.',
                }),
              )
              return
            }
            res.end(JSON.stringify({ html }))
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'No pude leer ese enlace.' }))
          }
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const dbMode = env.SONGBOOK_DB || process.env.SONGBOOK_DB || 'sqlite'
  const d1Url = env.SONGBOOK_D1_URL || process.env.SONGBOOK_D1_URL || ''
  const youtubeKey = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || ''
  return {
  base: env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || defaultBase,
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion.label),
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(appVersion.commit),
  },
  plugins: [react(), tailwindcss(), songbookApi({ mode: dbMode, d1Url, rootDir, youtubeKey }), importChart(), spaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
    watch: {
      ignored: ['**/data/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
  },
}
})
