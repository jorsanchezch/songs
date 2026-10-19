import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCatalogFiles } from '../server/catalog.ts'
import { renderSeedSql } from '../server/seed.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = await readCatalogFiles(root)
const sql = renderSeedSql(files)
const dir = path.join(root, 'data')
await mkdir(dir, { recursive: true })
const file = path.join(dir, 'seed.sql')
await writeFile(file, sql)
console.log(`Escribí ${files.length} canciones en ${file}`)
