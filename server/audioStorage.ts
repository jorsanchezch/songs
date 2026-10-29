/**
 * MP3 blobs live in R2 (production) or data/audio (local sqlite).
 * D1/SQLite only stores audio_url pointing at the object — never the bytes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>
  httpMetadata?: { contentType?: string }
}

export type AudioBucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
  delete?(key: string): Promise<void>
}

export type AudioStoreEnv = {
  AUDIO_BUCKET?: AudioBucket | unknown
  /** Absolute directory for local MP3 files when R2 is absent (Node/sqlite only). */
  AUDIO_DIR?: string
  /** When true, Node may run yt-dlp extract (never set on the Worker). */
  ALLOW_YT_EXTRACT?: boolean
}

export function isAudioBucket(value: unknown): value is AudioBucket {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as AudioBucket).put === 'function' &&
    typeof (value as AudioBucket).get === 'function'
  )
}

export function r2Configured(env: AudioStoreEnv): boolean {
  return isAudioBucket(env.AUDIO_BUCKET)
}

export function audioStoreReady(env: AudioStoreEnv): boolean {
  return r2Configured(env) || Boolean(env.AUDIO_DIR?.trim())
}

export function sanitizeAudioKey(raw: string): string | null {
  const key = raw.replace(/^\/+/, '').trim()
  if (!key || key.includes('..') || key.length > 200) return null
  if (!/^songs\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.(mp3|m4a|mpeg|mpga|wav|ogg)$/i.test(key)) return null
  return key
}

export function audioApiPath(key: string): string {
  return `/api/audio/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function extensionForType(contentType: string, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (fromName && ['mp3', 'm4a', 'mpeg', 'mpga', 'wav', 'ogg'].includes(fromName)) return fromName === 'mpeg' || fromName === 'mpga' ? 'mp3' : fromName
  const type = contentType.toLowerCase()
  if (type.includes('wav')) return 'wav'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a'
  return 'mp3'
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase()
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'm4a') return 'audio/mp4'
  return 'audio/mpeg'
}

export async function putAudioObject(
  env: AudioStoreEnv,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ key: string; audioUrl: string }> {
  const safe = sanitizeAudioKey(key)
  if (!safe) throw new Error('Clave de audio inválida.')
  if (bytes.byteLength === 0) throw new Error('El archivo de audio está vacío.')
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`El MP3 supera el límite de ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`)
  }

  const bucket = env.AUDIO_BUCKET
  if (isAudioBucket(bucket)) {
    await bucket.put(safe, bytes, { httpMetadata: { contentType } })
    return { key: safe, audioUrl: audioApiPath(safe) }
  }

  const dir = env.AUDIO_DIR?.trim()
  if (!dir) {
    throw new Error(
      'No hay almacén de audio. Configura el bucket R2 (AUDIO_BUCKET) o AUDIO_DIR en desarrollo local.',
    )
  }
  const file = path.join(dir, ...safe.split('/'))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return { key: safe, audioUrl: audioApiPath(safe) }
}

export async function getAudioObject(
  env: AudioStoreEnv,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const safe = sanitizeAudioKey(key)
  if (!safe) return null

  const bucket = env.AUDIO_BUCKET
  if (isAudioBucket(bucket)) {
    const object = await bucket.get(safe)
    if (!object) return null
    const buffer = await object.arrayBuffer()
    return {
      bytes: new Uint8Array(buffer),
      contentType: object.httpMetadata?.contentType || contentTypeForKey(safe),
    }
  }

  const dir = env.AUDIO_DIR?.trim()
  if (!dir) return null
  try {
    const bytes = await readFile(path.join(dir, ...safe.split('/')))
    return { bytes: new Uint8Array(bytes), contentType: contentTypeForKey(safe) }
  } catch {
    return null
  }
}

/** Local filesystem bucket for sqlite/dev when R2 is not bound. */
export function localAudioBucket(rootDir: string): AudioBucket {
  const dir = path.join(rootDir, 'data', 'audio')
  return {
    async put(key, value, options) {
      const safe = sanitizeAudioKey(key)
      if (!safe) throw new Error('Clave de audio inválida.')
      const file = path.join(dir, ...safe.split('/'))
      await mkdir(path.dirname(file), { recursive: true })
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
      await writeFile(file, bytes)
      void options
    },
    async get(key) {
      const safe = sanitizeAudioKey(key)
      if (!safe) return null
      try {
        const bytes = await readFile(path.join(dir, ...safe.split('/')))
        return {
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          httpMetadata: { contentType: contentTypeForKey(safe) },
        }
      } catch {
        return null
      }
    },
  }
}
