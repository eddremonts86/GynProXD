import { describe, expect, it } from 'vitest'
import {
  choiceIsDue,
  currentDay,
  isProgramComplete,
  resolveDay,
  type StoryProgram,
  type StoryProgress,
} from './story'

const program: StoryProgram = {
  id: 'p',
  name: 'Test',
  tagline: '',
  totalDays: 30,
  tracks: [
    { id: 'load', name: 'Load', focus: '', blurb: '' },
    { id: 'pace', name: 'Pace', focus: '', blurb: '' },
    { id: 'line', name: 'Line', focus: '', blurb: '' },
  ],
  days: [
    { day: 1, title: 'One', chapter: 'a', weight: 'moderate', movements: [{ exerciseId: 'x', prescription: '3 × 10' }] },
    { day: 2, title: 'Two', chapter: 'b', weight: 'light', movements: [] },
    {
      day: 3,
      title: 'Three',
      chapter: 'c',
      weight: 'heavy',
      offersChoice: true,
      movements: [{ exerciseId: 'x', prescription: 'base' }],
      byTrack: {
        load: { chapter: 'c-load', movements: [{ exerciseId: 'y', prescription: 'heavy' }] },
        pace: { chapter: 'c-pace' },
      },
    },
  ],
}

const progress = (over: Partial<StoryProgress> = {}): StoryProgress => ({
  programId: 'p',
  startedAt: '2026-08-01',
  completedDays: [],
  ...over,
})

describe('currentDay', () => {
  it('is the first unfinished day, so catching up works and skipping does not', () => {
    expect(currentDay(program, progress())?.day).toBe(1)
    expect(currentDay(program, progress({ completedDays: [1] }))?.day).toBe(2)
    /* Day 2 done but not day 1: it goes back for the gap. */
    expect(currentDay(program, progress({ completedDays: [2] }))?.day).toBe(1)
  })

  it('runs out of chapters rather than looping', () => {
    expect(currentDay(program, progress({ completedDays: [1, 2, 3] }))).toBeNull()
  })
})

describe('resolveDay', () => {
  it('uses the default chapter and movements without a track', () => {
    const r = resolveDay(program.days[2], undefined)
    expect(r.chapter).toBe('c')
    expect(r.movements[0].exerciseId).toBe('x')
  })

  it('swaps in the track variant when there is one', () => {
    const r = resolveDay(program.days[2], 'load')
    expect(r.chapter).toBe('c-load')
    expect(r.movements[0].exerciseId).toBe('y')
  })

  it('falls back per field: a track may change only the prose', () => {
    const r = resolveDay(program.days[2], 'pace')
    expect(r.chapter).toBe('c-pace')
    expect(r.movements[0].exerciseId).toBe('x')
  })

  it('falls back entirely for a track with no variant', () => {
    const r = resolveDay(program.days[2], 'line')
    expect(r.chapter).toBe('c')
    expect(r.movements[0].exerciseId).toBe('x')
  })
})

describe('choiceIsDue', () => {
  it('is due only on the marked day and only while unchosen', () => {
    expect(choiceIsDue(program, progress())).toBe(false)
    expect(choiceIsDue(program, progress({ completedDays: [1, 2] }))).toBe(true)
    expect(choiceIsDue(program, progress({ completedDays: [1, 2], track: 'load' }))).toBe(false)
  })
})

describe('isProgramComplete', () => {
  it('needs every written day', () => {
    expect(isProgramComplete(program, progress({ completedDays: [1, 2] }))).toBe(false)
    expect(isProgramComplete(program, progress({ completedDays: [1, 2, 3] }))).toBe(true)
  })
})
