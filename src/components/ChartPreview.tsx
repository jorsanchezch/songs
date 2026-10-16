import { useMemo, useState } from 'react'
import { ChartRow, NoteRow } from '@/components/ChartLines'
import { SpellingToggle } from '@/components/SpellingToggle'
import { Button } from '@/components/ui/button'
import { formatChord, transposeKeyName } from '@/lib/chords'
import { blocksFor, chordSequence } from '@/lib/display'
import { NOTE_LABEL, NOTE_TYPES, type NoteType, type Song, type Spelling } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChartPreview({ song }: { song: Song }) {
  const [spelling, setSpelling] = useState<Spelling>('letters')
  const [showChords, setShowChords] = useState(true)
  const [concise, setConcise] = useState(false)
  const [visibleNotes, setVisibleNotes] = useState<NoteType[]>([...NOTE_TYPES])
  const [versionId, setVersionId] = useState<string | null>(song.versions[0]?.id ?? null)
  const [current, setCurrent] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [semitones, setSemitones] = useState(0)

  const version = song.versions.find((item) => item.id === versionId) ?? song.versions[0]
  const blocks = useMemo(
    () => blocksFor(song, version?.flow ?? null),
    [song, version],
  )
  const activeId = current && blocks.some((block) => block.id === current) ? current : (blocks[0]?.id ?? null)
  const names = chordSequence(blocks.flatMap((block) => block.section.lines)).map((name) =>
    formatChord(name, song.key, semitones, spelling),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <SpellingToggle size="sm" value={spelling} onChange={setSpelling} />
        <Button size="sm" variant="outline" onClick={() => setSemitones((value) => (value <= -11 ? 0 : value - 1))} aria-label="Bajar un semitono">
          −1
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSemitones(0)}>
          {transposeKeyName(song.key, semitones) || song.key || 'Tono'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSemitones((value) => (value >= 11 ? 0 : value + 1))} aria-label="Subir un semitono">
          +1
        </Button>
        <Button size="sm" variant={showChords ? 'default' : 'outline'} onClick={() => setShowChords((value) => !value)}>
          Acordes
        </Button>
        <Button size="sm" variant={concise ? 'default' : 'outline'} onClick={() => setConcise((value) => !value)}>
          {concise ? 'Conciso' : 'Completo'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NOTE_TYPES.map((type) => {
          const on = visibleNotes.includes(type)
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setVisibleNotes((currentNotes) =>
                  on ? currentNotes.filter((item) => item !== type) : [...currentNotes, type],
                )
              }
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium',
                on ? 'border-primary bg-primary/15' : 'text-muted-foreground',
              )}
            >
              {NOTE_LABEL[type]}
            </button>
          )
        })}
      </div>
      {song.versions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {song.versions.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={(version?.id ?? '') === item.id ? 'default' : 'outline'}
              onClick={() => {
                setVersionId(item.id)
                setCurrent(null)
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto">
        {blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => setCurrent(block.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-sm',
              block.id === activeId ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {block.label}
            {block.repeat > 1 ? ` ×${block.repeat}` : ''}
          </button>
        ))}
      </div>
      {names.length > 0 && (
        <p className="text-sm text-chart-chord">
          <span className="mr-2 font-medium text-muted-foreground">Acordes</span>
          {names.join('  ·  ')}
        </p>
      )}
      <div className="space-y-8 font-mono text-[1.35rem]">
        {blocks.map((block) => {
          const active = block.id === activeId
          const folded = !concise && Boolean(block.duplicateOf) && !expanded.includes(block.id) && !active
          if (concise && !active) return null
          return (
            <section key={block.id} className={cn(active && 'border-l-2 border-primary pl-3')}>
              <h2 className="mb-2 font-sans text-sm font-semibold tracking-wide text-primary uppercase">
                {block.label}
                {block.repeat > 1 ? ` ×${block.repeat}` : ''}
              </h2>
              <NoteRow
                notes={block.section.notes}
                visible={visibleNotes}
                openNote={openNote}
                prefix={`${block.id}:section`}
                onToggle={setOpenNote}
              />
              {folded ? (
                <button
                  type="button"
                  className="font-sans text-sm text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setExpanded((ids) => [...ids, block.id])}
                >
                  Igual que {block.duplicateOf}. Mostrar.
                </button>
              ) : (
                block.section.lines.map((line, index) => (
                  <ChartRow
                    key={`${block.id}-${index}`}
                    block={block}
                    lineIndex={index}
                    showChords={showChords || line.lyric == null}
                    spelling={spelling}
                    semitones={semitones}
                    songKey={song.key}
                    visible={visibleNotes}
                    openNote={openNote}
                    onToggle={setOpenNote}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
