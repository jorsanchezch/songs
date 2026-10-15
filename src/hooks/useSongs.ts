import { useCallback, useEffect, useState } from 'react'
import { parseChart } from '@/lib/parseChart'
import type { Song } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; songs: Song[] }

type Manifest = {
  files: string[]
  count: number
}

let cache: Promise<Song[]> | null = null

async function loadSongs(): Promise<Song[]> {
  const base = import.meta.env.BASE_URL
  const manifestRes = await fetch(`${base}songs/manifest.json`)
  if (!manifestRes.ok) {
    throw new Error(`No se pudo cargar el índice (${manifestRes.status})`)
  }
  const manifest = (await manifestRes.json()) as Manifest
  if (!manifest.files?.length) throw new Error('El índice de canciones está vacío')

  const songs: Song[] = []
  await Promise.all(
    manifest.files.map(async (file) => {
      const res = await fetch(`${base}songs/${file.split('/').map(encodeURIComponent).join('/')}`)
      if (!res.ok) return
      const text = await res.text()
      try {
        songs.push(parseChart(text, file))
      } catch (error) {
        console.error(file, error)
      }
    }),
  )

  if (!songs.length) throw new Error('No se pudieron leer las canciones')
  songs.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  return songs
}

export function useSongs() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    cache = null
    try {
      cache = loadSongs()
      setState({ status: 'ready', songs: await cache })
    } catch (error) {
      cache = null
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error al cargar',
      })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!cache) cache = loadSongs()
    cache
      .then((songs) => {
        if (!cancelled) setState({ status: 'ready', songs })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Error al cargar',
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { state, reload }
}
