import { describe, expect, it } from 'vitest'
import {
  anchorProblems,
  busySpans,
  clockOf,
  freeSpans,
  isValidAnchor,
  minutesOf,
  MINUTES_IN_DAY,
  wakingWindow,
  type Anchor,
} from './life-profile'

const anchor = (over: Partial<Anchor> = {}): Anchor => ({
  id: 'a1',
  label: 'work',
  days: ['mon'],
  start: '09:00',
  end: '17:00',
  kind: 'work',
  ...over,
})

describe('minutesOf', () => {
  it('reads a wall clock', () => {
    expect(minutesOf('00:00')).toBe(0)
    expect(minutesOf('08:30')).toBe(510)
    expect(minutesOf('23:59')).toBe(1439)
    expect(minutesOf(' 09:00 ')).toBe(540)
  })

  it('refuses anything that is not one', () => {
    // Not decoration: these come out of a text field and out of an imported
    // calendar, and a NaN reaching the placer is a slot with no position.
    for (const bad of ['', '9:00', '24:00', '12:60', '1230', 'noon', '08:30:00', '-1:00']) {
      expect(minutesOf(bad)).toBeNull()
    }
  })
})

describe('clockOf', () => {
  it('round-trips', () => {
    for (const clock of ['00:00', '07:15', '13:00', '23:45']) {
      expect(clockOf(minutesOf(clock)!)).toBe(clock)
    }
  })

  it('shows the far end of the day as midnight', () => {
    expect(clockOf(MINUTES_IN_DAY)).toBe('00:00')
  })

  it('clamps rather than wrapping', () => {
    expect(clockOf(-30)).toBe('00:00')
    expect(clockOf(MINUTES_IN_DAY + 120)).toBe('00:00')
  })
})

describe('anchorProblems', () => {
  it('passes a sane anchor', () => {
    expect(anchorProblems(anchor())).toEqual([])
    expect(isValidAnchor(anchor())).toBe(true)
  })

  it('wants a name, a day and two times', () => {
    expect(anchorProblems({}).map((p) => p.field).sort()).toEqual(['days', 'end', 'label', 'start'])
  })

  it('refuses an end at or before the start', () => {
    // A night shift is two anchors, one each side of midnight. Wrapping it
    // silently would file somebody's evening under the wrong day's free time
    // and never say so, which is worse than asking for a second entry.
    expect(anchorProblems(anchor({ start: '22:00', end: '06:00' })).map((p) => p.field)).toEqual(['end'])
    expect(anchorProblems(anchor({ start: '09:00', end: '09:00' })).map((p) => p.field)).toEqual(['end'])
  })

  it('says what to do about it', () => {
    const [problem] = anchorProblems(anchor({ start: '22:00', end: '06:00' }))
    expect(problem.message).toMatch(/two entries/)
  })
})

describe('wakingWindow', () => {
  it('defaults to seven until eleven', () => {
    expect(wakingWindow({})).toEqual({ start: 420, end: 1380 })
  })

  it('takes both ends from the profile', () => {
    expect(wakingWindow({ wake: '05:30', sleep: '21:00' })).toEqual({ start: 330, end: 1260 })
  })

  it('runs to midnight when bedtime is not after the alarm', () => {
    // Somebody on nights. Negative hours awake is the one answer that cannot
    // be right, so the day runs to its far end and the planner has no opinion
    // about what happens after that.
    expect(wakingWindow({ wake: '22:00', sleep: '06:00' })).toEqual({ start: 1320, end: 1440 })
  })

  it('ignores rubbish in either field', () => {
    expect(wakingWindow({ wake: 'early', sleep: 'late' })).toEqual({ start: 420, end: 1380 })
  })
})

describe('busySpans', () => {
  const window = { start: 420, end: 1380 }

  it('takes only the anchors for that weekday', () => {
    const anchors = [anchor({ id: 'a', days: ['mon'] }), anchor({ id: 'b', days: ['tue'] })]
    expect(busySpans(anchors, 'mon', window)).toEqual([{ start: 540, end: 1020 }])
    expect(busySpans(anchors, 'wed', window)).toEqual([])
  })

  it('clips to the waking window', () => {
    const early = anchor({ start: '05:00', end: '08:00' })
    expect(busySpans([early], 'mon', window)).toEqual([{ start: 420, end: 480 }])
  })

  it('drops an anchor entirely outside the window', () => {
    expect(busySpans([anchor({ start: '00:30', end: '04:00' })], 'mon', window)).toEqual([])
  })

  it('merges two anchors that touch', () => {
    // The case worth having a test for: abutting anchors leave a zero-length
    // gap, and a zero-length gap reaching the placer is a slot with no
    // duration on somebody's screen.
    const back = anchor({ id: 'a', start: '09:00', end: '12:00' })
    const toBack = anchor({ id: 'b', start: '12:00', end: '14:00' })
    expect(busySpans([back, toBack], 'mon', window)).toEqual([{ start: 540, end: 840 }])
  })

  it('merges overlapping anchors and keeps the outer edges', () => {
    const wide = anchor({ id: 'a', start: '09:00', end: '17:00' })
    const inside = anchor({ id: 'b', start: '11:00', end: '12:00' })
    expect(busySpans([wide, inside], 'mon', window)).toEqual([{ start: 540, end: 1020 }])
  })

  it('skips an anchor whose times make no sense', () => {
    expect(busySpans([anchor({ start: '17:00', end: '09:00' })], 'mon', window)).toEqual([])
    expect(busySpans([anchor({ start: 'later', end: '09:00' })], 'mon', window)).toEqual([])
  })
})

describe('freeSpans', () => {
  const window = { start: 420, end: 1380 }

  it('is the whole window when nothing is booked', () => {
    expect(freeSpans([], window)).toEqual([window])
  })

  it('is the holes between and around the busy spans', () => {
    expect(freeSpans([{ start: 540, end: 1020 }], window)).toEqual([
      { start: 420, end: 540 },
      { start: 1020, end: 1380 },
    ])
  })

  it('is empty when the day is entirely taken', () => {
    expect(freeSpans([window], window)).toEqual([])
  })

  it('leaves no zero-length gap when a span starts at the window edge', () => {
    expect(freeSpans([{ start: 420, end: 600 }], window)).toEqual([{ start: 600, end: 1380 }])
  })
})
