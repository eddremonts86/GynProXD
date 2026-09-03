import { describe, expect, it } from 'vitest'
import { buildDay, formatMinutes, freeMinutes, weekdayOf, type DayInput } from './day-plan'
import type { Anchor, LifeProfile } from './life-profile'

/**
 * The arithmetic the day planner is. Nothing here touches IO, a clock or a
 * model, which is the point: the whole feature's claim is that it arranges what
 * already exists rather than inventing anything, and a claim like that is only
 * worth making if it can be checked exhaustively.
 */
const MONDAY = '2026-09-07'
const SATURDAY = '2026-09-12'
const NOW = new Date('2026-09-07T06:00:00.000Z')

const anchor = (over: Partial<Anchor> = {}): Anchor => ({
  id: 'a1',
  label: 'work',
  days: ['mon'],
  start: '09:00',
  end: '17:00',
  kind: 'work',
  ...over,
})

const profile = (over: Partial<LifeProfile> = {}): LifeProfile => ({
  anchors: [],
  updatedAt: NOW.toISOString(),
  ...over,
})

const day = (over: Partial<DayInput> = {}) =>
  buildDay({ date: MONDAY, profile: profile(), ...over }, NOW)

const at = (kind: string, plan: ReturnType<typeof day>) =>
  plan.slots.filter((s) => s.kind === kind).map((s) => `${s.start}-${s.end}`)

describe('weekdayOf', () => {
  it('reads a local date, not a UTC instant', () => {
    // `new Date('2026-09-07')` is UTC midnight, which is Sunday evening
    // everywhere west of Greenwich, so a bare parse names the wrong day for
    // half the planet. dates.ts makes the same point in the other direction.
    expect(weekdayOf('2026-09-07')).toBe('mon')
    expect(weekdayOf('2026-09-12')).toBe('sat')
    expect(weekdayOf('2026-09-13')).toBe('sun')
  })

  it('is null for anything that is not a date', () => {
    for (const bad of ['', 'monday', '2026-9-7', '2026-09-07T10:00', 'tomorrow']) {
      expect(weekdayOf(bad)).toBeNull()
    }
  })
})

describe('anchors', () => {
  it('go on the day as entered, not as clipped', () => {
    // Somebody whose shift starts before they said they get up should see the
    // shift they typed. The clipping is an internal fact about where the free
    // time is, not a correction to their own description of their day.
    const plan = day({ profile: profile({ anchors: [anchor({ start: '05:00', end: '08:00' })] }) })
    expect(at('anchor', plan)).toEqual(['05:00-08:00'])
  })

  it('only appear on the weekdays they name', () => {
    const p = profile({ anchors: [anchor({ days: ['mon', 'wed'] })] })
    expect(at('anchor', buildDay({ date: MONDAY, profile: p }, NOW))).toEqual(['09:00-17:00'])
    expect(at('anchor', buildDay({ date: SATURDAY, profile: p }, NOW))).toEqual([])
  })

  it('are dropped when their times contradict themselves', () => {
    const p = profile({ anchors: [anchor({ start: '17:00', end: '09:00' })] })
    expect(at('anchor', buildDay({ date: MONDAY, profile: p }, NOW))).toEqual([])
  })
})

describe('the training session', () => {
  it('takes the longest free gap and starts at the top of it', () => {
    // Default window 07:00-23:00 with work 09:00-17:00 leaves two hours before
    // and six after, so the session belongs in the evening.
    const plan = day({
      profile: profile({ anchors: [anchor()] }),
      training: { label: 'Push day', minutes: 90 },
    })
    expect(at('training', plan)).toEqual(['17:00-18:30'])
  })

  it('fits into a gap that is exactly long enough', () => {
    const plan = day({
      profile: profile({ wake: '07:00', sleep: '08:30', anchors: [] }),
      training: { label: 'Push day', minutes: 90 },
    })
    expect(at('training', plan)).toEqual(['07:00-08:30'])
  })

  it('is reported unplaced when no gap holds it', () => {
    // The honest half of the output. A Tuesday with no ninety minute hole in it
    // should say so, not show a day with the session mysteriously absent.
    const plan = day({
      profile: profile({
        anchors: [anchor({ start: '07:00', end: '22:00' })],
      }),
      training: { label: 'Push day', minutes: 90 },
    })
    expect(at('training', plan)).toEqual([])
    expect(plan.unplaced).toEqual(['training'])
  })

  it('is left alone when the planner has nothing for that day', () => {
    const plan = day({ training: null })
    expect(plan.unplaced).toEqual([])
    expect(plan.slots).toEqual([])
  })

  it('is not placed for a zero-minute session', () => {
    const plan = day({ training: { label: 'Push day', minutes: 0 } })
    expect(at('training', plan)).toEqual([])
    expect(plan.unplaced).toEqual([])
  })

  it('prefers the earlier of two equally long gaps, so the day is stable', () => {
    const p = profile({
      wake: '08:00',
      sleep: '18:00',
      anchors: [anchor({ start: '11:00', end: '15:00' })],
    })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 60 } }, NOW)
    expect(at('training', plan)).toEqual(['08:00-09:00'])
  })
})

