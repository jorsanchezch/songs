import { INSTRUMENTS } from './instruments.ts'
import { chartMeta } from './meta.ts'
import { OWNER_ID } from './schema.ts'
import type { Sql } from './sql.ts'

const META_KEY = 'saturday_list_2026_11_07'
const SERVICE_DATE = '2026-11-07'
const LIST_ID = 'servicio-6'

const SONGS: { id: string; sourceText: string; semitones: number }[] = [
  { id: "charts/Aqu\u00ed como en el cielo - Elevation Worship", semitones: 4, sourceText: "{title: Aqu\u00ed como en el cielo}\n{artist: Elevation Worship}\n{composer: Chris Brown, Mack Brock, Wade Joye, Steven Furtick, Matthews Thabo Ntele}\n{key: D}\n{source: https://www.cifraclub.com/elevation-worship/como-en-el-cielo/}\n{source: https://www.youtube.com/watch?v=nUC1ddmkGrE | YouTube}\n\n{start_of_intro}\n[D]   [G/B]   [D]   [G/B]   [A]   [G/B]\n[D]   [G]   [D]   [G]\n{end_of_intro}\n\n{start_of_verse}\n[D]              [D7M]\nLa atm\u00f3sfera cambiando est\u00e1\n[G]               [D]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]           [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[D]              [D7M]\nLa atm\u00f3sfera cambiando est\u00e1\n[G]               [D]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]           [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n{end_of_verse}\n\n{start_of_chorus}\n[G]\nLlena este lugar\n[Bm7]\nDerramando Tu amor\n[F#m/A]\nTu amor me envuelve\n[G]\nHe venido por Ti\n[Bm7]\nA Tus brazos de amor\n[F#m/A]\nTu amor me envuelve\n{end_of_chorus}\n\n{start_of_verse}\n[G]   [D]   [D7M]\nLa atm\u00f3sfera cambiando est\u00e1\n[G]               [D]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]           [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]   [D]   [D7M]\nLa atm\u00f3sfera cambiando est\u00e1\n[G]               [D]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]           [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n{end_of_verse}\n\n{start_of_chorus}\n[G]\nLlena este lugar\n[Bm7]\nDerramando Tu amor\n[F#m/A]\nTu amor me envuelve\n[G]\nHe venido por Ti\n[Bm7]\nA Tus brazos de amor\n[F#m/A]\nTu amor me envuelve\n[G]\nLlena este lugar\n[Bm7]\nDerramando Tu amor\n[F#m/A]\nTu amor me envuelve\n[G]\nHe venido por Ti\n[Bm7]\nA Tus brazos de amor\n[F#m/A]\nTu amor me envuelve\n{end_of_chorus}\n\n{start_of_bridge}\n[G]          [A]      [Bm]\nQue tu poder descienda hoy\n[F#m]\nVenga Tu reino\n[G]               [A]         [Bm]\nQue se haga aqu\u00ed Tu voluntad\n[F#m]\nComo en el cielo\n[G]          [A]      [Bm]\nQue tu poder descienda hoy\n[F#m]\nVenga Tu reino\n[G]               [A]         [Bm]\nQue se haga aqu\u00ed Tu voluntad\n[F#m]\nComo en el cielo\n[G]          [A]      [Bm]\nQue tu poder descienda hoy\n[F#m]\nVenga Tu reino\n[G]               [A]         [Bm]\nQue se haga aqu\u00ed Tu voluntad\n[F#m]\nComo en el cielo\n{end_of_bridge}\n\n{start_of_solo}\n{comment: Solo (Cifra Club). Notas como acordes de una sola nota: suben y bajan con el tono.}\n[G]                         [Bm7]                      [A]\n[B]   [F#]   [A]   [F#]   [E]{how: bend a F#}        [B]   [F#]   [C#]   [F#]   [E]{how: bend a F#}\n[Bm7]                        [F#m/A]\n[B]   [F#]   [A]   [F#]   [E]{how: bend a F#}        [F#]   [C#]   [F#]   [C#]   [F#]   [C#]   [F#]   [C#]\n[G]                         [Bm7]                      [A]\n[B]   [F#]   [A]   [F#]   [E]{how: bend a F#}        [B]   [F#]   [C#]   [F#]   [E]{how: bend a F#}\n[Bm7]                        [F#m/A]\n[B]   [F#]   [A]   [F#]   [E]{how: bend a F#}        [F#]   [C#]   [F#]   [C#]   [F#]   [C#]   [F#]   [C#]\n[G]                              [Bm7]                           [A]\n[B]  [F#]  [B]  [F#]  [A]  [F#]  [E]{how: bend a F#}           [B]  [F#]  [B]  [F#]  [C#]  [F#]  [E]{how: bend a F#}\n[Bm7]                            [F#m/A]\n[B]  [F#]  [B]  [F#]  [A]  [F#]  [E]{how: bend a F#}           [F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [D]{how: desliza desde C#}\n[G]                    [Bm7]\n[D]  [F#]  [D]  [F#]  [F]  [C#]  [E]{how: bend a F#}   [D]  [F#]  [D]  [F#]\n[A]                    [Bm7]\n[C#]  [F#]  [E]{how: bend a F#}  [B]  [F#]  [B]  [F#]  [A]  [F#]  [E]{how: bend a F#}\n[F#m/A]\n[F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [F#]  [C#]  [D]\n{end_of_solo}\n\n{start_of_verse}\n[G]   [D]   [D7M]\nMilagros pueden suceder\n[G]               [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]           [D]   [D7M]   [A]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]   [D]   [D7M]\nMilagros pueden suceder\n[G]               [D]   [D7M]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n[G]                  [D]   [D7M]\nEs evidente tu mover\n[G7M]        [D]   [A]   [G]\nTu Esp\u00edritu est\u00e1 aqu\u00ed\n{end_of_verse}\n" },
  { id: "charts/Yeshua - Marcos Brunet", semitones: 9, sourceText: "{title: Yeshua}\n{artist: Marcos Brunet}\n{composer: Ton C. Alves}\n{key: D}\n{source: https://www.cifraclub.com/marcos-brunet/yeshua-part-misael-valera-e-lid-galmes/}\n{source: https://www.youtube.com/watch?v=esxdJ7-k9AA | YouTube}\n\n{start_of_verse}\n      [D]                 [E]\nMi orgullo me sac\u00f3 del jard\u00edn\n        [F#m]                   [E]\nSu humildad coloc\u00f3 el jard\u00edn en m\u00ed\n        [D]                        [E]\nY si vendiera todo lo que tengo\n                         [F#m]          [E]\nA cambio de su amor, yo fallar\u00eda\n{end_of_verse}\n\n{start_of_prechorus}\n           [D]\nPorque su amor no se compra\n [E]\nNi se merece\n   [F#m]\nSu amor es un regalo\n      [E]\nDe gracia se recibe\n{end_of_prechorus}\n\n{start_of_chorus}\n[D]                 [E]\nQuiero conocer a Jes\u00fas\n[F#m]               [E]\nQuiero conocer a Jes\u00fas\n[D]                 [E]\nQuiero conocer a Jes\u00fas\n[F#m]               [E]\nQuiero conocer a Jes\u00fas\n[D]\nY ser hallado en \u00c9l\n[E]\nY ser hallado en \u00c9l\n[F#m]\nY ser hallado en \u00c9l\n{end_of_chorus}\n\n{start_of_verse}\n      [D]                 [E]\nMi orgullo me sac\u00f3 del jard\u00edn\n        [F#m]                   [E]\nTu humildad coloc\u00f3 el jard\u00edn en m\u00ed\n        [D]                        [E]\nY si vendiera todo lo que tengo\n                         [F#m]          [E]\nA cambio de su amor, yo fallar\u00eda\n{end_of_verse}\n\n{start_of_prechorus}\n           [D]\nPorque su amor no se compra\n [E]\nNi se merece\n   [F#m]\nSu amor es un regalo\n      [E]\nDe gracia se recibe\n{end_of_prechorus}\n\n{start_of_chorus}\n[D]                 [E]\nQuiero conocer a Jes\u00fas\n[F#m]               [E]\nQuiero conocer a Jes\u00fas\n[D]                 [E]\nQuiero conocer a Jes\u00fas\n{end_of_chorus}\n\n{start_of_bridge}\n[D]   [E]   [F#m]   [B]\nYeshua ah\n[D]   [E]   [F#m]   [B]\nYeshua ah\n[D]   [E]   [F#m]   [B]\nYeshua ah\n[D]   [E]   [F#m]   [B]\nYeshua ah\n{end_of_bridge}\n\n{start_of_bridge}\n[D]            [Asus2]\nMi amado es el m\u00e1s bello\n[F#m7]              [E]\nEntre millares de millares\n[D]\nMi preferido, mi predilecto\n[E]           [F#m]   [E]\nMi preferido, mi predilecto\nJes\u00fas, Jes\u00fas\n{end_of_bridge}\n\n{start_of_tag}\n[D]                 [E]\nTuyo es el reino, tuyo es el poder\n[F#m]               [E]\nTuya es la gloria por siempre, am\u00e9n\n{end_of_tag}\n" },
]

