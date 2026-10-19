import type { Sql, SqlValue } from './sql.ts'

export type D1Prepared = {
  bind(...values: unknown[]): D1Prepared
  all<T>(): Promise<{ results?: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}

export type D1Database = {
  prepare(sql: string): D1Prepared
  exec(sql: string): Promise<unknown>
}

export function openD1(database: D1Database): Sql {
  const raw = direct(database)
  return raw
}

function direct(database: D1Database): Sql {
  const statement = (sql: string, params: SqlValue[] = []) => {
    const prepared = database.prepare(sql)
    return params.length ? prepared.bind(...params) : prepared
  }
  const call: Sql = {
    async exec(sql) {
      // D1 exec() runs each physical line as its own statement, so a
      // multiline CREATE TABLE arrives as "incomplete input".
      const statements = sql
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
      for (const statement of statements) {
        await database.prepare(statement).run()
      }
    },
    async all<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]) {
      const result = await statement(sql, params ?? []).all<T>()
      return result.results ?? []
    },
    async get<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]) {
      const row = await statement(sql, params ?? []).first<T>()
      return row ?? undefined
    },
    async run(sql, params) {
      const result = (await statement(sql, params).run()) as { meta?: { changes?: number } }
      return { changes: Number(result?.meta?.changes ?? 0) }
    },
    async transaction(fn) {
      return fn(call)
    },
  }
  return call
}
