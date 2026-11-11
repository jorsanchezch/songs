import { archiveDueDayList } from './dayListArchive.ts'
import { INSTRUMENTS } from './instruments.ts'
import { chartMeta } from './meta.ts'
import { OWNER_ID } from './schema.ts'
import type { Sql } from './sql.ts'

const META_KEY = 'wednesday_list_2026_11_11'
const SERVICE_DATE = '2026-11-11'
const LIST_ID = 'servicio-3'

const SONGS: { id: string; sourceText: string; semitones: number }[] = [
  { id: "charts/Nada Más (Nothing Else) - Cody Carnes", semitones: 0, sourceText: "{title: Nada Más (Nothing Else)}\n{artist: Cody Carnes}\n{composer: Cody Carnes, Hank Bentley, Jessie Early}\n{key: C}\n{source: https://www.cifraclub.com.br/majo-y-dan/nada-mas/}\n{source: https://www.youtube.com/watch?v=FFRNm012Uas | YouTube}\n\n{start_of_intro}\n[Dm7]   [F]   [C]   [Csus]   [C]\n[Dm7]   [F7M]   [C]   [Csus]   [C]\n{end_of_intro}\n\n{start_of_chorus}\n[Dm7]          [F]\nMe envuelve tu presencia\n[C]\nSólo quiero estar ante Tus pies\n[Dm7]          [F]\nMe envuelve este momento santo\n[C]\ny no me quiero ir\n[Dm7]       [F]\nNo busco bendiciones\n[C]\nCristo no me debes nada a mí\n[Dm7]             [F]\nMás que lo que Tú puedas hacer\n[C]\nTe quiero a Ti\n{end_of_chorus}\n\n{start_of_verse}\n[F]\nLo siento, por andar por sentimientos\n[C/E]\nLo siento, por cantar sin adorar\n[F]\nLlévame hasta el inicio\n[C]   [Csus]   [C]\nAbro mi corazón a Ti\n{end_of_verse}\n\n{start_of_verse}\n[F]\nLo siento, por buscar lo mío primero\n[C/E]\nLo siento, por olvidar que bastas Tú\n[F]\nLlévame hasta el inicio\n[C]   [Csus]   [C]\nAbro mi corazón a Ti\n{end_of_verse}\n\n{start_of_chorus}\n[Dm7]          [F]\nMe envuelve tu presencia\n[C]\nSólo quiero estar ante Tus pies\n[Dm7]          [F]\nMe envuelve este momento santo\n[C]\ny no me quiero ir\n[Dm7]       [F]\nNo busco bendiciones\n[C]\nCristo no me debes nada a mí\n[Dm7]             [F]\nMás que lo que Tú puedas hacer\n[C]\nTe quiero a Ti\n{end_of_chorus}\n\n{start_of_bridge}\n[Dm7]\nTe quiero a Ti\n[F]         [Am7]\nNada más, nada más\n[G]\nNada bastará\n[Dm7]\nTe quiero a Ti\n[Dm7]\nTe quiero a Ti\n[F]         [Am7]\nNada más, nada más\n[G]\nNada bastará\n[Dm7]\nTe quiero a Ti\n{end_of_bridge}\n" },
  { id: "charts/No hay lugar más alto - Miel San Marcos", semitones: 1, sourceText: "{title: No hay lugar más alto}\n{artist: Miel San Marcos}\n{composer: Josh Morales}\n{key: A}\n{source: https://www.cifraclub.com/miel-san-marcos/no-hay-lugar-mas-alto/}\n{source: https://www.youtube.com/watch?v=wb99ILqk2dc | YouTube}\n\n{start_of_intro}\n[A]   [D]\n{end_of_intro}\n\n{start_of_verse}\n      [A]             [E/G#]\nA tus pies arde mi corazón\n       [F#m]                [D]\nA tus pies entrego lo que soy\n      [A]             [E/G#]\nEse lugar de mi seguridad\n      [F#m]              [D]\nDonde nadie me puede señalar\n{end_of_verse}\n\n{start_of_prechorus}\n        [D]                              [E]\nMe perdonaste, me acercaste a tu presencia\n        [F#m7]                       [E/G#]\nMe levantaste, hoy me postro a adorarte\n{end_of_prechorus}\n\n{start_of_chorus}\n         [A/C#]     [D]           [E]\nNo hay lugar más alto, más grande\n                [F#m7]                  [A/C#]\nQue estar a tus pies, que estar a tus pies\n         [A/C#]     [D]           [E]\nNo hay lugar más alto, más grande\n                [F#m7]                  [A/C#]\nQue estar a tus pies, que estar a tus pies\n{end_of_chorus}\n\n{start_of_bridge}\n    [D]           [E]        [A]   [E/G#]   [F#m7]\nY aquí permaneceré, postrado a tus pies\n     [D]          [E]                 [F#m7]        [A]\nY aquí permaneceré a los pies de Cristo\n{end_of_bridge}\n" },
  { id: "charts/Vine a adorarte - Marcela Gandara", semitones: -4, sourceText: "{title: Vine a adorarte}\n{artist: Marcela Gandara}\n{composer: Tim Hughes}\n{key: D}\n{source: https://www.cifraclub.com/marcela-gandara/vine-adorarte/}\n{source: https://www.youtube.com/watch?v=xPhKDlThow4 | YouTube}\n\n{start_of_intro}\n[D]   [A]   [Em7]   [G]\n[D]   [A]   [G]\n{end_of_intro}\n\n{start_of_verse}\n[D]              [A]\nTú eres la luz\n       [Em7]           [G]\nQue brilló en las tinieblas\n[D]          [A]        [G]\nAbrió mis ojos pude ver\n[D]       [A]    [Em7]           [G]\nMi corazón adora tu hermosura\n    [D]           [A]         [G]\nEsperanza de vida eres tú\n{end_of_verse}\n\n{start_of_chorus}\n     [D]\nVine a adorarte\n           [A]\nVine a postrarme\n          [D/F#]               [G]\nVine a decir que eres mi Dios\n              [D]\nSólo tú eres grande\n              [A]\nSólo tú eres digno\n         [D/F#]         [G]\nEres asombroso para mí\n{end_of_chorus}\n\n{start_of_verse}\n[D]              [A]      [Em7]\nTú eres el rey grandemente exaltado\n    [D]          [A]       [G]\nGlorioso por siempre Señor\n    [D]          [A]      [Em7]\nAl mundo que creaste humilde viniste\n   [D]          [A]         [G]\nY pobre te hiciste por amor\n{end_of_verse}\n\n{start_of_chorus}\n     [D]\nVine a adorarte\n           [A]\nVine a postrarme\n          [D/F#]               [G]\nVine a decir que eres mi Dios\n              [D]\nSólo tú eres grande\n              [A]\nSólo tú eres digno\n         [D/F#]         [G]\nEres asombroso para mí\n{end_of_chorus}\n\n{start_of_bridge}\n[A]   [D/F#]   [G]\nNunca sabré cuánto costó\n[A]   [D/F#]   [G]\nVer mi maldad sobre esa cruz\n[A]   [D/F#]   [G]\nNunca sabré cuánto costó\n[A]   [D/F#]   [G]\nVer mi maldad sobre esa cruz\n{end_of_bridge}\n\n{start_of_chorus}\n     [D]\nVine a adorarte\n           [A]\nVine a postrarme\n          [D/F#]               [G]\nVine a decir que eres mi Dios\n              [D]\nSólo tú eres grande\n              [A]\nSólo tú eres digno\n         [D/F#]         [G]\nEres asombroso para mí\n{end_of_chorus}\n" },
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

export async function applyWednesdayList20261111(sql: Sql): Promise<void> {
  for (const song of SONGS) {
    await upsertCatalogSong(sql, song)
  }
  const done = await sql.get<{ value: string }>(`SELECT value FROM app_meta WHERE key = ?`, [META_KEY])
  if (done) return
  await archiveDueDayList(sql, { listId: LIST_ID, weekday: 3 })
  await sql.run(`DELETE FROM setlist_items WHERE setlist_id = ?`, [LIST_ID])
  for (let position = 0; position < SONGS.length; position += 1) {
    const item = SONGS[position]!
    await sql.run(
      `INSERT INTO setlist_items (setlist_id, position, song_id, semitones) VALUES (?, ?, ?, ?)`,
      [LIST_ID, position, item.id, item.semitones],
    )
  }
  await sql.run(`UPDATE setlists SET service_date = ? WHERE id = ?`, [SERVICE_DATE, LIST_ID])
  await sql.run(`INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')`, [META_KEY])
}
