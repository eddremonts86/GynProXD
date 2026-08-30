import { describe, expect, it } from 'vitest'
import { eventIsUpcoming, noticesForToday, offerIsLive, productIsFresh } from './gym-notices'
import type { GymMessage } from './messages'

const TODAY = '2026-08-30'

const msg = (over: Partial<GymMessage>): GymMessage => ({
  id: 'm1',
  gym: 'Hangar Atlético',
  authorId: 'gym-1',
  createdAt: '2026-08-26T10:00:00.000Z',
  kind: 'announcement',
  title: 'Hello',
  audience: 'all',
  readBy: [],
  rsvp: {},
  saved: [],
  ...over,
})

const member = { id: 'p1', gym: 'Hangar Atlético' }

describe('what still deserves the home screen', () => {
  it('keeps an event happening today', () => {
    expect(eventIsUpcoming(msg({ kind: 'event', event: { date: TODAY } }), TODAY)).toBe(true)
  })

  it('drops an event that has already happened', () => {
    expect(eventIsUpcoming(msg({ kind: 'event', event: { date: '2026-08-29' } }), TODAY)).toBe(false)
  })

  it('drops an event with no date, which cannot be judged', () => {
    expect(eventIsUpcoming(msg({ kind: 'event' }), TODAY)).toBe(false)
  })

  it('keeps an offer with no end date', () => {
    expect(offerIsLive(msg({ kind: 'offer', offer: { discount: '20%', code: 'AAAA' } }), TODAY)).toBe(
      true,
    )
  })

  it('drops an offer that expired yesterday', () => {
    const expired = msg({
      kind: 'offer',
      offer: { discount: '20%', code: 'AAAA', validUntil: '2026-08-29' },
    })
    expect(offerIsLive(expired, TODAY)).toBe(false)
  })
})

describe('picking at most one of each', () => {
  it('takes the soonest event, not the most recently published', () => {
    const far = msg({
      id: 'far',
      kind: 'event',
      createdAt: '2026-08-28T10:00:00.000Z',
      event: { date: '2026-12-01' },
    })
    const soon = msg({
      id: 'soon',
      kind: 'event',
      createdAt: '2026-08-20T10:00:00.000Z',
      event: { date: '2026-09-02' },
    })
    expect(noticesForToday([far, soon], member, TODAY).event?.id).toBe('soon')
  })

  it('never returns more than one event and one offer', () => {
    const messages = [
      msg({ id: 'e1', kind: 'event', event: { date: '2026-09-02' } }),
      msg({ id: 'e2', kind: 'event', event: { date: '2026-09-03' } }),
      msg({ id: 'o1', kind: 'offer', offer: { discount: '10%', code: 'AAAA' } }),
      msg({ id: 'o2', kind: 'offer', offer: { discount: '20%', code: 'BBBB' } }),
    ]
    const picked = noticesForToday(messages, member, TODAY)
    expect(Object.keys(picked).sort()).toEqual(['deal', 'event'])
  })

  it('gives the one commercial slot to whichever came last', () => {
    const offer = msg({
      id: 'o',
      kind: 'offer',
      createdAt: '2026-08-25T10:00:00.000Z',
      offer: { discount: '10%', code: 'AAAA' },
    })
    const item = msg({
      id: 'p',
      kind: 'product',
      createdAt: '2026-08-28T10:00:00.000Z',
      product: { name: 'Training tee', price: '24.00' },
    })
    expect(noticesForToday([offer, item], member, TODAY).deal?.id).toBe('p')
  })

  it('never returns an offer and a shop item at once', () => {
    const messages = [
      msg({ id: 'o', kind: 'offer', offer: { discount: '10%', code: 'AAAA' } }),
      msg({ id: 'p', kind: 'product', product: { name: 'Tee', price: '24.00' } }),
    ]
    expect(Object.keys(noticesForToday(messages, member, TODAY))).toEqual(['deal'])
  })

  it('ignores messages from another gym', () => {
    const other = msg({ id: 'x', gym: 'Somewhere Else', kind: 'event', event: { date: '2026-09-02' } })
    expect(noticesForToday([other], member, TODAY).event).toBeUndefined()
  })

  it('drops a shop item once it stops being news', () => {
    const stale = msg({
      kind: 'product',
      createdAt: '2026-08-01T10:00:00.000Z',
      product: { name: 'Tee', price: '24.00' },
    })
    expect(productIsFresh(stale, TODAY)).toBe(false)
  })

  it('keeps a shop item published today', () => {
    const fresh = msg({
      kind: 'product',
      createdAt: '2026-08-30T10:00:00.000Z',
      product: { name: 'Tee', price: '24.00' },
    })
    expect(productIsFresh(fresh, TODAY)).toBe(true)
  })

  it('ignores an announcement, which has nothing to act on', () => {
    expect(noticesForToday([msg({ kind: 'announcement' })], member, TODAY)).toEqual({})
  })
})
