import { describe, expect, it } from 'vitest'
import {
  audienceWithin,
  HOUSE_GYM,
  inboxFor,
  isAddressedTo,
  splitAudience,
  unreadSenders,
  makeOfferCode,
  offerPayload,
  sentBy,
  unreadCount,
  type GymMessage,
} from './messages'

const base = {
  authorId: 'gym-1',
  createdAt: '2026-08-26T10:00:00.000Z',
  kind: 'announcement' as const,
  title: 'Hello',
  readBy: [],
  rsvp: {},
  saved: [],
}

const msg = (over: Partial<GymMessage>): GymMessage => ({
  id: 'm1',
  gym: 'Forge & Flow',
  audience: 'all',
  ...base,
  ...over,
})

describe('addressing', () => {
  const ana = { id: 'p-ana', gym: 'Forge & Flow' }

  it('reaches every member of the gym with audience all', () => {
    expect(isAddressedTo(msg({}), ana)).toBe(true)
  })

  it('matches the gym case-insensitively', () => {
    expect(isAddressedTo(msg({ gym: 'forge & flow' }), ana)).toBe(true)
  })

  it('never crosses gyms', () => {
    expect(isAddressedTo(msg({}), { id: 'p-x', gym: 'Iron Barn' })).toBe(false)
    expect(isAddressedTo(msg({}), { id: 'p-x' })).toBe(false)
  })

  it('respects explicit audiences', () => {
    const targeted = msg({ audience: ['p-ana'] })
    expect(isAddressedTo(targeted, ana)).toBe(true)
    expect(isAddressedTo(targeted, { id: 'p-bo', gym: 'Forge & Flow' })).toBe(false)
  })
})

describe('inbox and counters', () => {
  const ana = { id: 'p-ana', gym: 'Forge & Flow' }
  const messages: GymMessage[] = [
    msg({ id: 'old', createdAt: '2026-08-20T09:00:00.000Z', readBy: ['p-ana'] }),
    msg({ id: 'new', createdAt: '2026-08-26T09:00:00.000Z' }),
    msg({ id: 'other-gym', gym: 'Iron Barn' }),
    msg({ id: 'not-me', audience: ['p-bo'] }),
  ]

  it('sorts the inbox newest first and filters strictly', () => {
    expect(inboxFor(messages, ana).map((m) => m.id)).toEqual(['new', 'old'])
  })

  it('counts only unread, addressed messages', () => {
    expect(unreadCount(messages, ana)).toBe(1)
  })

  it('shows the gym its own sent list across audiences', () => {
    expect(sentBy(messages, 'forge & flow').map((m) => m.id)).toEqual(['not-me', 'new', 'old'])
  })
})

describe('offer codes', () => {
  it('formats as XXXX-XXXX from the safe alphabet', () => {
    const code = makeOfferCode(() => 0.42)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  })

  it('payload carries code and gym', () => {
    expect(offerPayload('AB2D-EF3H', 'Forge & Flow')).toBe('enforma:offer:AB2D-EF3H:Forge & Flow')
  })
})

describe('author exclusion', () => {
  it('a gym profile never receives its own broadcast', () => {
    const own = msg({ audience: 'all' })
    expect(isAddressedTo(own, { id: 'gym-1', gym: 'Forge & Flow' })).toBe(false)
  })
})

