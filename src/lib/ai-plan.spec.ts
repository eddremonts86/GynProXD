import { describe, expect, it } from 'vitest'
import { aiCoachEnabled, coachDestination, extractJson, validateBlocks } from './ai-plan'
import whereWordsGoSource from '../components/where-words-go.tsx?raw'
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

  /**
   * The truncated tail, which was throwing away whole programmes.
   *
   * MiniMax-Text-01 returns `finish_reason: "stop"` with a body one `]}` short
   * of valid, having spent 1,830 of an allowed 4,000 tokens — not capped, not
   * interrupted, just stopping mid-structure and reporting success. The scanner
   * found no balanced object and gave up, and three blocks of correct work went
   * in the bin over two characters.
   */
  it('closes an answer that was cut off mid-structure', () => {
    const cut = '{"planName":"x","blocks":[{"days":[{"day":"mon","exercises":[{"exerciseId":"Pushups"}]}]}]'
    expect(extractJson(cut)).toEqual({
      planName: 'x',
      blocks: [{ days: [{ day: 'mon', exercises: [{ exerciseId: 'Pushups' }] }] }],
    })
  })

  /**
   * The other way the same model breaks the same answer.
   *
   * Not a cut-off tail: a complete response with `{"` missing from the start of
   * every array element after the first, in both the days array and the blocks
   * array. Captured from a live call that reported `finish_reason: "stop"`; the
   * three calls either side of it were clean, which is what makes it expensive
   * — it costs a minute and a paid request, and then the programme is binned.
   */
  it('restores an object opener dropped mid-array', () => {
    const broken =
      '{"planName":"x","blocks":[{"label":"Home","days":[' +
      '{"day":"mon","exercises":[{"exerciseId":"Pushups"}]},' +
      'day":"wed","exercises":[{"exerciseId":"Plank"}]}]},' +
      'label":"Gym","days":[{"day":"mon","exercises":[{"exerciseId":"Barbell_Curl"}]}]}]}'
    expect(extractJson(broken)).toEqual({
      planName: 'x',
      blocks: [
        {
          label: 'Home',
          days: [
            { day: 'mon', exercises: [{ exerciseId: 'Pushups' }] },
            { day: 'wed', exercises: [{ exerciseId: 'Plank' }] },
          ],
        },
        { label: 'Gym', days: [{ day: 'mon', exercises: [{ exerciseId: 'Barbell_Curl' }] }] },
      ],
    })
  })

  it('restores an opener dropped from the first element too', () => {
    expect(extractJson('{"blocks":[label":"Home"}]}')).toEqual({ blocks: [{ label: 'Home' }] })
  })

  it('leaves the same shape alone inside a string', () => {
    // coachNotes is prose written by the model and can contain anything. A
    // repair that edited string contents would rewrite what a member reads.
    const notes = 'blocks are labelled [home, day": one] and repeat'
    expect(extractJson(JSON.stringify({ coachNotes: notes, blocks: [] }))).toEqual({
      coachNotes: notes,
      blocks: [],
    })
  })

  it('prefers a clean parse over any repair', () => {
    // The repairs only ever run on text that already failed to parse. If this
    // ordering inverts, a good answer starts going through a rewriter.
    const clean = '{"planName":"x","blocks":[{"label":"a"},{"label":"b"}]}'
    expect(extractJson(clean)).toEqual({ planName: 'x', blocks: [{ label: 'a' }, { label: 'b' }] })
  })

  it('survives both failures in one answer', () => {
    const both = '{"blocks":[{"label":"Home"},label":"Gym","days":[{"day":"mon"'
    expect(extractJson(both)).toEqual({
      blocks: [{ label: 'Home' }, { label: 'Gym', days: [{ day: 'mon' }] }],
    })
  })

  it('closes a string left hanging open', () => {
    expect(extractJson('{"planName":"half a nam')).toEqual({ planName: 'half a nam' })
  })

  it('drops a key that was cut before its value', () => {
    expect(extractJson('{"planName":"x","coachNo')).toEqual({ planName: 'x' })
  })

  it('drops a trailing comma left by the cut', () => {
    expect(extractJson('{"a":1,')).toEqual({ a: 1 })
  })

  it('invents nothing — a cut with no open container is still null', () => {
    expect(extractJson('not json, no braces at all')).toBeNull()
  })

  it('prefers a complete object over repairing', () => {
    // The balanced scan runs first; repair is only ever the fallback.
    expect(extractJson('{"a":1} trailing junk {"b":2')).toEqual({ a: 1 })
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

  it('still refuses gym movements inside a bodyweight programme', () => {
    /* The guarantee that survives: the ceiling is the PROGRAMME's pool, built
       from what the member said. A block labelling itself `barbell` does not
       widen it — the barbell ids fail the programme pool, the day falls under
       three, and the structure is refused. What changed is only that a block may
       no longer NARROW its way into rejecting itself. */
    const gymBlock = {
      days: [
        day('mon', ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Full_Squat', 'Dumbbell_Shoulder_Press']),
        day('thu', ['Dumbbell_Squat', 'Bent_Over_Two-Dumbbell_Row', 'Stiff-Legged_Dumbbell_Deadlift']),
      ],
    }
    expect(validateBlocks({ blocks: [{ ...gymBlock, place: 'barbell' }] }, home, 3)).toBeNull()
  })

  it('keeps a home block that mixes bodyweight with the dumbbells the member has', () => {
    /* The case the live coach produced and the strict filter destroyed: a block
       labelled `bodyweight` holding what a living room with dumbbells actually
       contains. The member said `hibrido`, so all of it is authorised. */
    const realistic = {
      days: [
        day('mon', ['Pushups', 'Bodyweight_Squat', 'Bent_Over_Two-Dumbbell_Row']),
        day('thu', ['Plank', 'Dumbbell_Shoulder_Press', 'Butt_Lift_Bridge']),
      ],
    }
    const blocks = validateBlocks({ blocks: [{ ...realistic, place: 'bodyweight', label: 'Home base' }] }, both, 3)
    expect(blocks).not.toBeNull()
    expect(blocks![0].place).toBe('bodyweight')
    const mon = blocks![0].days.find((d) => d.day === 'mon')!.exercises.map((e) => e.exerciseId)
    expect(mon).toContain('Bent_Over_Two-Dumbbell_Row')
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

/**
 * The check that was binning good programmes.
 *
 * `rawDays.length !== daysPerWeek` rejected the whole structure over one extra
 * day. Measured against the real coach on the real prompt: three blocks, right
 * labels, places phased bodyweight → hibrido → barbell exactly as the member's
 * sentence asked, zero hallucinated ids — discarded, and the deterministic
 * template shipped instead, because it had added a light Saturday to a
 * three-day week.
 */
describe('a generous coach is trimmed, a lazy one is refused', () => {
  const threeDay: OnboardingInput = { ...input, daysPerWeek: 3 }

  const dayOf = (d: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', ids: string[]) => day(d, ids)
  const gym = ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Full_Squat', 'Dumbbell_Shoulder_Press']

  it('keeps a programme that offered one day too many', () => {
    const blocks = validateBlocks(
      { blocks: [{ days: [dayOf('mon', gym), dayOf('wed', gym), dayOf('fri', gym), dayOf('sat', gym)] }] },
      threeDay,
      3,
    )
    expect(blocks).not.toBeNull()
    const withWork = blocks![0].days.filter((d) => d.exercises.length > 0).map((d) => d.day)
    expect(withWork).toHaveLength(3)
  })

  it('keeps the days the member named when it has to choose', () => {
    // Told us mon/wed/fri; the coach also offered tue and sat. Dropping Wednesday
    // would be a stranger failure than the one this fixes.
    const blocks = validateBlocks(
      {
        blocks: [
          { days: [dayOf('mon', gym), dayOf('tue', gym), dayOf('wed', gym), dayOf('fri', gym), dayOf('sat', gym)] },
        ],
      },
      { ...threeDay, trainingDays: ['mon', 'wed', 'fri'] },
      3,
    )
    const withWork = blocks![0].days.filter((d) => d.exercises.length > 0).map((d) => d.day)
    expect(withWork).toEqual(['mon', 'wed', 'fri'])
  })

  it('still refuses a coach that returned fewer days than asked', () => {
    // Nothing to salvage: this half of the check stays as strict as it was.
    expect(validateBlocks({ blocks: [{ days: [dayOf('mon', gym), dayOf('wed', gym)] }] }, threeDay, 3)).toBeNull()
  })
})

/**
 * The sentence a member reads and the request the app makes must come from the
 * same answer.
 *
 * They did not, once: `aiCoachEnabled` consulted the build flag before the
 * sync server, and the privacy line consulted only the sync server. A dev
 * build — or any production build handed a key at build time — therefore
 * displayed "nothing you write here is sent anywhere" directly above a box
 * whose contents went to a vendor. Nothing failed; the two just answered
 * differently, and only one of them was on screen.
 *
 * So the invariant is structural, and this is what guards it: one function,
 * and the component reads it rather than re-deriving a second opinion.
 */
describe('coachDestination is the single answer', () => {
  it('is what aiCoachEnabled reports', () => {
    expect(aiCoachEnabled()).toBe(coachDestination().coach)
  })

  it('never says self without saying coach', () => {
    const d = coachDestination()
    if (d.host === 'self') expect(d.coach).toBe(true)
  })

  it('is the only source the privacy line reads', () => {
    // A grep, deliberately: the bug was a second source of truth, not a wrong
    // branch, and a rendering test would have passed on the day it shipped.
    expect(whereWordsGoSource).toContain("coachDestination")
    expect(whereWordsGoSource).not.toContain('serverCapabilities')
  })
})
