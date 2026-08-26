import { describe, expect, it } from 'vitest'
import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportKeyBase64,
  fromBase64,
  importKeyBase64,
  randomBytes,
  toBase64,
} from './crypto'

// Fewer iterations than production so the suite stays fast; the algorithm is identical.
const ITER = 1_000

describe('profile crypto', () => {
  it('roundtrips json under a derived key', async () => {
    const salt = randomBytes(16)
    const key = await deriveKey('correct horse', salt, ITER)
    const blob = await encryptJson(key, { workouts: [1, 2, 3], name: 'Edd' })
    expect(blob.iv).not.toBe('')
    await expect(decryptJson(key, blob)).resolves.toEqual({ workouts: [1, 2, 3], name: 'Edd' })
  })

  it('rejects the wrong passphrase', async () => {
    const salt = randomBytes(16)
    const key = await deriveKey('right', salt, ITER)
    const wrong = await deriveKey('wrong', salt, ITER)
    const blob = await encryptJson(key, { secret: true })
    await expect(decryptJson(wrong, blob)).rejects.toThrow()
  })

  it('rejects tampered ciphertext', async () => {
    const key = await deriveKey('pass', randomBytes(16), ITER)
    const blob = await encryptJson(key, 'hello')
    const bytes = fromBase64(blob.data)
    bytes[0] ^= 0xff
    await expect(decryptJson(key, { ...blob, data: toBase64(bytes) })).rejects.toThrow()
  })

  it('same passphrase with different salts gives different keys', async () => {
    const a = await deriveKey('pass', randomBytes(16), ITER)
    const b = await deriveKey('pass', randomBytes(16), ITER)
    const blob = await encryptJson(a, 'x')
    await expect(decryptJson(b, blob)).rejects.toThrow()
  })

  it('keys survive an export and import roundtrip', async () => {
    const key = await deriveKey('pass', randomBytes(16), ITER)
    const revived = await importKeyBase64(await exportKeyBase64(key))
    const blob = await encryptJson(key, [1, 2])
    await expect(decryptJson(revived, blob)).resolves.toEqual([1, 2])
  })
})