describe('banners', () => {
  const ana = { id: 'p-ana', gym: 'Forge & Flow' }
  const t0 = new Date('2026-08-26T10:00:00.000Z').getTime()

  it('shows inside the window, hides after it', async () => {
    const { activeBanners } = await import('./messages')
    const banner = msg({ banner: { minutes: 5 } })
    expect(activeBanners([banner], ana, t0 + 4 * 60_000)).toHaveLength(1)
    expect(activeBanners([banner], ana, t0 + 6 * 60_000)).toHaveLength(0)
  })

  it('never shows to another gym, the author, or after dismissal', async () => {
    const { activeBanners } = await import('./messages')
    const banner = msg({ banner: { minutes: 5 } })
    expect(activeBanners([banner], { id: 'p-x', gym: 'Iron Barn' }, t0)).toHaveLength(0)
    expect(activeBanners([banner], { id: 'gym-1', gym: 'Forge & Flow' }, t0)).toHaveLength(0)
    const dismissed = msg({ banner: { minutes: 5 }, bannerDismissedBy: ['p-ana'] })
    expect(activeBanners([dismissed], ana, t0)).toHaveLength(0)
  })

  it('respects personal targeting', async () => {
    const { activeBanners } = await import('./messages')
    const targeted = msg({ banner: { minutes: 5 }, audience: ['p-ana'] })
    expect(activeBanners([targeted], ana, t0)).toHaveLength(1)
    expect(activeBanners([targeted], { id: 'p-bo', gym: 'Forge & Flow' }, t0)).toHaveLength(0)
  })

  it('messages without banner never surface as banners', async () => {
    const { activeBanners } = await import('./messages')
    expect(activeBanners([msg({})], ana, t0)).toHaveLength(0)
  })
})

/**
 * The separation that this whole feature exists for.
 *
 * A member of a real gym must never receive something addressed to the people
 * no gym has claimed. Not because it would be embarrassing — because it is a
 * competitor's offer landing on a paying customer, and the gym paying us for
 * reach is the one who would find out.
 *
 * Every case here is written from the receiver's side. The sender's intent is
 * not evidence; who actually gets it is.
 */
describe('message scope', () => {
  const base = {
    id: 'm1',
    gym: HOUSE_GYM,
    authorId: 'admin-1',
    createdAt: '2026-09-01T08:00:00.000Z',
    kind: 'announcement' as const,
    title: 'Anything',
    audience: 'all' as const,
    readBy: [],
    rsvp: {},
    saved: [],
  }
  const loner = { id: 'p-loner' }
  const member = { id: 'p-member', gym: 'Hierro Viejo' }

  it('reaches nobody with a gym when it is for the unaffiliated', () => {
    const m = { ...base, scope: 'unaffiliated' as const }
    expect(isAddressedTo(m, loner)).toBe(true)
    expect(isAddressedTo(m, member)).toBe(false)
  })

  it('stops reaching somebody the moment they join a gym', () => {
    // No list to maintain and nothing to un-send: the audience is a question
    // asked at read time, not a set captured at publish time.
    const m = { ...base, scope: 'unaffiliated' as const }
    expect(isAddressedTo(m, { id: 'p-x' })).toBe(true)
    expect(isAddressedTo(m, { id: 'p-x', gym: 'Hierro Viejo' })).toBe(false)
  })

  it('reaches both when it is for everyone', () => {
    const m = { ...base, scope: 'everyone' as const }
    expect(isAddressedTo(m, loner)).toBe(true)
    expect(isAddressedTo(m, member)).toBe(true)
  })

  it('treats a whitespace-only gym as no gym', () => {
    const m = { ...base, scope: 'unaffiliated' as const }
    expect(isAddressedTo(m, { id: 'p-y', gym: '   ' })).toBe(true)
  })

  it('leaves a message with no scope behaving exactly as before', () => {
    // Everything already sent, and everything a gym will ever send.
    const m = { ...base, gym: 'Hierro Viejo', authorId: 'op-1' }
    expect(isAddressedTo(m, member)).toBe(true)
    expect(isAddressedTo(m, loner)).toBe(false)
    expect(isAddressedTo(m, { id: 'p-z', gym: 'Other Gym' })).toBe(false)
  })

  it('does not leak through a device-local gym that shares the house name', () => {
    // Nothing stops somebody typing "enForma" into their own gym catalogue.
    // It is harmless because the house never publishes with `members` scope,
    // and `members` is the only scope that looks at the name at all.
    const m = { ...base, scope: 'unaffiliated' as const }
    expect(isAddressedTo(m, { id: 'p-w', gym: HOUSE_GYM })).toBe(false)
  })

  it('still narrows to an explicit list inside a scope', () => {
    const m = { ...base, scope: 'everyone' as const, audience: ['p-member'] }
    expect(isAddressedTo(m, member)).toBe(true)
    expect(isAddressedTo(m, loner)).toBe(false)
  })

  it('never delivers to the author, whatever the scope', () => {
    const m = { ...base, scope: 'everyone' as const }
    expect(isAddressedTo(m, { id: 'admin-1' })).toBe(false)
  })
})

