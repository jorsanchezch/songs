import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { BulkAddLayout, StatusBadge } from '@/components/BulkAddLayout'
import { SongMediaInfoBanner } from '@/components/SongMediaInfoBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSongs } from '@/hooks/useSongs'
import { useUser } from '@/hooks/useUser'
import { DEFAULT_INSTRUMENT } from '@/lib/instruments'
import {
  BULK_LIMIT,
  SongIndex,
  cleanUrl,
  importChartUrl,
  parseBulkLines,
  songsFromLibrary,
  summarizeImports,
} from '@/lib/bulkAdd'

type RowStatus = 'waiting' | 'importing' | 'saved' | 'failed' | 'exists' | 'name'

type Row = {
  key: string
  name: string
  url: string
  status: RowStatus
  detail: string
  songId?: string
  paste: string
}

export function BulkLinksView() {
  const user = useUser()
  const { state, saveSong } = useSongs()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState('')
  const [formError, setFormError] = useState('')
  const songs = state.status === 'ready' ? state.songs : []

  const patch = (key: string, partial: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...partial } : row)))
  }

  const saveNew = (markdown: string) => saveSong(markdown, undefined, DEFAULT_INSTRUMENT)

  const importRow = async (row: Row, index: SongIndex, write: (key: string, partial: Partial<Row>) => void) => {
    write(row.key, { status: 'importing', detail: '' })
    try {
      const result = await importChartUrl(row.url, {}, index, saveNew)
      write(row.key, {
        status: result.status,
        detail: result.message,
        songId: result.id,
        url: row.url,
      })
    } catch (reason) {
      write(row.key, {
        status: 'failed',
        detail: reason instanceof Error ? reason.message : 'No se pudo importar.',
      })
    }
  }

  const run = async () => {
    const parsed = parseBulkLines(text)
    if (!parsed.length) {
      setFormError('Pega al menos una línea.')
      setSummary('')
      return
    }
    if (parsed.length > BULK_LIMIT) {
      setFormError(`Puedes pegar hasta ${BULK_LIMIT} líneas a la vez.`)
      setSummary('')
      return
    }
    if (state.status !== 'ready') {
      setFormError('Espera a que cargue la biblioteca.')
      return
    }
    setFormError('')
    setSummary('')
    const stamp = Date.now()
    const next: Row[] = parsed.map((line, index) => ({
      key: `${stamp}-${index}`,
      name: line.name,
      url: line.url,
      status: line.url ? 'waiting' : 'name',
      detail: line.url ? '' : 'Un nombre sin enlace no se importa.',
      paste: '',
    }))
    let latest = next
    const write = (key: string, partial: Partial<Row>) => {
      latest = latest.map((row) => (row.key === key ? { ...row, ...partial } : row))
      setRows(latest)
    }
    setRows(latest)
    setRunning(true)
    const index = new SongIndex(songsFromLibrary(songs), user.id)
    try {
      for (const row of next) {
        if (row.status !== 'waiting') continue
        await importRow(row, index, write)
      }
    } finally {
      setRunning(false)
      setSummary(summarizeImports(latest))
    }
  }

  const attach = async (row: Row) => {
    const url = cleanUrl(row.paste)
    if (!url) {
      patch(row.key, { detail: 'Ese texto no es un enlace, así que no lo importo.' })
      return
    }
    if (state.status !== 'ready' || running) return
    const index = new SongIndex(songsFromLibrary(songs), user.id)
    const withUrl = { ...row, url }
    patch(row.key, { url, status: 'waiting', detail: '' })
    setRunning(true)
    try {
      await importRow(withUrl, index, patch)
    } finally {
      setRunning(false)
    }
  }

  const names = rows.filter((row) => row.status === 'name' && row.name).map((row) => row.name)

  return (
    <BulkAddLayout
      title="Varios enlaces"
      lede="Un enlace, un nombre, o un nombre con su enlace. Solo se importan los enlaces, uno por uno."
    >
      <SongMediaInfoBanner />
      <p className="text-sm text-muted-foreground">
        Si ya está en el catálogo, no creo otra. Si es nueva, queda como tuya, no como cambio del catálogo.{' '}
        <Link to="/agregar/sugerencias" className="underline-offset-2 hover:underline">
          Buscar cifras en la web
        </Link>
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={running}
          placeholder={'https://www.cifraclub.com/...\nUna canción sin enlace'}
          aria-label="Enlaces y nombres"
          className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div>
          <Button type="submit" disabled={running || state.status !== 'ready'}>
            {running ? 'Importando…' : 'Importar enlaces'}
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
                  <span className="block font-medium break-words">{row.name || row.url}</span>
                  {row.url && row.name ? (
                    <span className="block text-sm break-all text-muted-foreground">{row.url}</span>
                  ) : null}
                  {row.detail ? <span className="mt-1 block text-sm text-muted-foreground">{row.detail}</span> : null}
                </span>
                <StatusBadge status={row.status} />
              </div>
              {row.songId && (row.status === 'saved' || row.status === 'exists') ? (
                <Link
                  to={`/c/${encodeURIComponent(row.songId)}`}
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Ver canción
                </Link>
              ) : null}
              {row.status === 'name' && (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void attach(row)
                  }}
                >
                  <Input
                    value={row.paste}
                    onChange={(event) => patch(row.key, { paste: event.target.value })}
                    placeholder="Pega un enlace"
                    aria-label={`Enlace para ${row.name || 'esta línea'}`}
                    inputMode="url"
                    disabled={running}
                  />
                  <Button type="submit" size="sm" disabled={running || !row.paste.trim()}>
                    Importar
                  </Button>
                  {row.name ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link to={`/agregar/sugerencias?nombres=${encodeURIComponent(row.name)}`}>Buscar cifra</Link>
                    </Button>
                  ) : null}
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
      {names.length > 0 && (
        <Button variant="outline" asChild>
          <Link to={`/agregar/sugerencias?nombres=${encodeURIComponent(names.join('\n'))}`}>
            Buscar cifras para estos nombres
          </Link>
        </Button>
      )}
    </BulkAddLayout>
  )
}
