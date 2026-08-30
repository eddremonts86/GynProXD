import { describe, expect, it } from 'vitest'
import { MAX_IMAGES, MAX_SOURCE_BYTES, readableSize, rejectionFor } from './message-images'

const file = (type: string, size: number, name = 'plate.jpg'): File =>
  ({ name, type, size }) as File

describe('what a gym is allowed to attach', () => {
  it('takes a normal phone photograph', () => {
    expect(rejectionFor(file('image/jpeg', 2_400_000), 0)).toBeNull()
  })

  it('takes PNG and WebP too', () => {
    expect(rejectionFor(file('image/png', 800_000), 1)).toBeNull()
    expect(rejectionFor(file('image/webp', 400_000), 2)).toBeNull()
  })

  it('refuses a PDF someone dragged in by mistake', () => {
    expect(rejectionFor(file('application/pdf', 90_000, 'prices.pdf'), 0)).toBe(
      'JPEG, PNG or WebP only.',
    )
  })

  it('refuses a raw file too big to be worth decoding', () => {
    expect(rejectionFor(file('image/jpeg', MAX_SOURCE_BYTES + 1), 0)).toContain('12 MB')
  })

  it('stops at four, whatever the fifth one is', () => {
    expect(rejectionFor(file('image/jpeg', 100_000), MAX_IMAGES)).toBe('Four pictures is the limit.')
  })

  it('checks the count before the type, so the fifth PDF says the useful thing', () => {
    expect(rejectionFor(file('application/pdf', 100, 'x.pdf'), MAX_IMAGES)).toBe(
      'Four pictures is the limit.',
    )
  })
})

describe('the size shown under a thumbnail', () => {
  it('counts bytes below a kilobyte', () => {
    expect(readableSize(840)).toBe('840 B')
  })

  it('rounds kilobytes, because nobody reads the decimal', () => {
    expect(readableSize(51_400)).toBe('50 KB')
  })

  it('keeps one decimal once it is megabytes', () => {
    expect(readableSize(2_306_867)).toBe('2.2 MB')
  })
})
