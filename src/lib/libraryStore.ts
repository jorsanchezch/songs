const KEY = 'acuerdes-songs-v1'

export type LibraryData = {
  hidden: string[]
  overrides: Record<string, string>
  created: Record<string, string>
}

const EMPTY: LibraryData = { hidden: [], overrides: {}, created: {} }

export function loadLibrary(): LibraryData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { hidden: [], overrides: {}, created: {} }
    const parsed = JSON.parse(raw) as Partial<LibraryData>
    return {
      hidden: parsed.hidden ?? [],
      overrides: parsed.overrides ?? {},
      created: parsed.created ?? {},
    }
  } catch {
    return { hidden: [], overrides: {}, created: {} }
  }
}

function write(data: LibraryData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function rememberCreated(id: string, cho: string) {
  const data = loadLibrary()
  data.created[id] = cho
  data.hidden = data.hidden.filter((item) => item !== id)
  write(data)
}

export function rememberOverride(id: string, cho: string) {
  const data = loadLibrary()
  data.overrides[id] = cho
  data.hidden = data.hidden.filter((item) => item !== id)
  write(data)
}

export function forgetSong(id: string, local: boolean) {
  const data = loadLibrary()
  if (local) delete data.created[id]
  else if (!data.hidden.includes(id)) data.hidden.push(id)
  delete data.overrides[id]
  write(data)
}

export function forgetOverride(id: string) {
  const data = loadLibrary()
  delete data.overrides[id]
  write(data)
}

export function showHidden() {
  const data = loadLibrary()
  data.hidden = []
  write(data)
}

export { EMPTY }
