import { describe, expect, it } from 'vitest'
import {
  adoptedPlanId,
  adoptProgramme,
  PERSONAL_INPUT_KEYS,
  programmeFromPlan,
  programmeMismatch,
} from './gym-programme'
import { mergeWithDefaults } from './onboarding-parse'
import type { GeneratedPlan, OnboardingInput } from './types'

/** An operator's own plan, with everything about their body filled in. */
const operatorInput: OnboardingInput = {
  age: 47,
  sex: 'mujer',
  weightKg: 91,
  targetWeightKg: 78,
  heightCm: 168,
  goal: 'adelgazar',
  level: 'intermedio',
  daysPerWeek: 3,
  minsPerSession: 60,
  equipment: 'barbell',
  effort: 4,
  trainingDays: ['mon', 'wed', 'fri'],
  limitations: 'Reconstructed left ACL, no deep knee flexion under load',
  avoid: 'burpees',
  constraints: 'I coach until eight so I train early',
}

const designed: GeneratedPlan = {
  id: 'plan-1',
  createdAt: '2026-09-01T07:00:00.000Z',
  source: 'coach',
  /* Written by the coach to the person who designed it, which is why it names
     their knee. The first version of this fixture said "knees spared" and the
     unit test passed while a member's screen was showing the injury. */
  coachNotes:
    'Three blocks, volume climbing. ACL precautions are strictly followed: no deep knee flexion under load.',
  input: operatorInput,
  estimatedWeeks: 52,
  estimatedMonths: 12,
  rateKgPerWeek: 0.25,
  requestedDuration: 'anual',
  approvedDuration: 'anual',
  weeks: [
    {
      weekIndex: 0,
      blockIndex: 0,
      days: [
        {
          date: '2026-09-07',
          day: 'mon',
          ecNote: 'Add a set if you can',
          exercises: [
            { exerciseId: 'Barbell_Full_Squat', progression: 'linear' },
            { exerciseId: 'Pushups', progression: 'double' },
          ],
        },
      ],
    },
    /* The second week of block 0 exists and must not produce a second block. */
    { weekIndex: 1, blockIndex: 0, days: [{ date: '2026-09-14', day: 'mon', exercises: [] }] },
    {
      weekIndex: 4,
      blockIndex: 1,
      days: [
        {
          date: '2026-10-05',
          day: 'mon',
          exercises: [{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', progression: 'linear' }],
        },
      ],
    },
  ],
  blocks: [
    { label: 'Base', place: 'barbell', intensity: 'II' },
    { label: 'Heavier', place: 'barbell', intensity: 'III' },
  ],
  weeklyTemplate: { id: 'w1', name: 'Week', days: [], createdAt: '2026-09-01T07:00:00.000Z' },
  milestones: [{ week: 12, weight: 86.2, note: 'quarter' }],
  warnings: [],
}

/**
 * The test this feature exists to pass.
 *
 * The obvious implementation publishes the operator's `GeneratedPlan`, which
 * carries their age, weight, target weight, height and `limitations` — the field
 * where an ACL reconstruction is written down. This app tells members their
 * training never leaves their device, so the first feature that quietly
 * published somebody's would be a lie told to the people who trusted it most.
 *
 * Walked rather than spot-checked: a new field on `OnboardingInput` has to be
 * added to `PERSONAL_INPUT_KEYS` or not, and either way somebody decided.
 */
describe('what a published programme carries', () => {
  const published = programmeFromPlan(designed, 'Hierro Viejo', 'Twelve months, knees intact')
  const serialised = JSON.stringify(published)

  it('carries no key that describes a person', () => {
    for (const key of PERSONAL_INPUT_KEYS) {
      expect(serialised, `"${key}" reached the wire`).not.toContain(`"${key}"`)
    }
  })

  it('carries none of their values either', () => {
    // A key can be renamed on the way out and still be the same leak.
    for (const value of ['47', '91', '78', '168', 'mujer', 'burpees', 'I coach until eight', 'adelgazar']) {
      expect(serialised, `${value} reached the wire`).not.toContain(value)
    }
  })

  /**
   * The leak an allowlist cannot catch.
   *
   * `coachNotes` is a permitted-looking field carrying prose about the plan the
   * designer built for their own body — so it says "ACL precautions". Nothing
   * about the field is personal; everything about its contents is. Found by
   * `scripts/audit/gym-programme-boundary.mjs` reading a member's screen, which
   * is why that script exists.
   */
  it('leaves the designer’s coach notes behind entirely', () => {
    expect(serialised).not.toContain('ACL')
    expect(serialised).not.toContain('knee flexion')
    expect(serialised).not.toContain('coachNotes')
  })

  it('carries no dates, because a structure is not a diary', () => {
    expect(serialised).not.toContain('2026-09-07')
    expect(serialised).not.toContain('2026-10-05')
    expect(serialised).not.toContain('createdAt')
  })

  it('drops the milestones, which are computed from their bodyweight', () => {
    expect(serialised).not.toContain('86.2')
    expect(serialised).not.toContain('milestones')
  })

  it('keeps the training facts, which are the point', () => {
    expect(published).toMatchObject({
      name: 'Twelve months, knees intact',
      gym: 'Hierro Viejo',
      daysPerWeek: 3,
      minsPerSession: 60,
      equipment: 'barbell',
      level: 'intermedio',
      duration: 'anual',
      source: 'coach',
    })
  })

  it('recovers one block per block, not one per week', () => {
    expect(published.blocks).toHaveLength(2)
    expect(published.blocks[0].label).toBe('Base')
    expect(published.blocks[1].label).toBe('Heavier')
    expect(published.blocks[0].days[0].exercises.map((e) => e.exerciseId)).toEqual([
      'Barbell_Full_Squat',
      'Pushups',
    ])
  })

  it('keeps the per-day note, which is coaching rather than confession', () => {
    expect(published.blocks[0].days[0].ecNote).toBe('Add a set if you can')
  })
})

describe('adopting one', () => {
  const published = programmeFromPlan(designed, 'Hierro Viejo', 'Twelve months')
  const member = mergeWithDefaults({
    age: 24,
    weightKg: 68,
    daysPerWeek: 3,
    equipment: 'barbell',
  })

  it('gives the member their own calendar, from their own numbers', () => {
    const mine = adoptProgramme(published, member, new Date('2026-09-07T00:00:00.000Z'))
    expect(mine.input.age).toBe(24)
    expect(mine.input.weightKg).toBe(68)
    /* Their timeline, not the operator's 52 weeks from 91kg. */
    expect(mine.weeks.length).toBeGreaterThan(0)
    expect(mine.weeks[0].days[0].date).toBe('2026-09-07')
  })

  it('keeps the gym’s movements', () => {
    const mine = adoptProgramme(published, member, new Date('2026-09-07T00:00:00.000Z'))
    const used = mine.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
    expect(used).toContain('Barbell_Full_Squat')
  })

  it('reads the gym’s own words, not the coach’s notes about somebody else', () => {
    const withBlurb = programmeFromPlan(
      designed, 'Hierro Viejo', 'Twelve months', 'Twelve months of barbell work, three days a week.',
    )
    const mine = adoptProgramme(withBlurb, member, new Date('2026-09-07T00:00:00.000Z'))
    expect(mine.coachNotes).toBe('Twelve months of barbell work, three days a week.')
    expect(JSON.stringify(mine)).not.toContain('ACL')
  })
})

describe('programmeMismatch', () => {
  const published = programmeFromPlan(designed, 'Hierro Viejo', 'Barbell year')

  it('warns somebody with no barbell, and says what it was written for', () => {
    const home = mergeWithDefaults({ equipment: 'bodyweight' })
    const warning = programmeMismatch(published, home)
    expect(warning).toContain('a full gym')
    expect(warning).toMatch(/\d+ of its \d+ movements/)
  })

  it('says nothing to somebody who has the equipment', () => {
    expect(programmeMismatch(published, mergeWithDefaults({ equipment: 'barbell' }))).toBeNull()
    expect(programmeMismatch(published, mergeWithDefaults({ equipment: 'hibrido' }))).toBeNull()
  })
})

describe('the copy a member ends up with', () => {
  const published = programmeFromPlan(designed, 'Hierro Viejo', 'Twelve months')
  const member = mergeWithDefaults({ age: 24, weightKg: 68 })

  it('is named after the message, so pressing twice cannot make two of them', () => {
    const id = adoptedPlanId('srv-abc123')
    const once = adoptProgramme(published, member, new Date('2026-09-07T00:00:00.000Z'), id)
    const twice = adoptProgramme(published, member, new Date('2026-09-14T00:00:00.000Z'), id)
    expect(once.id).toBe('gen-adopted-srv-abc123')
    expect(twice.id).toBe(once.id)
  })

  it('is a plain generated plan otherwise, with its own id when none is given', () => {
    const mine = adoptProgramme(published, member)
    expect(mine.id).toMatch(/^gen-/)
    expect(mine.id).not.toContain('adopted')
  })
})
