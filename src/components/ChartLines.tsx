import { formatChord } from '@/lib/chords'
import { displayLyric, type DisplayBlock } from '@/lib/display'
import type { ViewSettings } from '@/lib/settings'
import { NOTE_LABEL, type NoteType, type SongNote } from '@/lib/types'

export function NoteRow({
  notes,
  visible,
  openNote,
  prefix,
  onToggle,
}: {
  notes: SongNote[]
  visible: NoteType[]
  openNote: string | null
  prefix: string
  onToggle: (id: string | null) => void
}) {
  const shown = notes.filter((note) => visible.includes(note.type))
  if (!shown.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5 font-sans">
      {shown.map((note) => {
        const key = `${prefix}:${note.id}`
        const open = openNote === key
        const short = note.text.length <= 48
        if (short) {
          return (
            <span
              key={key}
              className="rounded-md bg-accent px-2 py-0.5 text-[0.55em] leading-snug text-accent-foreground"
            >
              <span className="font-semibold">{NOTE_LABEL[note.type]}.</span> {note.text}
            </span>
          )
        }
        return (
          <span key={key}>
            <button
              type="button"
              className="rounded-md bg-accent px-2 py-0.5 text-[0.55em] font-semibold"
              aria-expanded={open}
              onClick={() => onToggle(open ? null : key)}
            >
              {NOTE_LABEL[note.type]}
            </button>
            {open && (
              <span className="mt-1 block rounded-md bg-card px-2 py-1 text-[0.6em] shadow-sm">
                {note.text}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export function ChartRow({
  block,
  lineIndex,
  showChords,
  spelling,
  semitones,
  songKey,
  visible,
  openNote,
  onToggle,
}: {
  block: DisplayBlock
  lineIndex: number
  showChords: boolean
  spelling: ViewSettings['spelling']
  semitones: number
  songKey: string
  visible: NoteType[]
  openNote: string | null
  onToggle: (id: string | null) => void
}) {
  const line = block.section.lines[lineIndex]
  if (!line) return null
  const lyric = line.lyric == null ? null : displayLyric(line.lyric)
  const placed = placeChords(
    line.chords.map((chord) => ({
      ...chord,
      name: formatChord(chord.raw, songKey, semitones, spelling),
    })),
  )
  const width = Math.max(lyric?.length ?? 0, placed.cursor, 1)

  return (
    <div className="mb-[0.55em]">
      <NoteRow
        notes={line.notes}
        visible={visible}
        openNote={openNote}
        prefix={`${block.id}:${lineIndex}`}
        onToggle={onToggle}
      />
      {showChords && placed.items.length > 0 && (
        <div className="relative h-[1.35em]" style={{ width: `${width}ch` }}>
          {placed.items.map((item, index) => {
            const note = item.chord.notes.find((entry) => visible.includes(entry.type))
            const key = `${block.id}:${lineIndex}:c${index}:${note?.id ?? ''}`
            const open = note ? openNote === key : false
            return (
              <span key={key} className="absolute top-0" style={{ left: `${item.left}ch` }}>
                <span className="text-[0.72em] leading-none font-semibold whitespace-nowrap text-chart-chord">
                  {item.name}
                  {note && (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={note.text}
                      className="ml-[0.2em] inline-block size-[0.55em] rounded-full bg-chart-chord align-middle"
                      onClick={() => onToggle(open ? null : key)}
                    />
                  )}
                </span>
              </span>
            )
          })}
        </div>
      )}
      {lyric != null && (
        <p className="font-medium whitespace-pre" style={{ width: `${width}ch` }}>
          {lyric || ' '}
        </p>
      )}
      {placed.items.map((item, index) => {
        const note = item.chord.notes.find((entry) => visible.includes(entry.type))
        if (!note) return null
        const key = `${block.id}:${lineIndex}:c${index}:${note.id}`
        if (openNote !== key) return null
        return (
          <p key={key} className="mt-1 font-sans text-[0.6em]">
            <span className="font-semibold text-chart-chord">{NOTE_LABEL[note.type]}.</span>{' '}
            {note.text}
          </p>
        )
      })}
    </div>
  )
}

export function placeChords(
  chords: Array<{ raw: string; column: number; notes: SongNote[]; name: string }>,
) {
  let cursor = 0
  const items = chords.map((chord) => {
    const extra = chord.notes.length ? 1.4 : 0
    const left = Math.max(chord.column, cursor)
    cursor = left + chord.name.length * 0.72 + extra + 0.35
    return { chord, name: chord.name, left }
  })
  return { items, cursor }
}
