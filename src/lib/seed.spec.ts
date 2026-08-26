import { describe, expect, it } from 'vitest'
import { seedFrom } from './seed'

describe('seedFrom', () => {
  it('is deterministic for the same input', () => {
    expect(seedFrom('2026-08-26')).toBe(seedFrom('2026-08-26'))
  })

  it('differs across inputs', () => {
    expect(seedFrom('2026-08-26')).not.toBe(seedFrom('2026-08-27'))
    expect(seedFrom('a')).not.toBe(seedFrom('b'))
  })

  it('stays in uint32 range, including for the empty string', () => {
    for (const text of ['', '2026-08-26', 'x'.repeat(300)]) {
      const n = seedFrom(text)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
