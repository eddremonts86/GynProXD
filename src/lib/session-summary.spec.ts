import { describe, expect, it } from 'vitest'
import { summarizeSession } from './session-summary'
import type { Workout } from './types'

const session = (
  date: string,
  weight: number,
  reps: number,
  extra?: Partial<Workout>,
): Workout => ({
  id: date,
  date,
  exercises: [{ exerciseId: 'bench', sets: [{ weight, reps }] }],
  ...extra,
})

describe('summarizeSession', () => {
  it('totals sets and volume and reads the duration from the timestamps', () => {
    const w = session('2026-08-26', 80, 10, {
      startedAt: '2026-08-26T10:00:00.000Z',
      endedAt: '2026-08-26T10:42:30.000Z',
    })
    const s = summarizeSession(w, [])
    expect(s.sets).toBe(1)
    expect(s.volume).toBe(800)
    expect(s.durationMin).toBe(43)
  })

  it('has no duration when a timestamp is missing', () => {
    expect(summarizeSession(session('2026-08-26', 80, 10), []).durationMin).toBeNull()
  })

  it('flags a PR only when an earlier best exists and was beaten', () => {
    const earlier = [session('2026-08-01', 80, 10)]
    expect(summarizeSession(session('2026-08-26', 85, 10), earlier).prs).toEqual(['bench'])
    expect(summarizeSession(session('2026-08-26', 70, 10), earlier).prs).toEqual([])
    // First-ever performance: nothing to beat, not a record.
    expect(summarizeSession(session('2026-08-26', 100, 10), []).prs).toEqual([])
  })
})
