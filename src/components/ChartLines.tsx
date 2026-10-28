import { formatChord } from '@/lib/chords'
import { displayLyric, type DisplayBlock } from '@/lib/display'
import type { ViewSettings } from '@/lib/settings'
import { NOTE_LABEL, type NoteType, type SongNote } from '@/lib/types'
import { cn } from '@/lib/utils'

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
  wrapAt,
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
  /** Columns that fit on screen. Longer lines continue below, chords with their syllables. */
  wrapAt?: number
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
  const chordsShown = showChords && placed.items.length > 0
  const segments = wrapSegments(lyric, chordsShown ? placed.items : [], wrapAt)

  return (
    <div className="mb-[0.55em]">
      <NoteRow
        notes={line.notes}
        visible={visible}
        openNote={openNote}
        prefix={`${block.id}:${lineIndex}`}
        onToggle={onToggle}
      />
      {segments.map((segment, segmentIndex) => (
        <div key={segmentIndex} className={cn(segmentIndex > 0 && 'mt-[0.2em] pl-[1.5ch]')}>
          {chordsShown && segment.items.length > 0 && (
            <div className="relative mb-[0.42em] h-[1.7em]" style={{ width: `${segment.width}ch` }}>
              {segment.items.map(({ item, index, left }) => {
                const note = item.chord.notes.find((entry) => visible.includes(entry.type))
                const key = `${block.id}:${lineIndex}:c${index}:${note?.id ?? ''}`
                const open = note ? openNote === key : false
                return (
                  <span key={key} className="absolute top-0" style={{ left: `${left}ch` }}>
                    <span className="-ml-[0.28em] inline-block rounded-[0.3em] bg-chart-chord/15 px-[0.28em] py-[0.14em] text-[0.72em] leading-none font-semibold whitespace-nowrap text-chart-chord">
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
          {segment.lyric != null && (
            <p className="font-medium whitespace-pre" style={{ width: `${segment.width}ch` }}>
              {segment.lyric || ' '}
            </p>
          )}
        </div>
      ))}
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

type PlacedChord = ReturnType<typeof placeChords>['items'][number]

type Segment = {
  lyric: string | null
  items: Array<{ item: PlacedChord; index: number; left: number }>
  width: number
}

/** Splits a chart line at spaces so it fits `wrapAt` columns, never through a chord. */
export function wrapSegments(lyric: string | null, items: PlacedChord[], wrapAt?: number): Segment[] {
  const ends = items.map((item) => item.left + item.name.length * 0.72 + 0.55)
  const total = Math.max(lyric?.trimEnd().length ?? 0, ...ends, 1)
  const all = items.map((item, index) => ({ item, index, left: item.left }))
  if (!wrapAt || total <= wrapAt) {
    return [{ lyric, items: all, width: Math.max(lyric?.length ?? 0, ...ends, 1) }]
  }
  // Continuation rows are indented, so they get a little less room.
  const room = Math.max(8, wrapAt - 2)
  const segments: Segment[] = []
  let start = 0
  while (start < total) {
    let end = start + (segments.length ? room : wrapAt)
    if (end < total) {
      const text = (lyric ?? '').trimEnd()
      // Break the lyric at a space only when the lyric itself runs past the edge.
      if (text.length > end) {
        const space = text.lastIndexOf(' ', end - 1)
        if (space > start + (end - start) / 3) end = space + 1
      }
      // A chord label that would straddle the break starts the next row instead.
      for (let i = 0; i < items.length; i++) {
        const left = items[i]?.left ?? 0
        if (left > start && left < end && (ends[i] ?? 0) > end) end = Math.floor(left)
      }
      if (end <= start) end = start + room
    } else {
      end = total
    }
    const raw = lyric == null ? null : lyric.slice(start, end)
    const lead = raw ? raw.length - raw.trimStart().length : 0
    const text = raw?.slice(lead).trimEnd() || null
    const picked = all
      .filter(({ left }) => left >= start && left < end)
      .map((entry) => ({ ...entry, left: Math.max(0, entry.left - start - lead) }))
    if (text || picked.length) {
      const chordEnd = Math.max(0, ...picked.map(({ item, left }) => left + item.name.length * 0.72 + 0.55))
      segments.push({ lyric: text, items: picked, width: Math.max(text?.length ?? 0, chordEnd, 1) })
    }
    start = end
  }
  return segments.length ? segments : [{ lyric, items: all, width: total }]
}

export function placeChords(
  chords: Array<{ raw: string; column: number; notes: SongNote[]; name: string }>,
) {
  let cursor = 0
  const items = chords.map((chord) => {
    const extra = chord.notes.length ? 1.4 : 0
    const left = Math.max(chord.column, cursor)
    cursor = left + chord.name.length * 0.72 + extra + 0.55
    return { chord, name: chord.name, left }
  })
  return { items, cursor }
}
