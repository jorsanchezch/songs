export type SqlValue = string | number | null

export type Sql = {
  exec(sql: string): Promise<void>
  all<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>
  get<T extends Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T | undefined>
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>
}