describe('what a calendar says about this one day', () => {
  const block = (over: Partial<{ date: string; start: string; end: string; label: string }> = {}) => ({
    id: `b-${over.start ?? '14:00'}`,
    date: MONDAY,
    start: '14:00',
    end: '15:00',
    source: 'ics' as const,
    ...over,
  })

  it('is on the day, and blocks the time', () => {
    const p = profile({ busy: [block({ label: 'Physio' })] })
    const plan = buildDay({ date: MONDAY, profile: p }, NOW)
    expect(plan.slots.map((s) => `${s.kind} ${s.start}-${s.end} ${s.label}`)).toEqual([
      'busy 14:00-15:00 Physio',
    ])
  })

  it('is labelled Busy when no title was kept', () => {
    // The import can drop titles. "Busy" is the honest label for a block with
    // none, and it is all the day needs to know.
    const p = profile({ busy: [block()] })
    expect(buildDay({ date: MONDAY, profile: p }, NOW).slots[0].label).toBe('Busy')
  })

  it('only appears on its own date', () => {
    const p = profile({ busy: [block()] })
    expect(buildDay({ date: SATURDAY, profile: p }, NOW).slots).toEqual([])
  })

  it('pushes the session out of the time it holds', () => {
    // The reason this type exists. A planner that puts the session inside
    // Thursday's meeting gets closed and not reopened.
    const p = profile({ wake: '13:00', sleep: '17:00', busy: [block()] })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 } }, NOW)
    expect(at('training', plan)).toEqual(['15:00-16:30'])
  })

  it('merges with an anchor it runs into, leaving no gap of no length', () => {
    // Two sources feed the placer now. Merging each list separately would leave
    // the seam between them unmerged, and a zero-length gap between work and a
    // meeting that starts the moment it ends is a slot with no duration.
    const p = profile({
      anchors: [anchor({ start: '09:00', end: '14:00' })],
      busy: [block({ start: '14:00', end: '18:00' })],
    })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 60 } }, NOW)
    /* 07:00-09:00 and 18:00-23:00 are the only free time; the evening is bigger. */
    expect(at('training', plan)).toEqual(['18:00-19:00'])
  })

  it('is ignored when its times make no sense', () => {
    const p = profile({ busy: [block({ start: '15:00', end: '14:00' })] })
    expect(buildDay({ date: MONDAY, profile: p }, NOW).slots).toEqual([])
  })

  it('can take the whole day, and the session says so', () => {
    const p = profile({ busy: [block({ start: '07:00', end: '23:00' })] })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 60 } }, NOW)
    expect(plan.unplaced).toEqual(['training'])
  })
})

describe('an hour they would rather train', () => {
  it('is aimed at when they have named one', () => {
    // Work 09:00-17:00 leaves 07:00-09:00 and 17:00-23:00. Without a
    // preference the session takes the evening, because it is the bigger hole.
    const p = profile({ anchors: [anchor()], trainAt: '07:00' })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 } }, NOW)
    expect(at('training', plan)).toEqual(['07:00-08:30'])
  })

  it('cannot squeeze a session into a gap too short for it', () => {
    // A preference decides where among the possible, never whether. The
    // morning holds two hours; a two and a half hour session has to go in the
    // evening whatever anybody would prefer.
    const p = profile({ anchors: [anchor()], trainAt: '07:00' })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Long one', minutes: 150 } }, NOW)
    expect(at('training', plan)).toEqual(['17:00-19:30'])
  })

  it('falls back to the biggest hole when the hour makes no sense', () => {
    const p = profile({ anchors: [anchor()], trainAt: 'after work' })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 } }, NOW)
    expect(at('training', plan)).toEqual(['17:00-18:30'])
  })
})

describe('an hour they would rather eat', () => {
  it('moves the plate off the default', () => {
    const p = profile({ mealAt: '19:30' })
    const plan = buildDay({ date: MONDAY, profile: p, plate: { label: 'Chicken creole' } }, NOW)
    expect(at('meal', plan)).toEqual(['19:30-20:00'])
  })

  it('ignores rubbish and keeps the default', () => {
    const p = profile({ mealAt: 'whenever' })
    const plan = buildDay({ date: MONDAY, profile: p, plate: { label: 'Chicken creole' } }, NOW)
    expect(at('meal', plan)).toEqual(['13:00-13:30'])
  })
})

