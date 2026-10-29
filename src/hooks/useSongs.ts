import { useCallback, useEffect, useState } from 'react'
import {
  copySong as copySongApi,
  createSong,
  deleteSong,
  getSong,
  listSongs,
  putPlayback,
  patchSongMedia as patchSongMediaApi,
  restoreSong as restoreSongApi,
  revealSongs,
  saveSong as saveSongApi,
  shareSong as shareSongApi,
  type ApiSong,
} from '@/lib/api'
import { INSTRUMENTS, isInstrument, type InstrumentId } from '@/lib/instruments'
import { parseChart } from '@/lib/parseChart'
import type { Song, SongOrigin, SongPlayback } from '@/lib/types'
import { useUser } from '@/hooks/useUser'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; songs: Song[]; hiddenCount: number; needsSeed: boolean }

type Entry = {
  id: string
  origin: SongOrigin
  ownerId: string
  ownerName: string
  shared: boolean
  catalogId: string | null
  editable: boolean
  removable: boolean
  diverged: boolean
  shares: string[]
  hasCopy: boolean
  revision: number
  partRevisions: Partial<Record<InstrumentId, number>>
  parts: Partial<Record<InstrumentId, string>>
  playback: SongPlayback
  missing?: boolean
}

let entries: Entry[] = []
let hiddenCount = 0
let needsSeed = false
let loadToken = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function upsert(row: ApiSong) {
  if (!isInstrument(row.instrument)) return
  let entry = entries.find((item) => item.id === row.id)
  if (!entry) {
    entry = {
      id: row.id,
      origin: row.origin,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      shared: row.shared,
      catalogId: row.catalogId,
      editable: row.editable,
      removable: row.removable,
      diverged: row.diverged,
      shares: row.shares ?? [],
      hasCopy: row.hasCopy,
      revision: row.revision,
      partRevisions: {},
      parts: {},
      playback: {},
    }
    entries.push(entry)
  }
  entry.origin = row.origin
  entry.ownerId = row.ownerId
  entry.ownerName = row.ownerName
  entry.shared = row.shared
  entry.catalogId = row.catalogId
  entry.editable = row.editable
  entry.removable = row.removable
  entry.diverged = row.diverged
  entry.shares = row.shares ?? []
  entry.hasCopy = row.hasCopy
  entry.revision = row.revision
  entry.missing = false
  entry.playback = row.playback ?? {}
  entry.parts[row.instrument] = row.sourceText
  entry.partRevisions[row.instrument] = row.partRevision
}

function materialize(entry: Entry, instrument: InstrumentId): Song | null {
  const sourceText = entry.parts[instrument]
  if (sourceText == null) return null
  const ext = sourceText.trimStart().startsWith('---') ? 'song.md' : 'cho'
  let parsed: Song
  try {
    parsed = parseChart(sourceText, `${entry.id}.${ext}`)
  } catch (error) {
    console.error(entry.id, error)
    parsed = {
      id: entry.id,
      title: entry.id,
      artist: '',
      composer: '',
      key: '',
      source: '',
      sources: [],
      bpm: null,
      durationMs: null,
      audioUrl: '',
      sections: [],
      versions: [],
      lyricsText: '',
      sourceText,
    }
  }
  return {
    ...parsed,
    id: entry.id,
    sourceText,
    origin: entry.origin,
    overridden: entry.diverged,
    ownerId: entry.ownerId,
    ownerName: entry.ownerName,
    shared: entry.shared,
    catalogId: entry.catalogId,
    editable: entry.editable,
    removable: entry.removable,
    shares: entry.shares,
    hasCopy: entry.hasCopy,
    playback: entry.playback,
    instrument,
  }
}

function librarySongs(): Song[] {
  return entries
    .flatMap((entry) => {
      const song = materialize(entry, 'guitar')
      return song ? [song] : []
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'es'))
}

async function loadAll() {
  const token = ++loadToken
  const data = await listSongs('guitar')
  if (token !== loadToken) return
  entries = []
  for (const row of data.songs) upsert(row)
  hiddenCount = data.hiddenCount
  needsSeed = data.needsSeed
  emit()
}

function readyState(): LoadState {
  return { status: 'ready', songs: librarySongs(), hiddenCount, needsSeed }
}

