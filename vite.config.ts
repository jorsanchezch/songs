import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
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

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? defaultBase,
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
  },
})
