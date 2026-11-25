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
 * Before a list update deletes the current songs, copy them into
 * day_list_history. The service date does not have to be past: replacing
 * the lineup is what closes the previous one. A date already stored is
 * left as it was, so a later edit cannot wipe that snapshot.
 */
export async function archiveReplacedDayList(
  sql: Sql,
  opts: { listId: string; weekday: number; today?: string },
): Promise<boolean> {
  const list = await sql.get<{ service_date: string | null }>(
    `SELECT service_date FROM setlists WHERE id = ?`,
    [opts.listId],
  )
  const today = opts.today ?? churchToday()
  const serviceDate = list?.service_date || today

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
