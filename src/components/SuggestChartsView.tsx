import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { BulkAddLayout, StatusBadge } from '@/components/BulkAddLayout'
import { SongMediaInfoBanner } from '@/components/SongMediaInfoBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSongs } from '@/hooks/useSongs'
import { useUser } from '@/hooks/useUser'
import { searchCharts } from '@/lib/api'
import {
  BULK_LIMIT,
  SongIndex,
  chartQuery,
  cleanUrl,
  importChartUrl,
  parseBulkLines,
  parseSongQuery,
  songsFromLibrary,
} from '@/lib/bulkAdd'
import { DEFAULT_INSTRUMENT } from '@/lib/instruments'

type RowStatus =
  | 'waiting'
  | 'searching'
  | 'suggestion'
  | 'none'
  | 'failed'
  | 'importing'
  | 'saved'
  | 'exists'

type Row = {
  key: string
  title: string
  artist: string
  status: RowStatus
  suggestionTitle: string
  suggestionUrl: string
  detail: string
  songId?: string
  paste: string
}

export function SuggestChartsView() {
  const user = useUser()
  const { state, saveSong } = useSongs()
  const [params] = useSearchParams()
  const [text, setText] = useState(params.get('nombres') ?? '')
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState('')
  const [formError, setFormError] = useState('')
  const songs = state.status === 'ready' ? state.songs : []

  const patch = (key: string, partial: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...partial } : row)))
  }

  const saveNew = (markdown: string) => saveSong(markdown, undefined, DEFAULT_INSTRUMENT)

  const accept = async (row: Row, url: string) => {
    const link = cleanUrl(url)
    if (!link) {
      patch(row.key, { detail: 'Ese texto no es un enlace, así que no lo importo.' })
      return
    }
    if (state.status !== 'ready' || running) return
    const index = new SongIndex(songsFromLibrary(songs), user.id)
    patch(row.key, { status: 'importing', detail: '' })
    setRunning(true)
    try {
      const result = await importChartUrl(link, { title: row.title, artist: row.artist }, index, saveNew)
      patch(row.key, {
        status: result.status,
        detail: result.message,
        songId: result.id,
        suggestionUrl: link,
      })
    } catch (reason) {
      patch(row.key, {
        status: 'failed',
        detail: reason instanceof Error ? reason.message : 'No se pudo importar.',
        suggestionUrl: link,
      })
    } finally {
      setRunning(false)
    }
  }

  const search = async () => {
    const parsed = parseBulkLines(text)
    if (!parsed.length) {
      setFormError('Pega al menos un nombre.')
      setSummary('')
      return
    }
    if (parsed.length > BULK_LIMIT) {
      setFormError(`Puedes buscar hasta ${BULK_LIMIT} nombres a la vez.`)
      setSummary('')
      return
    }
    setFormError('')
    setSummary('')
    const stamp = Date.now()
    const next: Row[] = parsed.map((line, index) => {
      if (line.url) {
        const named = line.name ? parseSongQuery(line.name) : { title: '', artist: '' }
        return {
          key: `${stamp}-${index}`,
          title: named.title,
          artist: named.artist,
          status: 'suggestion' as const,
          suggestionTitle: line.name || line.url,
          suggestionUrl: line.url,
          detail: 'Enlace pegado. No se importa hasta que lo aceptes.',
          paste: '',
        }
      }
      const query = parseSongQuery(line.name)
      return {
        key: `${stamp}-${index}`,
        title: query.title,
        artist: query.artist,
        status: 'waiting' as const,
        suggestionTitle: '',
        suggestionUrl: '',
        detail: '',
        paste: '',
      }
    })
    setRows(next)
    setRunning(true)
    let suggested = 0
    let missing = 0
    let failed = 0
    try {
      for (const row of next) {
        if (row.status === 'suggestion') {
          suggested += 1
          continue
        }
        patch(row.key, { status: 'searching' })
        try {
          const hit = await searchCharts(chartQuery(row.title, row.artist))
          if (!hit.found || !hit.url) {
            missing += 1
            patch(row.key, {
              status: 'none',
              detail: 'No encontré una cifra pública para esta línea.',
            })
            continue
          }
          suggested += 1
          patch(row.key, {
            status: 'suggestion',
            suggestionTitle: hit.title || hit.url,
            suggestionUrl: hit.url,
            detail: 'Sugerencia lista. No se importa hasta que la aceptes.',
          })
        } catch (reason) {
          failed += 1
          patch(row.key, {
            status: 'failed',
            detail: reason instanceof Error ? reason.message : 'No pude buscar en la web. Pega un enlace.',
          })
        }
      }
    } finally {
      setRunning(false)
      setSummary(
        `Busqué ${next.length}. Con sugerencia: ${suggested}. Sin resultado: ${missing}. Fallaron: ${failed}. Nada se guardó todavía.`,
      )
    }
  }

  return (
    <BulkAddLayout
      title="Sugerir cifras"
      lede="Un nombre por línea. Si quieres, añade el artista después de una coma o un guion."
    >
      <SongMediaInfoBanner />
      <p className="text-sm text-muted-foreground">
        Busco una página pública de acordes y te muestro el enlace. No guardo nada hasta que aceptes. Si ya está en el
        catálogo, aceptarla no crea otra.{' '}
        <Link to="/agregar/enlaces" className="underline-offset-2 hover:underline">
          Ya tengo los enlaces
        </Link>
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={running}
          placeholder={'Dame a Cristo, Marcos Brunet'}
          aria-label="Nombres de canciones"
          className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div>
          <Button type="submit" disabled={running || state.status === 'loading'}>
            {running ? 'Buscando…' : 'Buscar cifras'}
          </Button>
        </div>
      </form>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" />
          Cargando canciones…
        </p>
      )}
      {rows.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-live="polite">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium">{row.title || row.suggestionTitle || 'Sin nombre'}</span>
                  {row.artist ? <span className="block text-sm text-muted-foreground">{row.artist}</span> : null}
                </span>
                <StatusBadge status={row.status} />
              </div>
              {row.suggestionUrl ? (
                <a
                  href={row.suggestionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm break-all text-primary underline-offset-2 hover:underline"
                >
                  {row.suggestionTitle || row.suggestionUrl}
                </a>
              ) : null}
              {row.detail ? <p className="text-sm text-muted-foreground">{row.detail}</p> : null}
              {row.songId && (row.status === 'saved' || row.status === 'exists') ? (
                <Link
                  to={`/c/${encodeURIComponent(row.songId)}`}
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Ver canción
                </Link>
              ) : null}
              {row.status === 'suggestion' && (
                <div>
                  <Button type="button" size="sm" disabled={running} onClick={() => void accept(row, row.suggestionUrl)}>
                    Aceptar
                  </Button>
                </div>
              )}
              {row.status !== 'waiting' && row.status !== 'searching' && row.status !== 'saved' && row.status !== 'exists' && (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void accept(row, row.paste)
                  }}
                >
                  <Input
                    value={row.paste}
                    onChange={(event) => patch(row.key, { paste: event.target.value })}
                    placeholder="O pega un enlace"
                    aria-label={`Otro enlace para ${row.title || 'esta línea'}`}
                    inputMode="url"
                    disabled={running}
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={running || !row.paste.trim()}>
                    Importar este enlace
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {summary && (
        <p className="text-sm font-medium" role="status">
          {summary}
        </p>
      )}
    </BulkAddLayout>
  )
}
