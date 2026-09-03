import { describe, expect, it } from 'vitest'
import { commitmentsOn, EVENT_MINUTES } from './local-events'
import type { GymMessage } from './messages'

/**
 * What is on locally, and the one rule that decides whether it touches the day.
 *
 * Only an event somebody said yes to blocks time. An RSVP is a commitment they
 * made; an invitation is not one, and a planner that treated the second as the
 * first would empty a Saturday because a gym sent something.
 */
const DATE = '2026-09-12'

const message = (over: Partial<GymMessage> = {}): GymMessage =>
  ({
    id: 'm1',
    gym: 'Hierro Viejo',
    authorId: 'op1',
    createdAt: '2026-09-01T10:00:00.000Z',
    kind: 'event',
    title: 'Saturday class',
    audience: 'all',
    readBy: [],
    rsvp: {},
    saved: [],
    event: { date: DATE, time: '10:00', place: 'The big room' },
    ...over,
  }) as GymMessage

const me = { id: 'p1', gym: 'Hierro Viejo' }

describe('commitmentsOn', () => {
  it('takes an event this member said yes to', () => {
    const yes = message({ rsvp: { p1: 'yes' } })
    expect(commitmentsOn([yes], me, DATE)).toEqual([
      { label: 'Saturday class', start: '10:00', end: '11:00', ref: 'm1' },
    ])
  })

  it('leaves an unanswered invitation alone', () => {
    // The rule this file exists for. An invitation is not a commitment, and the
    // inbox is where answering one belongs.
    expect(commitmentsOn([message()], me, DATE)).toEqual([])
  })

  it('leaves one they declined alone', () => {
    expect(commitmentsOn([message({ rsvp: { p1: 'no' } })], me, DATE)).toEqual([])
  })

  it('does not read somebody else answer as this member', () => {
    // `rsvp` is keyed by profile id, and two profiles share a device in this
    // product by design.
    expect(commitmentsOn([message({ rsvp: { p2: 'yes' } })], me, DATE)).toEqual([])
  })

  it('only takes the ones on that date', () => {
    const yes = message({ rsvp: { p1: 'yes' } })
    expect(commitmentsOn([yes], me, '2026-09-13')).toEqual([])
  })

  it('ignores the kinds that are not events', () => {
    for (const kind of ['announcement', 'menu', 'offer'] as const) {
      expect(commitmentsOn([message({ kind, rsvp: { p1: 'yes' } })], me, DATE)).toEqual([])
    }
  })

  it('skips an event with no time on it', () => {
    // The inbox still shows it. The day cannot say when, and inventing an hour
    // for something somebody has committed to is the worst way to guess.
    const noTime = message({ rsvp: { p1: 'yes' }, event: { date: DATE } })
    expect(commitmentsOn([noTime], me, DATE)).toEqual([])
  })

  it('skips a time that is not one', () => {
    const bad = message({ rsvp: { p1: 'yes' }, event: { date: DATE, time: 'lunchtime' } })
    expect(commitmentsOn([bad], me, DATE)).toEqual([])
  })

  it('runs for an hour, because the bus carries no end', () => {
    expect(EVENT_MINUTES).toBe(60)
    const late = message({ rsvp: { p1: 'yes' }, event: { date: DATE, time: '19:30' } })
    expect(commitmentsOn([late], me, DATE)[0].end).toBe('20:30')
  })

  it('does not run past the end of the day', () => {
    const nearMidnight = message({ rsvp: { p1: 'yes' }, event: { date: DATE, time: '23:30' } })
    expect(commitmentsOn([nearMidnight], me, DATE)[0].end).toBe('23:59')
  })

  it('obeys the audience rules rather than having its own', () => {
    // `inboxFor` decides what reaches somebody, and this uses it. An event
    // addressed to a list this member is not on must not appear on their day
    // just because it is in the device's bus.
    const notMine = message({ rsvp: { p1: 'yes' }, audience: ['p2'] })
    expect(commitmentsOn([notMine], me, DATE)).toEqual([])

    const anotherGym = message({ rsvp: { p1: 'yes' }, gym: 'Somewhere Else' })
    expect(commitmentsOn([anotherGym], me, DATE)).toEqual([])
  })

  it('is in the order the day runs', () => {
    const evening = message({ id: 'm2', rsvp: { p1: 'yes' }, event: { date: DATE, time: '19:00' } })
    const morning = message({ id: 'm3', rsvp: { p1: 'yes' }, event: { date: DATE, time: '09:00' } })
    expect(commitmentsOn([evening, morning], me, DATE).map((c) => c.start)).toEqual([
      '09:00',
      '19:00',
    ])
  })

  it('is empty for a member with no gym, on a message scoped to members', () => {
    expect(commitmentsOn([message({ rsvp: { p1: 'yes' } })], { id: 'p1' }, DATE)).toEqual([])
  })

  it('reaches somebody with no gym through the open door', () => {
    // The scope that makes "what is on near me" mean anything for a member who
    // trains alone: a Plus gym aiming an event at its area. Same audience
    // rules, applied by the same function.
    const openDoor = message({ rsvp: { p1: 'yes' }, scope: 'open-door' })
    expect(commitmentsOn([openDoor], { id: 'p1' }, DATE)).toHaveLength(1)
  })

  it('and not to somebody who shut that door', () => {
    const openDoor = message({ rsvp: { p1: 'yes' }, scope: 'open-door' })
    expect(commitmentsOn([openDoor], { id: 'p1', openToGyms: false }, DATE)).toEqual([])
  })
})