export function useSongs() {
  const user = useUser()
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const listener = () => {
      setState(readyState())
      setVersion((value) => value + 1)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      await loadAll()
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Error al cargar' })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, user.id])

  const songById = useCallback(
    (id: string, instrument: InstrumentId) => {
      const entry = entries.find((item) => item.id === id)
      if (!entry || entry.missing) return null
      return materialize(entry, instrument)
    },
    [version],
  )

  const knowsSong = useCallback(
    (id: string) => entries.some((item) => item.id === id && !item.missing),
    [version],
  )

  const hasPart = useCallback(
    (id: string, instrument: InstrumentId) => {
      const entry = entries.find((item) => item.id === id)
      return entry?.parts[instrument] != null
    },
    [version],
  )

  const ensurePart = useCallback(async (id: string, instrument: InstrumentId) => {
    const entry = entries.find((item) => item.id === id)
    if (entry?.missing || entry?.parts[instrument] != null) return
    try {
      const data = await getSong(id, instrument)
      upsert(data.song)
    } catch (error) {
      const status = error instanceof Error && 'status' in error ? Number(error.status) : 0
      if (status === 404 && !entries.some((item) => item.id === id)) {
        entries.push({
          id,
          origin: 'local',
          ownerId: '',
          ownerName: '',
          shared: false,
          catalogId: null,
          editable: false,
          removable: false,
          diverged: false,
          shares: [],
          hasCopy: false,
          revision: 0,
          partRevisions: {},
          parts: {},
          playback: {},
          missing: true,
        })
      } else if (status !== 404) {
        throw error
      }
    }
    emit()
  }, [])

  const saveSong = async (cho: string, id: string | undefined, instrument: InstrumentId) => {
    const ext = cho.trimStart().startsWith('---') ? 'song.md' : 'cho'
    const parsed = parseChart(cho, `${id || 'nueva'}.${ext}`)
    const lines = parsed.sections.reduce((sum, section) => sum + section.lines.length, 0)
    if (!parsed.title.trim() || lines === 0) {
      throw new Error('El archivo necesita un título y al menos una línea.')
    }
    if (!id) {
      const data = await createSong(cho)
      upsert(data.song)
      const created = entries.find((item) => item.id === data.song.id)
      if (created) {
        for (const item of INSTRUMENTS) {
          // The server may have added the YouTube it found; keep its text.
          created.parts[item.id] = data.song.sourceText
          created.partRevisions[item.id] = data.song.partRevision
        }
      }
      emit()
      return data.song.id
    }
    const entry = entries.find((item) => item.id === id)
    const revision = entry?.revision
    const partRevision = entry?.partRevisions[instrument]
    if (revision == null || partRevision == null) {
      throw new Error('Recarga la canción antes de guardar.')
    }
    const data = await saveSongApi(id, cho, instrument, revision, partRevision)
    upsert(data.song)
    const saved = entries.find((item) => item.id === id)
    if (saved && data.parts) {
      for (const [name, part] of Object.entries(data.parts)) {
        if (!isInstrument(name)) continue
        saved.parts[name] = part.sourceText
        saved.partRevisions[name] = part.revision
      }
    }
    emit()
    return id
  }

  const removeSong = async (song: Song) => {
    await deleteSong(song.id)
    entries = entries.filter((item) => item.id !== song.id)
    if (song.origin === 'copy' && song.catalogId) {
      const catalog = entries.find((item) => item.id === song.catalogId)
      if (catalog) catalog.hasCopy = false
    }
    emit()
  }

  const restoreSong = async (id: string) => {
    const data = await restoreSongApi(id)
    const entry = entries.find((item) => item.id === id)
    if (entry) {
      entry.diverged = false
      entry.revision = data.song.revision
      entry.hasCopy = data.song.hasCopy
      for (const item of INSTRUMENTS) {
        if (item.id === 'guitar') {
          entry.parts.guitar = data.song.sourceText
          entry.partRevisions.guitar = data.song.partRevision
        } else {
          delete entry.parts[item.id]
          delete entry.partRevisions[item.id]
        }
      }
    } else {
      upsert(data.song)
    }
    emit()
  }

  const revealHidden = async () => {
    await revealSongs()
    await loadAll()
  }

  const copySong = async (id: string) => {
    const data = await copySongApi(id)
    upsert(data.song)
    const catalogId = data.song.catalogId
    if (catalogId) {
      const catalog = entries.find((item) => item.id === catalogId)
      if (catalog) catalog.hasCopy = true
    }
    emit()
    return data.song.id
  }

  const shareSong = async (id: string, body: { shared?: boolean; userId?: string; include?: boolean }) => {
    const data = await shareSongApi(id, body)
    upsert(data.song)
    emit()
  }

  const savePlayback = async (id: string, playback: SongPlayback) => {
    const entry = entries.find((item) => item.id === id)
    if (!entry) return
    const before = entry.playback
    entry.playback = playback
    emit()
    try {
      entry.playback = (await putPlayback(id, playback)).playback
      emit()
    } catch (error) {
      entry.playback = before
      emit()
      throw error
    }
  }

  const patchMedia = async (
    id: string,
    body: {
      durationMs?: number | null
      bpm?: number | null
      audioUrl?: string | null
      selectYoutubeUrl?: string | null
    },
    instrument: InstrumentId,
  ) => {
    const data = await patchSongMediaApi(id, { ...body, instrument })
    upsert(data.song)
    const saved = entries.find((item) => item.id === id)
    if (saved && data.parts) {
      for (const [name, part] of Object.entries(data.parts)) {
        if (!isInstrument(name)) continue
        saved.parts[name] = part.sourceText
        saved.partRevisions[name] = part.revision
      }
    }
    emit()
    return data.song
  }

  return {
    state,
    reload,
    savePlayback,
    saveSong,
    removeSong,
    restoreSong,
    revealHidden,
    copySong,
    shareSong,
    patchMedia,
    songById,
    knowsSong,
    hasPart,
    ensurePart,
  }
}