describe('splitAudience', () => {
  it('counts who already trains somewhere, so the number can be read out', () => {
    const split = splitAudience(
      [
        { id: 'a' },
        { id: 'b', gym: 'Hierro Viejo' },
        { id: 'c', gym: '  ' },
        { id: 'd', gym: 'Casa Ronda' },
        { id: 'me' },
      ],
      'me',
    )
    expect(split).toEqual({ total: 4, unaffiliated: 2, affiliated: 2 })
  })

  it('is empty rather than wrong when the author is alone', () => {
    expect(splitAudience([{ id: 'me' }], 'me')).toEqual({
      total: 0,
      unaffiliated: 0,
      affiliated: 0,
    })
  })
})

describe('audienceWithin', () => {
  const directory = [
    { id: 'me' },
    { id: 'a' },
    { id: 'b', gym: 'Hierro Viejo' },
    { id: 'c', gym: 'Casa Ronda' },
    { id: 'd', gym: '  ' },
  ]
  const ids = (scope: Parameters<typeof audienceWithin>[2], gym = 'Hierro Viejo') =>
    audienceWithin(directory, gym, scope, 'me').map((p) => p.id)

  it('narrows to the unclaimed', () => {
    expect(ids('unaffiliated')).toEqual(['a', 'd'])
  })

  it('opens to all but the author', () => {
    expect(ids('everyone')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is one gym for a gym', () => {
    expect(ids('members')).toEqual(['b'])
    expect(ids(undefined)).toEqual(['b'])
  })

  it('gives the same answer the confirmation quotes', () => {
    // The bug this exists to prevent: narrowing delivered to five and said
    // ten, because the count came from a list built under the old scope.
    const split = splitAudience(directory, 'me')
    expect(ids('unaffiliated').length).toBe(split.unaffiliated)
    expect(ids('everyone').length).toBe(split.total)
  })
})

describe('unreadSenders', () => {
  const base = {
    authorId: 'op-1',
    createdAt: '2026-09-01T08:00:00.000Z',
    kind: 'announcement' as const,
    audience: 'all' as const,
    rsvp: {},
    saved: [],
  }
  const member = { id: 'p1', gym: 'Hierro Viejo' }

  it('names the gym for a gym message and the house for a platform one', () => {
    const messages = [
      { ...base, id: 'a', gym: 'Hierro Viejo', title: 'Closed Monday', readBy: [] },
      { ...base, id: 'b', gym: HOUSE_GYM, scope: 'everyone' as const, title: 'Sync moving', readBy: [] },
    ]
    expect(unreadSenders(messages, member)).toEqual(['Hierro Viejo', HOUSE_GYM])
  })

  it('ignores what has been read', () => {
    const messages = [
      { ...base, id: 'a', gym: 'Hierro Viejo', title: 'Closed', readBy: ['p1'] },
      { ...base, id: 'b', gym: HOUSE_GYM, scope: 'everyone' as const, title: 'Sync', readBy: [] },
    ]
    expect(unreadSenders(messages, member)).toEqual([HOUSE_GYM])
  })

  it('says the house, not a gym, to somebody who has none', () => {
    // The wording this replaces told them they had "a message from your gym".
    const messages = [
      { ...base, id: 'a', gym: 'Hierro Viejo', title: 'Not for them', readBy: [] },
      { ...base, id: 'b', gym: HOUSE_GYM, scope: 'unaffiliated' as const, title: 'For them', readBy: [] },
    ]
    expect(unreadSenders(messages, { id: 'p2' })).toEqual([HOUSE_GYM])
  })

  it('does not repeat a sender', () => {
    const messages = [
      { ...base, id: 'a', gym: 'hierro viejo', title: 'One', readBy: [] },
      { ...base, id: 'b', gym: 'Hierro Viejo', title: 'Two', readBy: [] },
    ]
    expect(unreadSenders(messages, member)).toEqual(['hierro viejo'])
  })
})
