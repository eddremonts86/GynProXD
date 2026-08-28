import { describe, expect, it } from 'vitest'
import { isTimedByNature, isUnilateralByNature, loadIsOptional } from './movement-shape'
import type { Exercise } from './types'

const ex = (name: string, equipment: Exercise['equipment'] = 'barbell'): Exercise => ({
  id: name,
  name,
  muscle: 'quads',
  equipment,
})

describe('isUnilateralByNature', () => {
  it('is false for movements done with both sides at once', () => {
    for (const name of ['Barbell Squat', 'Bench Press', 'Deadlift', 'Plank', 'Pushups']) {
      expect(isUnilateralByNature(ex(name))).toBe(false)
    }
  })

  it('is true when the name says one side at a time', () => {
    for (const name of [
      'One Leg Barbell Squat',
      'Single-Leg High Box Squat',
      'One-Arm Kettlebell Swings',
      'Alternating Kettlebell Row',
    ]) {
      expect(isUnilateralByNature(ex(name))).toBe(true)
    }
  })
})

describe('isTimedByNature', () => {
  it('catches holds, stretches and steady-state cardio', () => {
    for (const name of ['Plank', 'Cat Stretch', 'Walking Treadmill', 'Rowing, Stationary']) {
      expect(isTimedByNature(ex(name))).toBe(true)
    }
  })

  it('leaves counted movements alone', () => {
    for (const name of ['Barbell Squat', 'Pushups', 'Sit-Up']) {
      expect(isTimedByNature(ex(name))).toBe(false)
    }
  })
})

describe('loadIsOptional', () => {
  it('covers bodyweight and timed work', () => {
    expect(loadIsOptional(ex('Pushups', 'bodyweight'))).toBe(true)
    expect(loadIsOptional(ex('Walking Treadmill', 'other'))).toBe(true)
  })

  it('still expects a load on a barbell movement', () => {
    expect(loadIsOptional(ex('Barbell Squat'))).toBe(false)
  })
})
