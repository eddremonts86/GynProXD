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
    expect(blocks![0]).toHaveLength(7)
    expect(blocks![0].find((d) => d.day === 'mon')?.exercises).toHaveLength(3)
    expect(blocks![0].find((d) => d.day === 'tue')?.exercises).toHaveLength(0)
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
    const mon = blocks![0].find((d) => d.day === 'mon')!.exercises
    expect(mon[0]).toMatchObject({ progression: 'none', supersetGroup: 'A' })
    expect(mon[1]).toMatchObject({ progression: 'linear', supersetGroup: null })
    expect(mon[2]).toMatchObject({ timed: true })
  })
})
