import { readdir, cp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicSongs = path.join(root, 'public', 'songs')
const chartsDir = path.join(publicSongs, 'charts')
const authoredDir = path.join(publicSongs, 'authored')
const contentDir = path.join(root, 'content')
const parent = path.resolve(root, '..')

async function syncCharts() {
  let names = []
  try {
    names = (await readdir(parent)).filter((name) => /\.(cho|chopro)$/i.test(name))
  } catch {
    return
  }
  if (!names.length) return
  await rm(chartsDir, { recursive: true, force: true })
  await mkdir(chartsDir, { recursive: true })
  for (const name of names) {
    await cp(path.join(parent, name), path.join(chartsDir, name))
  }
}

async function syncAuthored() {
  await rm(authoredDir, { recursive: true, force: true })
  await mkdir(authoredDir, { recursive: true })
  let names = []
  try {
    await stat(contentDir)
    names = await readdir(contentDir)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.song.md') || name.startsWith('_')) continue
    await cp(path.join(contentDir, name), path.join(authoredDir, name))
  }
}

async function walk(dir, base = '') {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await walk(path.join(dir, entry.name), rel)))
    } else if (/\.(cho|chopro|song\.md)$/i.test(entry.name)) {
      files.push(rel.replace(/\\/g, '/'))
    }
  }
  return files
}

async function main() {
  await mkdir(publicSongs, { recursive: true })
  await syncCharts()
  await syncAuthored()
  const files = await walk(publicSongs)
  files.sort((a, b) => a.localeCompare(b, 'es'))
  const manifest = {
    generatedAt: new Date().toISOString(),
    count: files.length,
    files,
  }
  await writeFile(
    path.join(publicSongs, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  console.log(`Song manifest: ${files.length} songs`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
