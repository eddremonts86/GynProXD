import { describe, expect, it } from 'vitest'
import { validateBlocks } from './calendar-link'

/**
 * What the day is allowed to believe about a calendar it did not read itself.
 *
 * The server normalises, and this checks it anyway. A block drawn at an hour
 * that does not exist, or one running backwards, is a stripe on somebody's day
 * with no explanation, and the cost of refusing it here is one loop.
 */
describe('validateBlocks', () => {
  it('keeps a real block and marks where it came from', () => {
    expect(
      validateBlocks({
        blocks: [{ date: '2026-09-04', start: '09:30', end: '10:00', title: 'Standup' }],
      }),
    ).toEqual([
      { date: '2026-09-04', start: '09:30', end: '10:00', source: 'google', label: 'Standup' },
    ])
  })

  it('keeps one with no title, without inventing a label', () => {
    const out = validateBlocks({
      blocks: [{ date: '2026-09-04', start: '09:30', end: '10:00', title: '' }],
    })
    expect(out).toEqual([{ date: '2026-09-04', start: '09:30', end: '10:00', source: 'google' }])
    expect('label' in (out?.[0] ?? {})).toBe(false)
  })

  it('drops what could not be drawn', () => {
    const out = validateBlocks({
      blocks: [
        { date: '4 Sept', start: '09:30', end: '10:00' },
        { date: '2026-09-04', start: '25:00', end: '26:00' },
        { date: '2026-09-04', start: '10:00', end: '09:00' },
        { date: '2026-09-04', start: '10:00', end: '10:00' },
        null,
        { date: '2026-09-04', start: '11:00', end: '12:00' },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out?.[0].start).toBe('11:00')
  })

  it('is no answer without a list', () => {
    expect(validateBlocks(null)).toBeNull()
    expect(validateBlocks({ blocks: 'soon' })).toBeNull()
  })
})
