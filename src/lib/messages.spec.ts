import { describe, expect, it } from 'vitest'
import {
  inboxFor,
  isAddressedTo,
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