describe('the plate', () => {
  it('lands as near to the middle of the day as the free time allows', () => {
    const plan = day({ plate: { label: 'Chicken creole', ref: 'r1' } })
    expect(at('meal', plan)).toEqual(['13:00-13:30'])
  })

  it('moves to the nearest edge when the middle of the day is taken', () => {
    // Work until 17:00, so the closest free half hour to one o'clock is the one
    // that starts the moment work ends.
    const plan = day({
      profile: profile({ anchors: [anchor()] }),
      plate: { label: 'Chicken creole' },
    })
    expect(at('meal', plan)).toEqual(['17:00-17:30'])
  })

  it('does not push the session out of the only gap that held it', () => {
    /**
     * The reason training is placed first. The gap 12:00-13:45 is the only one
     * that fits ninety minutes; half an hour of lunch taken near one o'clock
     * would split it and leave nowhere for the session.
     */
    const p = profile({
      wake: '12:00',
      sleep: '13:45',
      anchors: [],
    })
    const plan = buildDay(
      {
        date: MONDAY,
        profile: p,
        training: { label: 'Push', minutes: 90 },
        plate: { label: 'Chicken creole' },
      },
      NOW,
    )
    expect(at('training', plan)).toEqual(['12:00-13:30'])
    expect(plan.unplaced).toEqual(['meal'])
  })

  it('carries the reference the screen links out with', () => {
    const plan = day({ plate: { label: 'Chicken creole', ref: 'r1' } })
    expect(plan.slots.find((s) => s.kind === 'meal')?.ref).toBe('r1')
  })
})

describe('the challenge day', () => {
  it('takes a quarter of an hour out of the biggest gap left', () => {
    const plan = day({
      profile: profile({ anchors: [anchor()] }),
      training: { label: 'Push', minutes: 90 },
      challenge: { label: 'Day 4 of 30' },
    })
    /* Evening gap 17:00-23:00: session takes 17:00-18:30, the plate is absent,
       so the remaining 18:30-23:00 is the biggest hole. */
    expect(at('challenge', plan)).toEqual(['18:30-18:45'])
  })

  it('is reported unplaced on a day with no room', () => {
    const plan = day({
      profile: profile({ anchors: [anchor({ start: '07:00', end: '23:00' })] }),
      challenge: { label: 'Day 4 of 30' },
    })
    expect(plan.unplaced).toEqual(['challenge'])
  })
})

describe('something they said they would turn up to', () => {
  const commitment = { label: 'Saturday class', start: '10:00', end: '11:00', ref: 'm1' }

  it('is on the day at the hour it was answered for', () => {
    const plan = day({ commitments: [commitment] })
    expect(plan.slots.map((s) => `${s.kind} ${s.start}-${s.end} ${s.label}`)).toEqual([
      'event 10:00-11:00 Saturday class',
    ])
  })

  it('blocks the time, like an anchor and unlike anything placed', () => {
    // Being somewhere at ten because you said you would be is not a
    // preference. A planner that scheduled a session over it would be wrong in
    // the way that ends the relationship.
    const p = profile({ wake: '09:00', sleep: '13:00' })
    const plan = buildDay(
      { date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 }, commitments: [commitment] },
      NOW,
    )
    expect(at('training', plan)).toEqual(['11:00-12:30'])
  })

  it('merges with an anchor it runs into', () => {
    const p = profile({ anchors: [anchor({ start: '11:00', end: '17:00' })] })
    const plan = buildDay(
      {
        date: MONDAY,
        profile: p,
        training: { label: 'Push', minutes: 60 },
        commitments: [commitment],
      },
      NOW,
    )
    /* 07:00-10:00 and 17:00-23:00 are the free time; the evening is bigger. */
    expect(at('training', plan)).toEqual(['17:00-18:00'])
  })

  it('can leave a day with no room, and says so', () => {
    const plan = day({
      commitments: [{ ...commitment, start: '07:00', end: '23:00' }],
      training: { label: 'Push', minutes: 60 },
    })
    expect(plan.unplaced).toEqual(['training'])
  })

  it('is ignored when its times make no sense', () => {
    const plan = day({ commitments: [{ ...commitment, start: '11:00', end: '10:00' }] })
    expect(plan.slots).toEqual([])
  })
})

