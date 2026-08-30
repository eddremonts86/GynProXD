import { describe, expect, it } from 'vitest'
import { summariseReach, windowStart } from './gym-reach'
import type { GymMessage } from './messages'

const GYM = 'Hangar Atlético'

const msg = (over: Partial<GymMessage>): GymMessage => ({
  id: 'm1',
  gym: GYM,
  authorId: 'operator-1',
  createdAt: '2026-08-20T10:00:00.000Z',
  kind: 'announcement',
  title: 'Hello',
  audience: 'all',
  readBy: [],
  rsvp: {},
  saved: [],
  ...over,
})

describe('the window', () => {
  it('reaches back the given number of days', () => {
    expect(windowStart('2026-08-30', 30)).toBe('2026-07-31')
  })
})

describe('what the gym got back', () => {
  it('counts each member once however many messages they opened', () => {
    const messages = [
      msg({ id: 'a', readBy: ['p1', 'p2'] }),
      msg({ id: 'b', readBy: ['p2', 'p3'] }),
    ]
    expect(summariseReach(messages, GYM, '2026-07-31').membersReached).toBe(3)
  })

  it('counts yes answers and ignores the declines', () => {
    const event = msg({
      id: 'e',
      kind: 'event',
      event: { date: '2026-09-02' },
      rsvp: { p1: 'yes', p2: 'no', p3: 'yes' },
    })
    expect(summariseReach([event], GYM, '2026-07-31').going).toBe(2)
  })

  it('adds up saved offers and joined challenges', () => {
    const messages = [
      msg({ id: 'o', kind: 'offer', saved: ['p1', 'p2'] }),
      msg({ id: 'c', kind: 'challenge', joined: ['p1'] }),
    ]
    const summary = summariseReach(messages, GYM, '2026-07-31')
    expect(summary.offersSaved).toBe(2)
    expect(summary.challengesJoined).toBe(1)
  })

  it('leaves out anything published before the window', () => {
    const old = msg({ id: 'old', createdAt: '2026-06-01T10:00:00.000Z', readBy: ['p9'] })
    const summary = summariseReach([old], GYM, '2026-07-31')
    expect(summary.published).toBe(0)
    expect(summary.membersReached).toBe(0)
  })

  it('leaves out another gym entirely', () => {
    const other = msg({ id: 'x', gym: 'Somewhere Else', readBy: ['p1'] })
    expect(summariseReach([other], GYM, '2026-07-31').published).toBe(0)
  })
})
