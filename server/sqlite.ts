import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Sql, SqlValue } from './sql.ts'

export function openSqlite(filename: string): Sql {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = DELETE')
  db.exec('PRAGMA busy_timeout = 5000')

  const raw = direct(db)
  let chain: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(fn)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    all: (sql, params) => enqueue(() => raw.all(sql, params)),
    get: (sql, params) => enqueue(() => raw.get(sql, params)),
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    transaction: (fn) =>
      enqueue(async () => {
        db.exec('BEGIN')
        try {
          const result = await fn(raw)
          db.exec('COMMIT')
          return result
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }),
  }
}

function direct(db: DatabaseSync): Sql {
  const call: Sql = {
    async exec(sql) {
      db.exec(sql)
    },
    async all<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[]
    },
    async get<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).get(...params) as T | undefined
    },
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...params)
      return { changes: Number(result.changes ?? 0) }
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      db.exec('BEGIN')
      try {
        const result = await fn(call)
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
  return call
}
