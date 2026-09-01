import { describe, expect, it } from 'vitest'
import { REACH_WINDOW_DAYS, REACH_WINDOWS, reachCsv, summariseReach, windowDays, windowLabel, windowStart } from './gym-reach'
import type { ReachWindowKey } from './gym-reach'
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

describe('the whole history', () => {
  const msg = (day: string, over: Partial<GymMessage> = {}): GymMessage => ({
    id: day,
    gym: 'Hierro Viejo',
    authorId: 'op-1',
    createdAt: `${day}T09:00:00.000Z`,
    kind: 'announcement',
    title: 'Notice',
    audience: 'all',
    readBy: [],
    rsvp: {},
    saved: [],
    ...over,
  })
  const messages = [msg('2026-08-30'), msg('2026-06-01'), msg('2025-02-14')]

  it('counts everything when there is no window', () => {
    expect(summariseReach(messages, 'Hierro Viejo', null).published).toBe(3)
  })

  it('still respects a window when given one', () => {
    expect(summariseReach(messages, 'Hierro Viejo', '2026-08-01').published).toBe(1)
  })

  it('is still one gym only', () => {
    expect(summariseReach([...messages, msg('2026-08-30', { gym: 'Casa Ronda' })], 'Casa Ronda', null)
      .published).toBe(1)
  })
})

describe('reachCsv', () => {
  const base: GymMessage = {
    id: 'm1',
    gym: 'Hierro Viejo',
    authorId: 'op-1',
    createdAt: '2026-08-30T09:00:00.000Z',
    kind: 'event',
    title: 'Saturday clinic',
    audience: 'all',
    readBy: ['a', 'b'],
    rsvp: { a: 'yes', b: 'no' },
    saved: [],
  }

  it('writes a header and one row a message', () => {
    const csv = reachCsv([base], 'Hierro Viejo', null).split('\n')
    expect(csv[0]).toBe('date,kind,title,audience,read,going,declined,saved,joined')
    expect(csv[1]).toBe('2026-08-30,event,Saturday clinic,everyone,2,1,1,0,0')
    expect(csv).toHaveLength(2)
  })

  it('quotes a title that would otherwise break the row', () => {
    // A gym's own title is the field most likely to hold a comma, and a broken
    // CSV is a spreadsheet with the columns shifted rather than an error.
    const csv = reachCsv([{ ...base, title: 'Clinic, and a "talk"' }], 'Hierro Viejo', null)
    expect(csv.split('\n')[1]).toContain('"Clinic, and a ""talk"""')
  })

  it('names the audience rather than dumping ids', () => {
    const csv = reachCsv([{ ...base, audience: ['p1', 'p2', 'p3'] }], 'Hierro Viejo', null)
    expect(csv.split('\n')[1]).toContain('3 named')
  })

  it('is a header and nothing else when the gym has published nothing', () => {
    expect(reachCsv([], 'Hierro Viejo', null).split('\n')).toHaveLength(1)
  })
})

describe('windowDays', () => {
  it('gives null for everything, and a number for the rest', () => {
    // `?.days ?? REACH_WINDOW_DAYS` cannot tell a legitimate null from a key it
    // did not find, so it turned Everything back into 30 days — the selector
    // changed, every label changed, and the figures did not move.
    expect(windowDays('all')).toBeNull()
    expect(windowDays('d30')).toBe(30)
    expect(windowDays('d90')).toBe(90)
    expect(windowDays('y1')).toBe(365)
  })

  it('falls back to the default window for a key it does not know', () => {
    expect(windowDays('nonsense' as ReachWindowKey)).toBe(REACH_WINDOW_DAYS)
  })

  it('labels every key it accepts', () => {
    for (const w of REACH_WINDOWS) expect(windowLabel(w.key)).toBe(w.label)
  })
})
