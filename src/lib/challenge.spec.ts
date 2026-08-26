import { describe, expect, it } from 'vitest'
import {
  challengeCalendar,
  challengeStreak,
  dateForDay,
  isChallengeComplete,
  repsForDay,
  totalReps,
  type ActiveChallenge,
  type Challenge,
} from './challenge'

const countdown: Challenge = {
  id: 'c1',
  name: 'Squat Countdown',
  exerciseId: 'Bodyweight_Squat',
  days: 30,
  start: 30,
  delta: -1,
  unit: 'reps',
}

const active = (completedDays: string[] = []): ActiveChallenge => ({
  challenge: countdown,
  startedAt: '2026-08-01',
  completedDays,
})

describe('repsForDay / totalReps', () => {
  it('counts down without dropping below one', () => {
    expect(repsForDay(countdown, 1)).toBe(30)
    expect(repsForDay(countdown, 30)).toBe(1)
    expect(repsForDay({ ...countdown, delta: -5 }, 30)).toBe(1)
  })

  it('totals the classic 30..1 countdown to 465', () => {
    expect(totalReps(countdown)).toBe(465)
  })
})

describe('challengeCalendar', () => {
  it('maps days to dates and flags done, today, missed and future', () => {
    const cal = challengeCalendar(active(['2026-08-01']), '2026-08-03')
    expect(dateForDay(active(), 3)).toBe('2026-08-03')
    expect(cal[0]).toMatchObject({ day: 1, done: true, missed: false })
    expect(cal[1]).toMatchObject({ day: 2, done: false, missed: true })
    expect(cal[2]).toMatchObject({ day: 3, isToday: true, missed: false, future: false })
    expect(cal[3]).toMatchObject({ day: 4, future: true })
  })
})

describe('completion and streak', () => {
  it('is complete once every day is marked', () => {
    const all = challengeCalendar(active(), '2026-09-30').map((d) => d.dateIso)
    expect(isChallengeComplete(active(all))).toBe(true)
    expect(isChallengeComplete(active(all.slice(1)))).toBe(false)
  })

  it('streak counts consecutive days and forgives an unmarked today', () => {
    expect(challengeStreak(active(['2026-08-01', '2026-08-02']), '2026-08-03')).toBe(2)
    expect(challengeStreak(active(['2026-08-01', '2026-08-02', '2026-08-03']), '2026-08-03')).toBe(3)
    expect(challengeStreak(active(['2026-08-01']), '2026-08-03')).toBe(0)
  })
})
