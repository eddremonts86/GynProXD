import { describe, expect, it } from 'vitest'
import {
  OUTING_MINUTES,
  outingFrom,
  outingsOn,
  validateEvents,
  withOuting,
  type NearbyEvent,
} from './nearby-events'
import { MAX_OUTINGS, type Outing } from './life-profile'

const quartet: NearbyEvent = {
  id: 'tm-1',
  name: 'Fake Quartet',
  date: '2026-09-03',
  time: '20:00',
  venue: 'The Old Hall',
  city: 'Barcelona',
  segment: 'Music',
  url: 'https://tickets.example/quartet',
}

describe('validateEvents', () => {
  it('keeps what the server promised and nothing it did not', () => {
    const out = validateEvents({
      events: [
        quartet,
        { ...quartet, id: 'tm-2', time: null, url: 'http://insecure.example' },
        { id: 'tm-3', name: 'No date' },
        { id: 42, name: 'No id', date: '2026-09-04' },
        null,
      ],
    })
    expect(out?.map((e) => e.id)).toEqual(['tm-1', 'tm-2'])
    expect(out?.[1].time).toBeNull()
    expect(out?.[1].url).toBe('')
  })

  it('is no answer without a list', () => {
    expect(validateEvents(null)).toBeNull()
    expect(validateEvents({ events: 'soon' })).toBeNull()
  })
})

describe('outingFrom', () => {
  it('runs two hours from the start, with the venue and the link along', () => {
    expect(outingFrom(quartet)).toEqual({
      id: 'tm-1',
      label: 'Fake Quartet',
      date: '2026-09-03',
      start: '20:00',
      end: '22:00',
      venue: 'The Old Hall',
      url: 'https://tickets.example/quartet',
    })
    expect(OUTING_MINUTES).toBe(120)
  })

  it('stops at the end of the day rather than running into tomorrow', () => {
    expect(outingFrom({ ...quartet, time: '23:30' })?.end).toBe('23:59')
  })

  it('has no hour to place an all-day event at', () => {
    expect(outingFrom({ ...quartet, time: null })).toBeNull()
  })
})

describe('withOuting', () => {
  const held: Outing[] = [
    { id: 'old', label: 'Gone', date: '2026-08-01', start: '20:00', end: '22:00' },
    { id: 'tm-1', label: 'Fake Quartet', date: '2026-09-03', start: '19:00', end: '21:00' },
  ]

  it('drops what is past, replaces the same event, and sorts by when', () => {
    const next = withOuting(
      held,
      { id: 'tm-1', label: 'Fake Quartet', date: '2026-09-03', start: '20:00', end: '22:00' },
      '2026-09-03',
    )
    expect(next.map((o) => `${o.id}@${o.start}`)).toEqual(['tm-1@20:00'])
  })

  it('stays bounded', () => {
    let list: Outing[] = []
    for (let i = 0; i < MAX_OUTINGS + 5; i += 1) {
      list = withOuting(
        list,
        { id: `e${i}`, label: 'x', date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, start: '20:00', end: '22:00' },
        '2026-09-03',
      )
    }
    expect(list).toHaveLength(MAX_OUTINGS)
  })
})

describe('outingsOn', () => {
  it('reads one date as commitments, in order, with the link when there is one', () => {
    const list: Outing[] = [
      { id: 'b', label: 'Later', date: '2026-09-03', start: '21:00', end: '23:00' },
      { id: 'a', label: 'Earlier', date: '2026-09-03', start: '18:00', end: '20:00', url: 'https://t.example' },
      { id: 'c', label: 'Tomorrow', date: '2026-09-04', start: '18:00', end: '20:00' },
    ]
    expect(outingsOn(list, '2026-09-03')).toEqual([
      { label: 'Earlier', start: '18:00', end: '20:00', ref: 'a', url: 'https://t.example' },
      { label: 'Later', start: '21:00', end: '23:00', ref: 'b' },
    ])
  })
})
