import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSongs } from '@/hooks/useSongs'
import { chartToCho, fetchChartPage } from '@/lib/importChart'

export function SongEditor() {
  const { songId = '' } = useParams()
  const navigate = useNavigate()
  const { state, saveSong, removeSong, restoreSong } = useSongs()
  const song = state.status === 'ready' ? state.songs.find((item) => item.id === songId) : undefined
  const [url, setUrl] = useState(song?.source ?? '')
  const [cho, setCho] = useState(song?.sourceText ?? '')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const hydrated = useRef('')
  const ready = state.status === 'ready'
  const missing = Boolean(songId) && ready && !song

  useEffect(() => {
    if (state.status !== 'ready') return
    const key = songId || '__new__'
    if (hydrated.current === key) return
    if (songId && !song) return
    hydrated.current = key
    setCho(song?.sourceText ?? '')
    const source = song?.source ?? ''
    setUrl(source.startsWith('http') ? source : '')
  }, [state.status, song, songId])

  const convert = async () => {
    setError('')
    setBusy(true)
    setStatus('Leyendo el enlace y armando el .cho…')
    try {
      const link = url.trim()
      let next = ''
      if (link) {
        const page = await fetchChartPage(link)
        next = chartToCho(page, link)
      } else if (cho.trim()) {
        next = chartToCho(cho, song?.source ?? '')
      } else {
        throw new Error('Pega un enlace o la cifra.')
      }
      setCho(next)
      setStatus('Listo. Revisa los acordes arriba de la letra y guarda.')
    } catch (reason) {
      setStatus('')
      setError(reason instanceof Error ? reason.message : 'No se pudo convertir.')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    setError('')
    try {
      const id = saveSong(cho, songId || undefined)
      navigate(`/c/${encodeURIComponent(id)}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
    }
  }

  const remove = () => {
    if (!song) return
    const label = song.origin === 'local' ? '¿Eliminar esta canción?' : '¿Ocultar esta canción en este navegador?'
    if (!window.confirm(label)) return
    setLeaving(true)
    removeSong(song)
    navigate('/')
  }

  if (state.status === 'loading' || leaving) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" />
        <p>Cargando…</p>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4">No está esta canción.</p>
        <Button asChild>
          <Link to="/">Volver a Acuerdes</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card/80">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to={song ? `/c/${encodeURIComponent(song.id)}` : '/'}>
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">{song ? 'Editar canción' : 'Nueva canción'}</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Pega el enlace de Cifra Club, Ultimate Guitar o La Cuerda. Se arma un archivo .cho con los acordes en su propia línea, como el resto del cancionero. Se guarda en este navegador.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Enlace
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.cifraclub.com/..."
            inputMode="url"
            aria-label="Enlace de la cifra"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void convert()} disabled={busy}>
            {busy ? 'Convirtiendo…' : 'Convertir a .cho'}
          </Button>
          {song?.overridden && song.origin === 'catalog' && (
            <Button
              variant="outline"
              onClick={() => {
                restoreSong(song.id)
                navigate(`/c/${encodeURIComponent(song.id)}`)
              }}
            >
              Restaurar original
            </Button>
          )}
        </div>
        {status && <p className="text-sm text-primary">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Archivo .cho
          <textarea
            value={cho}
            onChange={(event) => setCho(event.target.value)}
            spellCheck={false}
            className="min-h-[24rem] rounded-md border bg-card p-3 font-mono text-sm leading-5"
            aria-label="Archivo ChordPro"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!cho.trim()}>
            Guardar
          </Button>
          {song && (
            <Button variant="outline" onClick={remove}>
              {song.origin === 'local' ? 'Eliminar' : 'Ocultar'}
            </Button>
          )}
          {cho.trim() && (
            <Button variant="outline" onClick={() => downloadCho(cho)}>
              Descargar .cho
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}

function downloadCho(cho: string) {
  const title = cho.match(/\{title:\s*([^}]+)\}/i)?.[1]?.trim() || 'cancion'
  const artist = cho.match(/\{artist:\s*([^}]+)\}/i)?.[1]?.trim()
  const blob = new Blob([cho], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${artist ? `${title} - ${artist}` : title}.cho`.replace(/[\\/]/g, '-')
  link.click()
  URL.revokeObjectURL(url)
}
