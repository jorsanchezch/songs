const ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(salt)
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${encode(salt)}$${encode(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (iterations !== ITERATIONS) return false
  const salt = decode(parts[2] ?? '')
  const expected = decode(parts[3] ?? '')
  if (!salt || !expected || salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false
  const actual = await derive(password, salt, iterations)
  return sameBytes(actual, expected)
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', bytesOf(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytesOf(salt), iterations },
    key,
    HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function bytesOf(value: string | Uint8Array): ArrayBuffer {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function decode(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  try {
    const binary = atob(padded + pad)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return diff === 0
}