const EXISTING: { id: string; semitones: number }[] = [
  { id: "charts/Padre Nuestro - Marcos Brunet", semitones: 4 },
]

async function upsertCatalogSong(sql: Sql, song: { id: string; sourceText: string }): Promise<void> {
  const meta = chartMeta(song.sourceText, song.id)
  const now = new Date().toISOString()
  const existing = await sql.get<{ id: string }>(`SELECT id FROM songs WHERE id = ?`, [song.id])
  if (!existing) {
    await sql.run(
      `INSERT INTO songs (
        id, title, artist, composer, key_name, source, lyrics_text, origin, catalog_id,
        owner_id, creator_id, shared, hidden, catalog_source, bpm, duration_ms, audio_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'catalog', NULL, ?, ?, 0, 0, ?, ?, ?, '', ?, ?)`,
      [
        song.id, meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics,
        OWNER_ID, OWNER_ID, song.sourceText, meta.bpm, meta.durationMs, now, now,
      ],
    )
  } else {
    await sql.run(
      `UPDATE songs SET title = ?, artist = ?, composer = ?, key_name = ?, source = ?, lyrics_text = ?,
        catalog_source = ?, bpm = ?, duration_ms = ?, updated_at = ?, revision = revision + 1
       WHERE id = ? AND origin = 'catalog'`,
      [
        meta.title, meta.artist, meta.composer, meta.key, meta.source, meta.lyrics,
        song.sourceText, meta.bpm, meta.durationMs, now, song.id,
      ],
    )
  }
  for (const instrument of INSTRUMENTS) {
    await sql.run(
      `INSERT INTO instrument_parts (song_id, instrument, source_text, revision) VALUES (?, ?, ?, 1)
       ON CONFLICT(song_id, instrument) DO UPDATE SET source_text = excluded.source_text, revision = instrument_parts.revision + 1`,
      [song.id, instrument, song.sourceText],
    )
  }
}

export async function applySaturdayList20261107(sql: Sql): Promise<void> {
  for (const song of SONGS) {
    await upsertCatalogSong(sql, song)
  }
  const done = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [META_KEY])
  if (done) return
  await sql.run(`DELETE FROM setlist_items WHERE setlist_id = ?`, [LIST_ID])
  const items = [
    { id: SONGS[0]!.id, semitones: SONGS[0]!.semitones },
    EXISTING[0]!,
    { id: SONGS[1]!.id, semitones: SONGS[1]!.semitones },
  ]
  for (let position = 0; position < items.length; position += 1) {
    const item = items[position]!
    await sql.run(
      `INSERT INTO setlist_items (setlist_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
      [LIST_ID, position, item.id, item.semitones],
    )
  }
  await sql.run(`UPDATE setlists SET service_date = ? WHERE id = ?`, [SERVICE_DATE, LIST_ID])
  await sql.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')`, [META_KEY])
}
