import { describe, expect, it } from 'vitest'
import {
  activeBanners,
  audienceWithin,
  HOUSE_GYM,
  isMessageScope,
  isQueued,
  MESSAGE_SCOPES,
  previewOf,
  senderOf,
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

describe('removing a message from one inbox', () => {
  const message = {
    id: 'm1',
    gym: 'Hierro Viejo',
    authorId: 'op-1',
    createdAt: '2026-09-01T08:00:00.000Z',
    kind: 'announcement' as const,
    title: 'Closed on Monday',
    audience: 'all' as const,
    readBy: [],
    rsvp: {},
    saved: [],
  }
  const ana = { id: 'p1', gym: 'Hierro Viejo' }
  const beñat = { id: 'p2', gym: 'Hierro Viejo' }

  it('hides it from the profile that removed it and nobody else', () => {
    const removed = { ...message, deletedBy: ['p1'] }
    expect(isAddressedTo(removed, ana)).toBe(false)
    expect(isAddressedTo(removed, beñat)).toBe(true)
  })

  it('takes it out of the badge and the banner too, not just the list', () => {
    // The check lives in `isAddressedTo`, so every reader of it agrees. A
    // message removed from the list while still counted in the badge would
    // leave an unread count nothing could clear.
    const removed = { ...message, banner: { minutes: 60 }, deletedBy: ['p1'] }
    expect(inboxFor([removed], ana)).toEqual([])
    expect(unreadCount([removed], ana)).toBe(0)
    expect(unreadSenders([removed], ana)).toEqual([])
    expect(activeBanners([removed], ana, Date.parse(message.createdAt) + 1000)).toEqual([])
  })
})

describe('previewOf', () => {
  const base = {
    id: 'm',
    gym: 'Hierro Viejo',
    authorId: 'op-1',
    createdAt: '2026-09-01T08:00:00.000Z',
    title: 'T',
    audience: 'all' as const,
    readBy: [],
    rsvp: {},
    saved: [],
  }

  it('takes the body as plain text, markup and all', () => {
    const m = {
      ...base,
      kind: 'announcement' as const,
      body: '<p>The <strong>lifting room</strong> is closed.</p><ul><li>Monday</li></ul>',
    }
    expect(previewOf(m)).toBe('The lifting room is closed. Monday')
  })

  it('collapses the whitespace a multi-paragraph body brings with it', () => {
    const m = { ...base, kind: 'announcement' as const, body: 'One line.\n\n\nAnother.' }
    expect(previewOf(m)).toBe('One line. Another.')
  })

  it('falls back to what each template is actually about', () => {
    // Most templates are structured, not prose. Without this every offer and
    // every product shows an empty row beside a full one.
    expect(previewOf({ ...base, kind: 'offer', offer: { discount: '20% off PT', code: 'X' } }))
      .toBe('20% off PT')
    expect(previewOf({ ...base, kind: 'product', product: { name: 'Lifting belt', price: '39 EUR' } }))
      .toBe('Lifting belt — 39 EUR')
    expect(previewOf({ ...base, kind: 'event', event: { date: '2026-09-14', time: '19:00', place: 'Sala 2' } }))
      .toBe('2026-09-14 · 19:00 · Sala 2')
    expect(previewOf({
      ...base,
      kind: 'menu',
      menu: { courses: [{ name: 'Lunch', dishes: ['Lentejas', 'Merluza'] }] },
    })).toBe('Lentejas, Merluza')
  })

  it('prefers the body over the fallback when there is one', () => {
    const m = {
      ...base,
      kind: 'offer' as const,
      body: 'Members only, at the desk.',
      offer: { discount: '20% off PT', code: 'X' },
    }
    expect(previewOf(m)).toBe('Members only, at the desk.')
  })

  it('is empty rather than wrong when there is nothing to show', () => {
    expect(previewOf({ ...base, kind: 'announcement' })).toBe('')
  })
})

describe('senderOf', () => {
  const base = {
    id: 'm',
    gym: 'Hierro Viejo',
    authorId: 'op-1',
    createdAt: '2026-09-01T08:00:00.000Z',
    kind: 'announcement' as const,
    title: 'T',
    audience: 'all' as const,
    readBy: [],
    rsvp: {},
    saved: [],
  }

  it('names the gym for a gym message and the house for a platform one', () => {
    expect(senderOf(base)).toBe('Hierro Viejo')
    expect(senderOf({ ...base, gym: HOUSE_GYM, scope: 'everyone' })).toBe(HOUSE_GYM)
    // Even if the row's gym field says otherwise: the scope is the identity.
    expect(senderOf({ ...base, scope: 'unaffiliated' })).toBe(HOUSE_GYM)
  })
})

/**
 * The open door: a gym reaching people who belong to no gym.
 *
 * Every other message here travels inside a relationship somebody chose. This
 * one does not, so the questions worth asking are about who it must NOT reach
 * — the gym's rivals' members, and anybody who said no — and about whose name
 * a member sees above it.
 */
describe('the open door', () => {
  const offer = msg({
    gym: 'Hierro Viejo',
    scope: 'open-door',
    kind: 'offer',
    title: 'First month on us',
    offer: { discount: 'First month free', code: 'ABCD-1234' },
  })

  const loose = { id: 'p-loose' }
  const looseNo = { id: 'p-no', openToGyms: false }
  const theirs = { id: 'p-theirs', gym: 'Hierro Viejo' }
  const rival = { id: 'p-rival', gym: 'Casa Ronda' }

  it('reaches somebody with no gym', () => {
    expect(isAddressedTo(offer, loose)).toBe(true)
  })

  it('never reaches somebody who already pays another gym', () => {
    // The reason the whole scope split exists: this is the person we must not
    // accidentally sell to.
    expect(isAddressedTo(offer, rival)).toBe(false)
  })

  it('does not reach the gym’s own members either', () => {
    // They are already inside; recruiting them is noise, and the gym has six
    // other templates for talking to them.
    expect(isAddressedTo(offer, theirs)).toBe(false)
  })

  it('respects somebody who turned it off', () => {
    expect(isAddressedTo(offer, looseNo)).toBe(false)
  })

  it('treats an absent answer as yes, the way the server’s backfill did', () => {
    // Two places decide this — the migration and this line — and they have to
    // agree, or a profile written before the switch existed would receive
    // messages the server does not think it is sending, or the reverse.
    expect(isAddressedTo(offer, { id: 'p-old' })).toBe(true)
    expect(isAddressedTo(offer, { id: 'p-old', openToGyms: undefined })).toBe(true)
  })

  it('arrives over the gym’s own name, never the platform’s', () => {
    // A stranger's offer wearing "enForma" would be untrue, and would lend the
    // platform's credibility to whoever bought the tier.
    expect(senderOf(offer)).toBe('Hierro Viejo')
    expect(senderOf(offer)).not.toBe(HOUSE_GYM)
  })

  it('still lets the house be the house', () => {
    expect(senderOf(msg({ scope: 'unaffiliated' }))).toBe(HOUSE_GYM)
    expect(senderOf(msg({ scope: 'everyone' }))).toBe(HOUSE_GYM)
  })

  it('picks the same audience the rule does, minus the refusals', () => {
    const directory = [
      { id: 'gym-1', gym: 'Hierro Viejo' },
      loose,
      looseNo,
      theirs,
      rival,
    ]
    const reached = audienceWithin(directory, 'Hierro Viejo', 'open-door', 'gym-1')
    expect(reached.map((p) => p.id)).toEqual(['p-loose'])
  })

  it('is not the same audience as the house’s unaffiliated', () => {
    // The house reaches somebody who turned gyms off: they did not opt out of
    // the platform they are using, only out of being recruited by strangers.
    expect(isAddressedTo(msg({ scope: 'unaffiliated' }), looseNo)).toBe(true)
  })
})

describe('scopes on the wire', () => {
  it('recognises every scope this build has, and nothing else', () => {
    // The guard exists because `messageFromWire` used to carry a literal list
    // of two, so the fourth scope arrived stripped and its audience never saw
    // it. Walked, so a fifth cannot be added without this failing.
    for (const scope of MESSAGE_SCOPES) expect(isMessageScope(scope)).toBe(true)
    expect(isMessageScope('open door')).toBe(false)
    expect(isMessageScope('')).toBe(false)
    expect(isMessageScope(undefined)).toBe(false)
  })

  it('names all four, so the list cannot quietly shrink', () => {
    expect([...MESSAGE_SCOPES].sort()).toEqual(
      ['everyone', 'members', 'open-door', 'unaffiliated'],
    )
  })
})

/**
 * Write it now, publish it later.
 *
 * The server is what actually withholds a queued message — `@now` in the
 * collection's read rule, proven by `scripts/audit/scheduled-boundary.mjs`.
 * What is left here is the copy a device holds of what it published itself,
 * which the server never gets a chance to withhold.
 */
describe('a message with a time on it', () => {
  const sunday = '2026-09-06T19:00:00.000Z'
  const monday = '2026-09-07T08:00:00.000Z'
  const menu = msg({ title: "Monday's menu", publishAt: monday })
  const ana = { id: 'p-ana', gym: 'Forge & Flow' }

  it('reaches nobody before its time', () => {
    expect(isAddressedTo(menu, ana, sunday)).toBe(false)
  })

  it('reaches them once it passes', () => {
    expect(isAddressedTo(menu, ana, '2026-09-07T08:00:01.000Z')).toBe(true)
  })

  it('is not counted as unread while it waits', () => {
    // Otherwise the badge announces a number that opens nothing.
    expect(unreadCount([menu], ana, sunday)).toBe(0)
    expect(unreadCount([menu], ana, '2026-09-07T09:00:00.000Z')).toBe(1)
  })

  it('is out of the inbox entirely, not merely unread', () => {
    expect(inboxFor([menu], ana, sunday)).toEqual([])
  })

  it('leaves everything without a time exactly as it was', () => {
    const plain = msg({ title: 'Now' })
    expect(isAddressedTo(plain, ana, sunday)).toBe(true)
    expect(isQueued(plain, sunday)).toBe(false)
  })

  it('tells the gym it is still queued, so Sent can say when', () => {
    expect(isQueued(menu, sunday)).toBe(true)
    expect(isQueued(menu, '2026-09-07T08:00:01.000Z')).toBe(false)
  })
})
