import { describe, expect, it } from 'vitest'
import { decide, GRACE_DAYS, type Entitlement } from './entitlement'

/**
 * The device's own answer to "has this account paid", and the grace window that
 * makes it usable offline.
 *
 * Every case here is about one distinction, because getting it wrong is the
 * only way this file can do damage: the difference between "the server told us
 * the subscription is over" and "we have not been able to ask". The first is an
 * answer. The second is a gap, and a gap must not become an accusation on the
 * screen of somebody whose payment went through.
 */
const DAY = 86_400_000
const NOW = Date.parse('2026-09-03T12:00:00.000Z')

/** What PocketBase sends: a space where ISO wants a T. */
const pb = (ms: number) => new Date(ms).toISOString().replace('T', ' ')

const cache = (untilMs: number | null, checkedMs: number): Entitlement => ({
  proUntil: untilMs === null ? null : pb(untilMs),
  checkedAt: new Date(checkedMs).toISOString(),
})

describe('decide', () => {
  it('is active while the date is ahead', () => {
    const state = decide(cache(NOW + 20 * DAY, NOW - DAY), NOW)
    expect(state).toMatchObject({ pro: true, reason: 'active' })
  })

  it('reads the format the server actually sends', () => {
    // The space instead of a T is outside the date grammar `Date.parse` is
    // specified for. It works in V8 and it is not going to be relied on.
    expect(decide({ proUntil: '2026-10-03 00:00:00.000Z', checkedAt: new Date(NOW).toISOString() }, NOW).pro).toBe(true)
    expect(decide({ proUntil: '2026-10-03T00:00:00.000Z', checkedAt: new Date(NOW).toISOString() }, NOW).pro).toBe(true)
  })

  it('knows nothing when there is nothing cached', () => {
    // A new device, or a private window. Not the same as unpaid, and the copy
    // that reads this reason says so.
    expect(decide(null, NOW)).toEqual({ pro: false, reason: 'unknown', until: null })
  })

  it('calls an account that has never paid lapsed, not unknown', () => {
    // We asked and the server answered null. That is knowledge.
    expect(decide(cache(null, NOW - DAY), NOW)).toEqual({
      pro: false,
      reason: 'lapsed',
      until: null,
    })
  })
})

describe('an account that administers the platform', () => {
  it('is Pro, whatever the date says', () => {
    // The rule: whoever runs this thing has to be able to open every screen in
    // it, or they are debugging a product they cannot see.
    const state = decide({ proUntil: null, checkedAt: new Date(NOW).toISOString(), admin: true }, NOW)
    expect(state).toEqual({ pro: true, reason: 'admin', until: null })
  })

  it('stays Pro with a subscription that lapsed years ago', () => {
    const stale = { proUntil: pb(NOW - 400 * DAY), checkedAt: new Date(NOW - 400 * DAY).toISOString(), admin: true }
    expect(decide(stale, NOW).pro).toBe(true)
  })

  it('is not read from an absent flag', () => {
    // Absent is not admin. The direction to be wrong in is a member being
    // refused something, not somebody getting the run of the product.
    expect(decide({ proUntil: null, checkedAt: new Date(NOW).toISOString() }, NOW).pro).toBe(false)
  })
})

describe('the grace window', () => {
  it('keeps a subscription that was live the last time we could ask', () => {
    // Paid up to yesterday, last checked a week before that, and since then the
    // device has not managed to reach the server. A renewal has almost
    // certainly happened and we cannot see it.
    const state = decide(cache(NOW - DAY, NOW - 8 * DAY), NOW)
    expect(state).toMatchObject({ pro: true, reason: 'grace' })
  })

  it('reports the date it is being generous about', () => {
    const until = NOW - DAY
    expect(decide(cache(until, NOW - 8 * DAY), NOW).until).toBe(pb(until))
  })

  it('does NOT cover a subscription the server said was already over', () => {
    // The distinction the whole file exists for. Here the date had already
    // passed when we last got an answer, so the server told us it was finished.
    // There is nothing to be generous about, and a grace window that covered
    // this would hand every cancelled account another fortnight.
    const state = decide(cache(NOW - 3 * DAY, NOW - DAY), NOW)
    expect(state).toMatchObject({ pro: false, reason: 'lapsed' })
  })

  it('runs out a fortnight past the date, however long the device stayed away', () => {
    const liveAtCheck = (untilMs: number) => cache(untilMs, untilMs - 30 * DAY)
    expect(decide(liveAtCheck(NOW - (GRACE_DAYS - 1) * DAY), NOW).pro).toBe(true)
    expect(decide(liveAtCheck(NOW - GRACE_DAYS * DAY), NOW).pro).toBe(true)
    expect(decide(liveAtCheck(NOW - (GRACE_DAYS + 1) * DAY), NOW).pro).toBe(false)
    /* A device offline for a year does not get a year of grace. */
    expect(decide(liveAtCheck(NOW - 365 * DAY), NOW).pro).toBe(false)
  })

  it('ends on the second the subscription does, before grace applies', () => {
    const at = NOW
    expect(decide(cache(at + 1, NOW - DAY), NOW).reason).toBe('active')
    /* Exactly now: the date is no longer ahead, so it falls to the grace
       branch, which still covers it because it was live when we last asked. */
    expect(decide(cache(at, NOW - DAY), NOW).reason).toBe('grace')
  })
})

describe('rubbish in the cache', () => {
  it('is treated as lapsed rather than trusted', () => {
    // localStorage is writable by anybody and this is not a security boundary,
    // but an unparseable date must not resolve to "paid" by accident.
    for (const proUntil of ['', 'soon', '[object Object]', 'next tuesday']) {
      expect(decide({ proUntil, checkedAt: new Date(NOW).toISOString() }, NOW).pro).toBe(false)
    }
  })

  it('refuses grace when it cannot tell when we last asked', () => {
    // Without a readable checkedAt there is no way to know whether the server
    // ever said this account was live, so the generous branch is unavailable.
    expect(decide({ proUntil: pb(NOW - DAY), checkedAt: 'whenever' }, NOW)).toMatchObject({
      pro: false,
      reason: 'lapsed',
    })
  })
})
