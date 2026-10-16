import { useCallback, useEffect, useState } from 'react'
import {
  forgetOverride,
  forgetSong,
  loadLibrary,
  rememberCreated,
  rememberOverride,
  showHidden,
} from '@/lib/libraryStore'
import { parseChart } from '@/lib/parseChart'
import type { Song } from '@/lib/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; songs: Song[]; hiddenCount: number }

type Manifest = {
  files: string[]
  count: number
}

let catalog: Song[] | null = null
let catalogPromise: Promise<Song[]> | null = null
const listeners = new Set<(state: LoadState) => void>()

function decorate(
  song: Song,
  sourceText: string,
  origin: 'catalog' | 'local',
  overridden: boolean,
  id = song.id,
): Song {
  return { ...song, id, sourceText, origin, overridden }
}

function readStored(id: string, cho: string, origin: 'catalog' | 'local'): Song | null {
  try {
    return decorate(parseChart(cho, `${id}.cho`), cho, origin, true, id)
  } catch (error) {
    console.error(id, error)
    return null
  }
}

function merge(base: Song[]): Song[] {
  const library = loadLibrary()
  const hidden = new Set(library.hidden)
  const songs: Song[] = []
  for (const song of base) {
    if (hidden.has(song.id)) continue
    const cho = library.overrides[song.id]
    if (cho) {
      const parsed = readStored(song.id, cho, 'catalog')
      if (parsed) songs.push(parsed)
    } else {
      songs.push(song)
    }
  }
  for (const [id, cho] of Object.entries(library.created)) {
    if (hidden.has(id)) continue
    const parsed = readStored(id, cho, 'local')
    if (parsed) songs.push(parsed)
  }
  songs.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  return songs
}

function emit() {
  if (!catalog) return
  const state: LoadState = {
    status: 'ready',
    songs: merge(catalog),
    hiddenCount: loadLibrary().hidden.length,
  }
  listeners.forEach((listener) => listener(state))
}

async function loadCatalog(): Promise<Song[]> {
  const base = import.meta.env.BASE_URL
  const manifestRes = await fetch(`${base}songs/manifest.json`, { cache: 'no-store' })
  if (!manifestRes.ok) throw new Error(`No se pudo cargar el índice (${manifestRes.status})`)
  const manifest = (await manifestRes.json()) as Manifest
  if (!manifest.files?.length) throw new Error('El índice de canciones está vacío')

  const songs: Song[] = []
  await Promise.all(
    manifest.files.map(async (file) => {
      const res = await fetch(`${base}songs/${file.split('/').map(encodeURIComponent).join('/')}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const text = await res.text()
      try {
        songs.push(decorate(parseChart(text, file), text, 'catalog', false))
      } catch (error) {
        console.error(file, error)
      }
    }),
  )
  if (!songs.length) throw new Error('No se pudieron leer las canciones')
  return songs
}

function fail(error: unknown) {
  catalogPromise = null
  const state: LoadState = {
    status: 'error',
    message: error instanceof Error ? error.message : 'Error al cargar',
  }
  listeners.forEach((listener) => listener(state))
}

export function useSongs() {
  const [state, setState] = useState<LoadState>(
    catalog
      ? { status: 'ready', songs: merge(catalog), hiddenCount: loadLibrary().hidden.length }
      : { status: 'loading' },
  )

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    catalog = null
    catalogPromise = loadCatalog()
    try {
      catalog = await catalogPromise
      emit()
    } catch (error) {
      fail(error)
    }
  }, [])

  useEffect(() => {
    listeners.add(setState)
    if (catalog) emit()
    else {
      if (!catalogPromise) catalogPromise = loadCatalog()
      catalogPromise
        .then((songs) => {
          catalog = songs
          emit()
        })
        .catch(fail)
    }
    return () => {
      listeners.delete(setState)
    }
  }, [])

  const saveSong = (cho: string, id?: string) => {
    const songId = id || `local-${Date.now()}`
    const ext = cho.trimStart().startsWith('---') ? 'song.md' : 'cho'
    const parsed = parseChart(cho, `${songId}.${ext}`)
    const lines = parsed.sections.reduce((sum, section) => sum + section.lines.length, 0)
    if (!parsed.title.trim() || lines === 0) {
      throw new Error('El archivo necesita un título y al menos una línea.')
    }
    const local = songId.startsWith('local-')
    if (local) rememberCreated(songId, cho)
    else rememberOverride(songId, cho)
    emit()
    return songId
  }

  const removeSong = (song: Song) => {
    forgetSong(song.id, song.origin === 'local')
    emit()
  }

  const restoreSong = (id: string) => {
    forgetOverride(id)
    emit()
  }

  const revealHidden = () => {
    showHidden()
    emit()
  }

  return { state, reload, saveSong, removeSong, restoreSong, revealHidden }
}
