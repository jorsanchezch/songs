import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export type CatalogFile = {
  id: string
  sourceText: string
}

export async function readCatalogFiles(rootDir: string): Promise<CatalogFile[]> {
  const dir = path.join(rootDir, 'public', 'songs')
  const files = await walk(dir)
  files.sort((a, b) => a.localeCompare(b, 'es'))
  const songs: CatalogFile[] = []
  for (const rel of files) {
    if (rel === 'manifest.json' || rel.startsWith('_')) continue
    const text = await readFile(path.join(dir, rel), 'utf8')
    songs.push({ id: rel.replace(/\.(song\.md|chopro|cho)$/i, ''), sourceText: text })
  }
  return songs
}

async function walk(dir: string, base = ''): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), rel)))
    else if (/\.(cho|chopro|song\.md)$/i.test(entry.name) && !entry.name.startsWith('_')) files.push(rel)
  }
  return files
}
