import type { Sql } from './sql.ts'

/** Church calendar day in America/Santo_Domingo (YYYY-MM-DD). */
export function churchToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Same rule as the app: a dated list closes once its service day has passed. */
export function dayListIsDue(serviceDate: string, today: string): boolean {
  return Boolean(serviceDate) && today > serviceDate
}

/**
 * Before a seed/agent replace wipes an evergreen list, copy its songs into
 * day_list_history when that service date is already past.
 */
export async function archiveDueDayList(
  sql: Sql,
  opts: { listId: string; weekday: number; today?: string },
): Promise<boolean> {
  const list = await sql.get<{ service_date: string | null }>(
    `SELECT service_date FROM setlists WHERE id = ?`,
    [opts.listId],
  )
  const serviceDate = list?.service_date
  if (!serviceDate) return false
  const today = opts.today ?? churchToday()
  if (!dayListIsDue(serviceDate, today)) return false

  const items = await sql.all<{ song_id: string; semitones: number }>(
    `SELECT song_id, semitones FROM setlist_items WHERE setlist_id = ? ORDER BY position`,
    [opts.listId],
  )
  if (!items.length) return false

  const historyId = `historial-${opts.weekday}-${serviceDate}`
  const existing = await sql.get<{ id: string }>(`SELECT id FROM day_list_history WHERE id = ?`, [historyId])
  if (existing) return false

  const max = await sql.get<{ n: number }>(`SELECT COALESCE(MAX(position), -1) AS n FROM day_list_history`)
  const position = Number(max?.n ?? -1) + 1
  await sql.run(`INSERT INTO day_list_history (id, weekday, service_date, position) VALUES (?, ?, ?, ?)`, [
    historyId,
    opts.weekday,
    serviceDate,
    position,
  ])
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!
    await sql.run(
      `INSERT INTO day_list_history_items (history_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
      [historyId, index, item.song_id, item.semitones],
    )
  }
  return true
}