describe('the intimate activity module, when it is on', () => {
  const intimacy = { label: 'Time together', minutes: 30 }

  it('takes what is left, and nothing else has to move', () => {
    const p = profile({ anchors: [anchor()] })
    const plan = buildDay(
      {
        date: MONDAY,
        profile: p,
        training: { label: 'Push', minutes: 90 },
        plate: { label: 'Chicken creole' },
        challenge: { label: 'Day 4' },
        intimacy,
      },
      NOW,
    )
    /**
     * Free time is 07:00-09:00 and 17:00-23:00. The session takes the larger,
     * 17:00-18:30. The plate then goes to whichever free half hour is nearest
     * one o'clock, and that is 08:30 before work rather than 18:30 after the
     * session, which is four and a half hours away against five and a half.
     *
     * The assertion is that none of it moves because the module is on.
     */
    expect(at('training', plan)).toEqual(['17:00-18:30'])
    expect(at('meal', plan)).toEqual(['08:30-09:00'])
    expect(plan.unplaced).toEqual([])
    expect(at('intimacy', plan)).toHaveLength(1)
  })

  it('is the one that goes without, when the day is nearly full', () => {
    // Placed last on purpose: everything the rest of the app is actually about
    // has already taken the room it needs.
    const p = profile({ wake: '18:00', sleep: '19:45' })
    const plan = buildDay(
      { date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 }, intimacy },
      NOW,
    )
    expect(at('training', plan)).toEqual(['18:00-19:30'])
    expect(plan.unplaced).toEqual(['intimacy'])
  })

  it('is absent when the module is off', () => {
    expect(at('intimacy', day({ intimacy: null }))).toEqual([])
    expect(at('intimacy', day({}))).toEqual([])
  })

  it('carries the neutral label it was given and no reference', () => {
    // A day plan is a thing people leave open on a kitchen table. Nothing on it
    // needs to announce this, and there is no record to point at.
    const slot = day({ intimacy }).slots.find((s) => s.kind === 'intimacy')
    expect(slot?.label).toBe('Time together')
    expect(slot?.ref).toBeUndefined()
  })
})

describe('the shape of the output', () => {
  it('is sorted by the time of day', () => {
    const plan = day({
      profile: profile({ anchors: [anchor({ start: '12:00', end: '13:00', label: 'school run' })] }),
      training: { label: 'Push', minutes: 60 },
      plate: { label: 'Chicken creole' },
      challenge: { label: 'Day 4' },
    })
    const starts = plan.slots.map((s) => s.start)
    expect([...starts].sort()).toEqual(starts)
  })

  it('never invents an activity to fill the space', () => {
    // A schedule with no white space is a schedule nobody follows. There is no
    // rest slot in this product because an empty hour is not an activity.
    const plan = day({ training: { label: 'Push', minutes: 30 } })
    expect(plan.slots).toHaveLength(1)
    expect(plan.slots.every((s) => s.kind !== ('rest' as never))).toBe(true)
  })

  it('is the same day every time it is asked', () => {
    const input = {
      date: MONDAY,
      profile: profile({ anchors: [anchor()] }),
      training: { label: 'Push', minutes: 90 },
      plate: { label: 'Chicken creole' },
      challenge: { label: 'Day 4' },
    }
    expect(buildDay(input, NOW)).toEqual(buildDay(input, NOW))
  })

  it('survives a date it cannot read, with the anchors left out', () => {
    const plan = buildDay(
      { date: 'tomorrow', profile: profile({ anchors: [anchor()] }), training: { label: 'Push', minutes: 60 } },
      NOW,
    )
    expect(at('anchor', plan)).toEqual([])
    /* The window is still a window, so the session still has somewhere to go. */
    expect(at('training', plan)).toEqual(['07:00-08:00'])
  })
})

describe('freeMinutes', () => {
  it('is the whole waking day when nothing is on it', () => {
    const plan = day()
    expect(freeMinutes(plan, profile())).toBe(16 * 60)
  })

  it('takes off what the day is carrying', () => {
    const p = profile({ anchors: [anchor()] })
    const plan = buildDay({ date: MONDAY, profile: p, training: { label: 'Push', minutes: 90 } }, NOW)
    expect(freeMinutes(plan, p)).toBe(16 * 60 - 8 * 60 - 90)
  })

  it('does not count an anchor twice where it overhangs the window', () => {
    const p = profile({ anchors: [anchor({ start: '05:00', end: '10:00' })] })
    const plan = buildDay({ date: MONDAY, profile: p }, NOW)
    /* 07:00 to 10:00 is inside the window; the two hours before the alarm are
       not free time being spent, they are outside the day. */
    expect(freeMinutes(plan, p)).toBe(16 * 60 - 3 * 60)
  })
})

describe('formatMinutes', () => {
  it('drops the half nobody needs to read', () => {
    // "1h 0m" on screen is the tell that nobody checked the boundaries.
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatMinutes(16 * 60)).toBe('16h')
  })

  it('does not print a negative day', () => {
    expect(formatMinutes(-30)).toBe('0m')
  })
})
