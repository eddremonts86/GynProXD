/**
 * Profile encryption. One key per profile, derived from a passphrase with
 * PBKDF2-SHA256 and never stored; data rests as AES-GCM ciphertext. Without
 * the passphrase another user of this browser cannot read a profile, which is
 * the whole point.
 */

export interface CipherBlob {
  /** Base64 12-byte IV, fresh per write. */
  iv: string
  /** Base64 ciphertext with the GCM tag. */
  data: string
}

export const KDF_ITERATIONS = 310_000

const subtle = globalThis.crypto.subtle

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Deterministic bytes from a secret, for material that is sent rather than
 * kept — the sync login credential. Same KDF as the data key but a different
 * salt, so holding one never yields the other.
 */
export async function deriveBitsBase64(
  secret: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
  length = 32,
): Promise<string> {
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    length * 8,
  )
  return toBase64(new Uint8Array(bits))
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<CipherBlob> {
  const iv = randomBytes(12)
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  )
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) }
}

/** Throws on a wrong key or tampered data; GCM authenticates. */
export async function decryptJson<T>(key: CryptoKey, blob: CipherBlob): Promise<T> {
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as BufferSource },
    key,
    fromBase64(blob.data) as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

export async function exportKeyBase64(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await subtle.exportKey('raw', key)))
}

export async function importKeyBase64(raw: string): Promise<CryptoKey> {
  return subtle.importKey('raw', fromBase64(raw) as BufferSource, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ])
}
