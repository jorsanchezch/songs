import { archiveReplacedDayList } from './dayListArchive.ts'
import { INSTRUMENTS } from './instruments.ts'
import { chartMeta } from './meta.ts'
import { OWNER_ID } from './schema.ts'
import { serviceListTitle } from './serviceListTitle.ts'
import type { Sql } from './sql.ts'

const META_KEY = 'wednesday_list_2026_11_25'
const SERVICE_DATE = '2026-11-25'
const LIST_ID = 'servicio-3'

// Tono de la cifra, sin transporte de servicio: Cordero y León en A,
// Este es mi deseo en G, Rindo mis coronas en F.
const SONGS: { id: string; sourceText: string; semitones: number }[] = [
  { id: "charts/Cordero y León - TWICE", semitones: 0, sourceText: "{title: Cordero y León}\n{artist: TWICE}\n{composer: TWICE, Evan Craft}\n{key: A}\n{source: https://www.cifraclub.com/ici-central/cordero-y-leon/}\n{bpm: 90}\n{duration_ms: 261000}\n\n{start_of_intro}\n[A]   [D]   [A]   [D]\n{end_of_intro}\n\n{start_of_verse}\n[A]                              [D]\nViene con poder todo reino lo verá\n[F#m]                            [D]\nCadenas romperá, todos le adorarán\n[E]                              [A]\nQuién como el Señor, Dios fuerte\n{end_of_verse}\n\n{start_of_chorus}\n[A]                 [F#m]\nÉl es el León, León de Judá\n[D]\nÉl tiene poder, para liberar\n[E]\nTodos se postrarán ante ti\n[A]                 [F#m]\nÉl es el Cordero, Cordero inmolado\n[D]\nSu sangre en la cruz, borró mi pecado\n[E]              [D]\nTodos se postrarán ante el Cordero y el León\n[E]\nTodos se postrarán ante ti\n{end_of_chorus}\n\n{start_of_interlude}\n[A]   [D]   [A]   [D]\n{end_of_interlude}\n\n{start_of_verse}\n[A]                              [D]\nAbrid las puertas hoy, al Rey de Reyes y Señor\n[F#m]                            [D]\nEl Dios de salvación, vino a darnos libertad\n[E]\nQuién como el Señor Dios fuerte\n{end_of_verse}\n\n{start_of_chorus}\n[A]                 [F#m]\nÉl es el León, León de Judá\n[D]\nÉl tiene poder, para liberar\n[E]\nTodos se postrarán ante ti\n[A]                 [F#m]\nÉl es el Cordero, Cordero inmolado\n[D]\nSu sangre en la cruz, borró mi pecado\n[E]              [D]\nTodos se postrarán ante el Cordero y el León\n[E]\nTodos se postrarán ante ti\n{end_of_chorus}\n\n{start_of_bridge}\n[Bm]             [F#m]\nQuién como el Señor Dios fuerte\n[D]              [E]\nQuién como el Señor Dios fuerte\n[Bm]             [F#m]\nQuién como el Señor Dios fuerte\n[D]              [E]\nQuién como el Señor Dios fuerte\n[Bm]             [F#m]\nQuién como el Señor Dios fuerte\n[D]              [E]\nQuién como el Señor\n{end_of_bridge}\n\n{start_of_chorus}\n[A]                 [F#m]\nÉl es el León, León de Judá\n[D]\nÉl tiene poder, para liberar\n[E]\nTodos se postrarán ante ti\n[A]                 [F#m]\nÉl es el Cordero, Cordero inmolado\n[D]\nSu sangre en la cruz, borró mi pecado\n[E]              [D]\nTodos se postrarán ante el Cordero y el León\n[E]\nTodos se postrarán ante ti\n{end_of_chorus}" },
  { id: "charts/Este es mi deseo - Claudio Freidzon", semitones: 0, sourceText: "{title: Este es mi deseo}\n{artist: Claudio Freidzon}\n{composer: Reuben Morgan}\n{key: G}\n{source: https://www.cifraclub.com/claudio-freidzon/este-es-mi-deseo/}\n\n{start_of_intro}\n[C]   [D]   [Bm]   [Em]\n{end_of_intro}\n\n{start_of_verse}\n[G]                [Em]\nEste es mi deseo\n[Am]       [G]     [D]\nHonrarte a Ti\n[Em]               [G]\nCon todo mi ser\n[F]        [C]     [D]\nTe adoro a Ti\n[G]                [Em]\nCon todas mis fuerzas\n[Am]       [G]     [D]\nTe alabaré\n[Em]       [G]     [F]     [C]     [D]\nMi adoración eres Tú\n{end_of_verse}\n\n{start_of_chorus}\n[G]                [D/F#]\nHoy te rindo mi ser\n[Am]\nTe doy mi corazón\n[C]        [D]     [G]\nYo vivo para Ti\n[D/F#]\nEn cada palpitar\n[Am]\nMientras haya aliento en mí\n[C]        [D]     [G]\nDios haz tu obra en mí\n{end_of_chorus}" },
  { id: "charts/Rindo mis coronas - Gateway Worship Español", semitones: 0, sourceText: "{title: Rindo mis coronas}\n{artist: Gateway Worship Español}\n{composer: Mark Harris, Christine D'Clario, Josh Baldwin, Zac Rowe}\n{key: F}\n{source: https://www.cifraclub.com/gateway-worship-espanol/rindo-mis-coronas/}\n{source: https://worshipchords.com/crowns-down-gateway-chords/ | Crowns Down (Bb)}\n{bpm: 72}\n{duration_ms: 477000}\n\n{comment: Tono F del máster en español (Celebraré). Acordes de Crowns Down en Bb, siete semitonos abajo.}\n\n{start_of_intro}\n[F]   [F]   [Bb]   [Bb]\n{end_of_intro}\n\n{start_of_verse}\n[F]\nGobierna en gloria Rey Salvador\n[Bb]\nMe has recibido con Tu amor\n[F]\nCon Tu realeza gracia y perdón\n[Bb]\nHas rodeado mi corazón\n{end_of_verse}\n\n{start_of_chorus}\n[F]                               [Bb]\nRindo mis coronas a Tus pies\n[Gm]\nEres santo santo\n[F]      [F/A]                    [Bb]\nComo ofrenda a Ti me entregaré\n[Gm]\nEres digno tan digno\n{end_of_chorus}\n\n{start_of_verse}\n[F]\nEn Tu santuario te buscaré\n[Bb]\nAún en quebranto me ofreceré\n[F]\nHoy sin reservas ante mi Rey\n[Bb]\nLo rindo todo ante Tus pies\n[Bb]\nLo rindo todo ante Tus pies\n{end_of_verse}\n\n{start_of_chorus}\n[F]                               [Bb]\nRindo mis coronas a Tus pies\n[Gm]\nEres santo santo\n[F]      [F/A]                    [Bb]\nComo ofrenda a Ti me entregaré\n[Gm]\nEres digno tan digno\n{end_of_chorus}\n\n{start_of_bridge}\n[Bb]\nSanto santo santo\n[C]\nAl Cordero que venció\n[F/A]\nCantamos con el cielo\n[Dm]          [C]\nLa canción de redención\n{end_of_bridge}\n\n{start_of_chorus}\n[F]                               [Bb]\nRindo mis coronas a Tus pies\n[Gm]\nEres santo santo\n[F]      [F/A]                    [Bb]\nComo ofrenda a Ti me entregaré\n[Gm]\nEres digno tan digno\n{end_of_chorus}\n\n{start_of_bridge}\n[Bb]\nSanto santo santo\n[C]\nAl Cordero que venció\n[F/A]\nCantamos con el cielo\n[Dm]          [C]\nLa canción de redención\n{end_of_bridge}\n\n{start_of_tag}\n[Bb]\nSanto santo santo\n[C]\nSanto santo santo\n[F/A]\nSanto santo santo\n[Dm]          [C]    [Bb]\nAl Cordero que venció\n{end_of_tag}\n\n{start_of_chorus}\n[F]                               [Bb]\nRindo mis coronas a Tus pies\n[Gm]\nEres santo santo\n[F]      [F/A]                    [Bb]\nComo ofrenda a Ti me entregaré\n[Gm]\nEres digno tan digno\n{end_of_chorus}" },
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

export async function applyWednesdayList20261125(sql: Sql): Promise<void> {
  for (const song of SONGS) {
    await upsertCatalogSong(sql, song)
  }
  const done = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [META_KEY])
  if (done) return
  await archiveReplacedDayList(sql, { listId: LIST_ID, weekday: 3 })
  await sql.run(`DELETE FROM setlist_items WHERE setlist_id = ?`, [LIST_ID])
  for (let position = 0; position < SONGS.length; position += 1) {
    const item = SONGS[position]!
    await sql.run(
      `INSERT INTO setlist_items (setlist_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
      [LIST_ID, position, item.id, item.semitones],
    )
  }
  await sql.run(`UPDATE setlists SET service_date = ?, name = ? WHERE id = ?`, [
    SERVICE_DATE,
    serviceListTitle(3, SERVICE_DATE),
    LIST_ID,
  ])
  await sql.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')`, [META_KEY])
}
