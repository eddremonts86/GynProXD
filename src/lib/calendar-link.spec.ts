import { describe, expect, it } from 'vitest'
import { blocksFromIcs, icsWindow, validateBlocks } from './calendar-link'

/**
 * What the day is allowed to believe about a calendar it did not read itself.
 *
 * The server normalises, and this checks it anyway. A block drawn at an hour
 * that does not exist, or one running backwards, is a stripe on somebody's day
 * with no explanation, and the cost of refusing it here is one loop.
 */
describe('validateBlocks', () => {
  it('keeps a real block and marks where it came from', () => {
    expect(
      validateBlocks({
        blocks: [{ date: '2026-09-04', start: '09:30', end: '10:00', title: 'Standup' }],
      }),
    ).toEqual([
      { date: '2026-09-04', start: '09:30', end: '10:00', source: 'google', label: 'Standup' },
    ])
  })

  it('keeps one with no title, without inventing a label', () => {
    const out = validateBlocks({
      blocks: [{ date: '2026-09-04', start: '09:30', end: '10:00', title: '' }],
    })
    expect(out).toEqual([{ date: '2026-09-04', start: '09:30', end: '10:00', source: 'google' }])
    expect('label' in (out?.[0] ?? {})).toBe(false)
  })

  it('drops what could not be drawn', () => {
    const out = validateBlocks({
      blocks: [
        { date: '4 Sept', start: '09:30', end: '10:00' },
        { date: '2026-09-04', start: '25:00', end: '26:00' },
        { date: '2026-09-04', start: '10:00', end: '09:00' },
        { date: '2026-09-04', start: '10:00', end: '10:00' },
        null,
        { date: '2026-09-04', start: '11:00', end: '12:00' },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out?.[0].start).toBe('11:00')
  })

  it('is no answer without a list', () => {
    expect(validateBlocks(null)).toBeNull()
    expect(validateBlocks({ blocks: 'soon' })).toBeNull()
  })
})

/* A Thursday, fixed, so none of this depends on when it runs. */
const TODAY = '2026-09-03'

const ical = (body: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iOS 18//EN', body, 'END:VCALENDAR'].join(
    '\r\n',
  )

describe('icsWindow', () => {
  it('is the same three weeks the server asked iCloud for', () => {
    expect(icsWindow(TODAY)).toEqual({ from: '2026-09-03', to: '2026-09-24' })
  })
})

describe('blocksFromIcs', () => {
  it('reads a relayed event into a block, marked as Apple, with no title by default', () => {
    const text = ical(
      [
        'BEGIN:VEVENT',
        'UID:1',
        'SUMMARY:Dentist',
        'DTSTART;TZID=Europe/Madrid:20260904T190000',
        'DTEND;TZID=Europe/Madrid:20260904T200000',
        'END:VEVENT',
      ].join('\r\n'),
    )
    expect(blocksFromIcs([text], false, TODAY)).toEqual([
      { date: '2026-09-04', start: '19:00', end: '20:00', source: 'apple' },
    ])
  })

  it('keeps the title when asked, which is the same switch the file import has', () => {
    const text = ical(
      [
        'BEGIN:VEVENT',
        'UID:1',
        'SUMMARY:Dentist, the long appointment',
        'DTSTART;TZID=Europe/Madrid:20260904T190000',
        'DTEND;TZID=Europe/Madrid:20260904T200000',
        'END:VEVENT',
      ].join('\r\n'),
    )
    expect(blocksFromIcs([text], true, TODAY)[0].label).toBe('Dentist, the long appointment')
  })

  it('walks a weekly rule, which is the reason the server does not expand them', () => {
    /* Every Friday for the window. Expanding this server-side would have meant
       UTC, and turning UTC into wall-clock hours needs the timezone database
       that lives here rather than there. */
    const text = ical(
      [
        'BEGIN:VEVENT',
        'UID:2',
        'SUMMARY:Guitar',
        'DTSTART;TZID=Europe/Madrid:20260904T200000',
        'DTEND;TZID=Europe/Madrid:20260904T210000',
        'RRULE:FREQ=WEEKLY;BYDAY=FR',
        'END:VEVENT',
      ].join('\r\n'),
    )
    const dates = blocksFromIcs([text], false, TODAY).map((b) => b.date)
    expect(dates).toEqual(['2026-09-04', '2026-09-11', '2026-09-18'])
  })

  it('takes nothing that does not block time', () => {
    const text = ical(
      [
        'BEGIN:VEVENT',
        'UID:3',
        'SUMMARY:Birthday',
        'DTSTART;VALUE=DATE:20260905',
        'DTEND;VALUE=DATE:20260906',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:4',
        'SUMMARY:Out of office',
        'TRANSP:TRANSPARENT',
        'DTSTART;TZID=Europe/Madrid:20260905T090000',
        'DTEND;TZID=Europe/Madrid:20260905T100000',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:5',
        'SUMMARY:Cancelled thing',
        'STATUS:CANCELLED',
        'DTSTART;TZID=Europe/Madrid:20260905T110000',
        'DTEND;TZID=Europe/Madrid:20260905T120000',
        'END:VEVENT',
      ].join('\r\n'),
    )
    expect(blocksFromIcs([text], false, TODAY)).toEqual([])
  })

  it('merges several calendars, drops the duplicate hour and sorts by when', () => {
    /* One event in two calendars is one block: iCloud will hand back the same
       invitation from a shared calendar and from the personal one. */
    const one = ical(
      ['BEGIN:VEVENT', 'UID:6', 'SUMMARY:Standup', 'DTSTART;TZID=Europe/Madrid:20260907T093000', 'DTEND;TZID=Europe/Madrid:20260907T100000', 'END:VEVENT'].join('\r\n'),
    )
    const two = ical(
      [
        'BEGIN:VEVENT', 'UID:7', 'SUMMARY:Standup', 'DTSTART;TZID=Europe/Madrid:20260907T093000', 'DTEND;TZID=Europe/Madrid:20260907T100000', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:8', 'SUMMARY:Earlier', 'DTSTART;TZID=Europe/Madrid:20260904T080000', 'DTEND;TZID=Europe/Madrid:20260904T083000', 'END:VEVENT',
      ].join('\r\n'),
    )
    const blocks = blocksFromIcs([one, two], false, TODAY)
    expect(blocks.map((b) => `${b.date} ${b.start}`)).toEqual(['2026-09-04 08:00', '2026-09-07 09:30'])
  })

  it('survives an empty relay and text that is not a calendar', () => {
    expect(blocksFromIcs([], false, TODAY)).toEqual([])
    expect(blocksFromIcs(['<html>an error page</html>'], false, TODAY)).toEqual([])
  })
})
