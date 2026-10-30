/**
 * Runs the audio analyzer over the MP3s in data/audio and compares with the stored BPM and length.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/analyze-audio.ts            every song
 *   npx tsx --tsconfig tsconfig.app.json scripts/analyze-audio.ts <text>     songs whose id contains <text>
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANALYSIS_RATE, analyzeAudio } from '../src/lib/audioAnalysis.ts'
import { blocksFor } from '../src/lib/display.ts'
import { parseChart } from '../src/lib/parseChart.ts'
import { partBars, partKeys } from '../src/lib/playback.ts'
import { suggestParts } from '../src/lib/partSuggest.ts'
import { openSqlite } from '../server/sqlite.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function decodeFile(file: string): Float32Array {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(ANALYSIS_RATE), '-'], {
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(String(result.stderr))
  const bytes = result.stdout
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 4)))
}

const filter = process.argv[2]
const sql = openSqlite(path.join(root, 'data', 'songbook.sqlite'))
const rows = await sql.all<{ id: string; bpm: number | null; duration_ms: number | null; audio_url: string }>(
  `SELECT id, bpm, duration_ms, audio_url FROM songs WHERE TRIM(COALESCE(audio_url,'')) <> '' ORDER BY id`,
)
for (const row of rows) {
  if (filter && !row.id.toLowerCase().includes(filter.toLowerCase())) continue
  const key = decodeURIComponent(row.audio_url.replace(/^\/api\/audio\//, ''))
  const started = Date.now()
  try {
    const a = await analyzeAudio(decodeFile(path.join(root, 'data', 'audio', key)))
    const mm = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`
    if (process.env.PARTS) {
      const part = await sql.all<{ source_text: string }>(`SELECT source_text FROM instrument_parts WHERE song_id = ? ORDER BY instrument LIMIT 1`, [row.id])
      const song = parseChart(part[0]!.source_text, `${row.id}.${part[0]!.source_text.trimStart().startsWith('---') ? 'song.md' : 'cho'}`)
      const blocks = blocksFor(song, null, 'full')
      const weights = partBars(blocks)
      const result = suggestParts(a, weights)
      const keys = partKeys(blocks)
      console.log('  partes', keys.map((key, i) => `${key}:${weights[i]}→${result?.bars[i] ?? '?'}`).join('  '), `calidad ${result?.quality}`)
      console.log('  inicia', result?.startsMs.map((ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`).join(' '))
    }
    console.log(
      `${row.id.slice(0, 38).padEnd(38)} stored ${String(row.bpm ?? '-').padStart(3)} → ${a.grid.bpm.toFixed(1).padStart(6)} ${a.grid.beatsPerBar}/4 conf ${a.confidence.toFixed(2)} drift ${String(a.driftMs).padStart(3)}ms  len ${mm(row.duration_ms ?? 0)} → ${mm(a.durationMs)} (sound ${mm(a.soundStartMs)}–${mm(a.soundEndMs)})  ${Date.now() - started}ms`,
    )
  } catch (error) {
    console.log(`${row.id}: ${(error as Error).message}`)
  }
}
process.exit(0)
