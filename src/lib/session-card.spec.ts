import { describe, expect, it } from 'vitest'
import { cardFromPlannedDay, cardFromWorkout } from './session-card'
import type { Workout } from './types'

const workout: Workout = {
  id: 'w1',
  date: '2026-08-26',
  intensity: 'II',
  ec: true,
  exercises: [
    {
      exerciseId: 'bench',
      sets: [
        { weight: 60, reps: 8 },
        { weight: 62.5, reps: 6 },
      ],
    },
  ],
}

describe('cardFromWorkout', () => {
  it('summarises each movement by set count and its best set by e1rm', () => {
    /* 60×8 estimates 76kg, 62.5×6 estimates 75kg — the lighter set wins. */
    const card = cardFromWorkout(workout)
    expect(card.exercises[0].detail).toBe('2 sets · top 60kg × 8')
    expect(cardFromWorkout({ ...workout, exercises: [{ exerciseId: 'bench', sets: [{ weight: 60, reps: 8 }] }] }).exercises[0].detail).toBe('1 set · top 60kg × 8')
  })

  it('carries intensity, EC and totals into the footer', () => {
    const footer = cardFromWorkout(workout).footer
    expect(footer).toContain('Intensity II')
    expect(footer).toContain('EC')
    expect(footer).toContain('2 sets')
  })
})

describe('cardFromPlannedDay', () => {
  it('lists the movements and prints the intensity ladder', () => {
    const card = cardFromPlannedDay('Push day', 'Monday', [
      { exerciseId: 'bench', progression: 'none' },
      { exerciseId: 'ohp', progression: 'linear' },
    ])
    expect(card.title).toBe('Monday')
    expect(card.subtitle).toBe('Push day')
    expect(card.exercises).toHaveLength(2)
    expect(card.footer.join(' ')).toContain('I — 2 sets')
  })
})
