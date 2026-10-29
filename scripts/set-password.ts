/**
 * Sets someone's password straight in the database, for accounts the app will not change
 * (the owner) or a fresh database. The password never goes in the code or the command line.
 *
 *   npm run db:set-password -- jsanchezch          local sqlite, asks for the password
 *   npm run db:set-password -- jsanchezch --d1     production D1
 *   SONGBOOK_PASSWORD=… npm run db:set-password -- jsanchezch
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../server/password.ts'
import { OWNER_ID, OWNER_USERNAME } from '../server/schema.ts'
import { ensureSchema } from '../server/seed.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const username = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.trim() ?? ''
const d1 = process.argv.includes('--d1') || process.env.SONGBOOK_DB === 'd1'
if (!username) {
  console.error('Uso: npm run db:set-password -- <usuario> [--d1]')
  process.exit(1)
}

async function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Keep the typed password off the screen.
  const output = rl as unknown as { _writeToOutput: (text: string) => void; output: NodeJS.WriteStream }
  let asked = false
  output._writeToOutput = (text) => {
    if (!asked) output.output.write(text)
  }
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    asked = true
  })
}

const password = (process.env.SONGBOOK_PASSWORD ?? (await ask(`Contraseña para ${username}: `))).trim()
if (!password || password.length > 200) {
  console.error('La contraseña no puede estar vacía ni pasar de 200 caracteres.')
  process.exit(1)
}
const hash = await hashPassword(password)

if (d1) {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const run = (command: string) =>
    spawnSync('npx', ['wrangler', 'd1', 'execute', 'songbook', '--remote', '--json', '--command', command], {
      cwd: root,
      encoding: 'utf8',
    })
  // A database from before usernames still finds the owner by id.
  const columns = run(`PRAGMA table_info(users)`)
  const hasUsername = columns.status === 0 && columns.stdout.includes('"username"')
  const match = hasUsername
    ? `username = ${quote(username)} COLLATE NOCASE`
    : username.toLowerCase() === OWNER_USERNAME
      ? `id = ${quote(OWNER_ID)}`
      : null
  if (!match) {
    console.error('Esta base todavía no tiene usuarios; solo se puede poner la contraseña del dueño.')
    process.exit(1)
  }
  const update = run(`UPDATE users SET password_hash = ${quote(hash)} WHERE ${match}`)
  if (update.status !== 0) {
    console.error(update.stderr || update.stdout)
    process.exit(1)
  }
  const out = update.stdout
  const changes = (JSON.parse(out.slice(out.indexOf('['))) as { meta: { changes: number } }[])[0]?.meta.changes ?? 0
  console.log(changes ? `Contraseña guardada para ${username} en D1.` : `No hay nadie con el usuario ${username} en D1.`)
  process.exit(changes ? 0 : 1)
}

const sql = openSqlite(process.env.SONGBOOK_SQLITE?.trim() || path.join(root, 'data', 'songbook.sqlite'))
await ensureSchema(sql)
const { changes } = await sql.run(`UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE`, [hash, username])
console.log(changes ? `Contraseña guardada para ${username}.` : `No hay nadie con el usuario ${username}.`)
process.exit(changes ? 0 : 1)
