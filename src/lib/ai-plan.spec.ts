import { describe, expect, it } from 'vitest'
import { extractJson, validateBlocks } from './ai-plan'
import type { OnboardingInput } from './types'

const input: OnboardingInput = {
  age: 35,
  sex: 'hombre',
  weightKg: 95,
  targetWeightKg: 85,
  heightCm: 178,
  goal: 'adelgazar',
  level: 'principiante',
  daysPerWeek: 2,
  minsPerSession: 60,
  equipment: 'hibrido',
  effort: 3,
}

const day = (day: string, ids: string[]) => ({
  day,
  exercises: ids.map((exerciseId) => ({ exerciseId, progression: 'linear' })),
})

describe('extractJson', () => {
  it('strips think blocks and pulls the first balanced object', () => {
    const text = '<think>reasoning {not json}</think>\nSure: {"a":{"b":"}"},"c":1} trailing'
    expect(extractJson(text)).toEqual({ a: { b: '}' }, c: 1 })
  })

  it('returns null with no object', () => {
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('validateBlocks', () => {
  const good = {
    blocks: [
      {
        days: [
          day('mon', ['Barbell_Bench_Press_-_Medium_Grip', 'Pullups', 'Plank']),
          day('thu', ['Barbell_Full_Squat', 'Romanian_Deadlift', 'Crunches']),
        ],
      },
    ],
  }

  it('accepts a valid block and fills the seven-day shape', () => {
    const blocks = validateBlocks(good, input, 3)
    expect(blocks).not.toBeNull()
    expect(blocks![0].days).toHaveLength(7)
    expect(blocks![0].days.find((d) => d.day === 'mon')?.exercises).toHaveLength(3)
    expect(blocks![0].days.find((d) => d.day === 'tue')?.exercises).toHaveLength(0)
  })

  it('rejects hallucinated movement ids that thin a day below three', () => {
    const bad = {
      blocks: [
        {
          days: [
            day('mon', ['Bench_Pressify_Ultra', 'Pullups', 'Plank']),
            day('thu', ['Barbell_Full_Squat', 'Romanian_Deadlift', 'Crunches']),
          ],
        },
      ],
    }
    expect(validateBlocks(bad, input, 3)).toBeNull()
  })

  it('rejects the wrong day count and duplicate days', () => {
    expect(validateBlocks({ blocks: [{ days: [good.blocks[0].days[0]] }] }, input, 3)).toBeNull()
    const dup = { blocks: [{ days: [good.blocks[0].days[0], good.blocks[0].days[0]] }] }
    expect(validateBlocks(dup, input, 3)).toBeNull()
  })

  it('normalises progression and superset noise instead of failing', () => {
    const noisy = {
      blocks: [
        {
          days: [
            {
              day: 'mon',
              exercises: [
                { exerciseId: 'Pushups', progression: 'waves', supersetGroup: 'a' },
                { exerciseId: 'Pullups', progression: 'linear', supersetGroup: 'Z' },
                { exerciseId: 'Plank', progression: 'none', timed: true },
              ],
            },
            day('thu', ['Barbell_Full_Squat', 'Romanian_Deadlift', 'Crunches']),
          ],
        },
      ],
    }
    const blocks = validateBlocks(noisy, input, 3)
    const mon = blocks![0].days.find((d) => d.day === 'mon')!.exercises
    expect(mon[0]).toMatchObject({ progression: 'none', supersetGroup: 'A' })
    expect(mon[1]).toMatchObject({ progression: 'linear', supersetGroup: null })
    expect(mon[2]).toMatchObject({ timed: true })
  })
})

/**
 * Per-block place, and the one rule it must obey.
 *
 * "1 mes en casa y luego al gym" only works if block 2 may draw on movements
 * block 1 may not. The danger in allowing that is the mirror image: a member who
 * said they train in a living room being handed a barbell because the coach
 * decided block 2 was at a gym. So a block narrows and never widens.
 */
describe('block place narrows, never widens', () => {
  /* Bodyweight ids on purpose: they survive every place, so a failure here is
     about the place rule and never about the movements. */
  const homeBlock = {
    days: [
      day('mon', ['Pushups', 'Bodyweight_Squat', 'Plank']),
      day('thu', ['Butt_Lift_Bridge', 'Single_Leg_Glute_Bridge', 'Dead_Bug']),
    ],
  }
  const both: OnboardingInput = { ...input, equipment: 'hibrido' }
  const home: OnboardingInput = { ...input, equipment: 'bodyweight' }

  it('keeps a place the athlete authorised', () => {
    const blocks = validateBlocks({ blocks: [{ ...homeBlock, place: 'bodyweight' }] }, both, 3)
    expect(blocks![0].place).toBe('bodyweight')
  })

  it('records the label and the intensity a block names', () => {
    const blocks = validateBlocks(
      { blocks: [{ ...homeBlock, label: 'Home base', intensity: 'III' }] },
      both,
      3,
    )
    expect(blocks![0].label).toBe('Home base')
    expect(blocks![0].intensity).toBe('III')
  })

  it('ignores a place or intensity it does not recognise', () => {
    const blocks = validateBlocks(
      { blocks: [{ ...homeBlock, place: 'olympic-pool', intensity: 'IV' }] },
      both,
      3,
    )
    expect(blocks![0].place).toBeUndefined()
    expect(blocks![0].intensity).toBeUndefined()
  })

  it('refuses a gym block inside a bodyweight programme', () => {
    /* The intersection of a barbell pool with a bodyweight programme leaves the
       bodyweight ids the coach actually sent unmatched, so the day falls under
       three movements and the whole structure is rejected rather than trimmed. */
    const gymBlock = {
      days: [
        day('mon', ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Full_Squat', 'Dumbbell_Shoulder_Press']),
        day('thu', ['Dumbbell_Squat', 'Bent_Over_Two-Dumbbell_Row', 'Stiff-Legged_Dumbbell_Deadlift']),
      ],
    }
    expect(validateBlocks({ blocks: [{ ...gymBlock, place: 'barbell' }] }, home, 3)).toBeNull()
  })

  it('lets two blocks in one programme train in different places', () => {
    const gymBlock = {
      days: [
        day('mon', ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Full_Squat', 'Dumbbell_Shoulder_Press']),
        day('thu', ['Dumbbell_Squat', 'Bent_Over_Two-Dumbbell_Row', 'Stiff-Legged_Dumbbell_Deadlift']),
      ],
    }
    const blocks = validateBlocks(
      {
        blocks: [
          { ...homeBlock, place: 'bodyweight', label: 'Month 1, home', intensity: 'II' },
          { ...gymBlock, place: 'barbell', label: 'Gym, heavier', intensity: 'III' },
        ],
      },
      both,
      3,
    )
    expect(blocks).toHaveLength(2)
    expect(blocks![0].place).toBe('bodyweight')
    expect(blocks![1].place).toBe('barbell')
    // The whole point: the movements differ because the places do.
    const first = blocks![0].days.find((d) => d.day === 'mon')!.exercises.map((e) => e.exerciseId)
    const second = blocks![1].days.find((d) => d.day === 'mon')!.exercises.map((e) => e.exerciseId)
    expect(first.some((id) => second.includes(id))).toBe(false)
  })
})
