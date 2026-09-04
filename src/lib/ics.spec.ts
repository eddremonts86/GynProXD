import { describe, expect, it } from 'vitest'
import { MAX_EVENTS, parseIcs, property, toIcs, unescapeText, unfold } from './ics'

/**
 * The three exporters, and the ways they differ.
 *
 * The fixtures below are shaped like what Google Calendar, Apple Calendar and
 * Outlook actually write, because the differences between them are the whole
 * risk in this file: all three fold lines, all three name zones differently,
 * one of them quotes its `TZID`, and all three sprinkle `X-` properties that
 * have to be ignored rather than tripped over.
 *
 * A note on the window. Every test pins one, because "what is in this file" is
 * not a question this parser answers: it answers "what is in this file between
 * these two dates", which is what keeps a decade of somebody's meetings out of
 * a synced record.
 */
const WINDOW = { from: '2026-09-07', to: '2026-09-27' }

/** CRLF, because that is what the format specifies and what exporters emit. */
const crlf = (lines: string[]) => lines.join('\r\n')

const shape = (text: string, window = WINDOW) =>
  parseIcs(text, window).map((e) => `${e.date} ${e.start}-${e.end} ${e.title}`)

describe('unfold', () => {
  it('joins a continuation line, consuming the one space that marks it', () => {
    // The fold takes the CRLF *and* the single leading whitespace, which is why
    // exporters can wrap mid-word. A parser that kept the space would insert
    // one into the middle of somebody title.
    expect(unfold('SUMMARY:Team stand\r\n up')).toEqual(['SUMMARY:Team standup'])
    expect(unfold('SUMMARY:Team stand\r\n\tup')).toEqual(['SUMMARY:Team standup'])
  })

  it('keeps a space that was in the text, not in the fold', () => {
    // Wrapped after "stand " there are two: the fold eats one and the title
    // keeps the other.
    expect(unfold('SUMMARY:Team stand \r\n up')).toEqual(['SUMMARY:Team stand up'])
  })

  it('reads all three line endings', () => {
    expect(unfold('A\r\nB')).toEqual(['A', 'B'])
    expect(unfold('A\nB')).toEqual(['A', 'B'])
    expect(unfold('A\rB')).toEqual(['A', 'B'])
  })
})

describe('property', () => {
  it('splits a name, its parameters and its value', () => {
    expect(property('DTSTART;TZID=Europe/Madrid:20260907T090000')).toEqual({
      name: 'DTSTART',
      params: { TZID: 'Europe/Madrid' },
      value: '20260907T090000',
    })
  })

  it('survives the quoted zone name Outlook writes', () => {
    // `TZID="W. Europe Standard Time"` has a space and a full stop in it. The
    // value is not used, but the line still has to parse.
    const prop = property('DTSTART;TZID="W. Europe Standard Time":20260908T140000')
    expect(prop?.name).toBe('DTSTART')
    expect(prop?.value).toBe('20260908T140000')
  })

  it('is null for a line with no colon', () => {
    expect(property('BEGIN')).toBeNull()
  })
})

describe('unescapeText', () => {
  it('undoes the escapes a title is full of', () => {
    expect(unescapeText('Lunch\\, then gym\\; maybe')).toBe('Lunch, then gym; maybe')
    expect(unescapeText('Line one\\nLine two')).toBe('Line one Line two')
    expect(unescapeText('C:\\\\Users')).toBe('C:\\Users')
  })
})

describe('a Google export', () => {
  const google = crlf([
    'BEGIN:VCALENDAR',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Madrid:20260907T090000',
    'DTEND;TZID=Europe/Madrid:20260907T173000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
    'DTSTAMP:20260901T120000Z',
    'UID:abc123@google.com',
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'SUMMARY:Office',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ])

  it('expands a weekly rule across the window', () => {
    expect(shape(google)).toEqual([
      '2026-09-07 09:00-17:30 Office',
      '2026-09-09 09:00-17:30 Office',
      '2026-09-14 09:00-17:30 Office',
      '2026-09-16 09:00-17:30 Office',
      '2026-09-21 09:00-17:30 Office',
      '2026-09-23 09:00-17:30 Office',
    ])
  })

  it('stays inside the window it was given', () => {
    expect(shape(google, { from: '2026-09-14', to: '2026-09-16' })).toEqual([
      '2026-09-14 09:00-17:30 Office',
      '2026-09-16 09:00-17:30 Office',
    ])
  })
})

describe('an Apple export', () => {
  const apple = crlf([
    'BEGIN:VCALENDAR',
    'PRODID:-//Apple Inc.//macOS 15.0//EN',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'CREATED:20260901T090000Z',
    'UID:11111111-2222-3333-4444-555555555555',
    'DTEND;TZID=Europe/Madrid:20260908T151500',
    'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
    'SUMMARY:Physio appointment with the long name that wraps over the seventy-fi',
    ' ve octet limit',
    'DTSTART;TZID=Europe/Madrid:20260908T140000',
    'SEQUENCE:0',
    'X-APPLE-CREATOR-IDENTITY:com.apple.calendar',
    'END:VEVENT',
    'END:VCALENDAR',
  ])

  it('reads a one-off event and the folded title with it', () => {
    const [event] = parseIcs(apple, WINDOW)
    expect(event.date).toBe('2026-09-08')
    expect(event.start).toBe('14:00')
    expect(event.end).toBe('15:15')
    expect(event.title).toContain('seventy-five octet limit')
  })

  it('ignores the X- properties rather than tripping over them', () => {
    expect(parseIcs(apple, WINDOW)).toHaveLength(1)
  })

  it('does not mind DTEND arriving before DTSTART in the file', () => {
    // Apple writes them in that order. A parser that assumed sequence would
    // read the end as the start.
    expect(parseIcs(apple, WINDOW)[0].start).toBe('14:00')
  })
})

describe('an Outlook export', () => {
  const outlook = crlf([
    'BEGIN:VCALENDAR',
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DESCRIPTION:Weekly sync\\nJoin here',
    'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TH;WKST=SU;COUNT=2',
    'UID:040000008200E00074C5B7101A82E008',
    'SUMMARY:Weekly sync',
    'DTSTART;TZID="W. Europe Standard Time":20260910T100000',
    'DTEND;TZID="W. Europe Standard Time":20260910T104500',
    'CLASS:PUBLIC',
    'TRANSP:OPAQUE',
    'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    'END:VEVENT',
    'END:VCALENDAR',
  ])

  it('honours COUNT', () => {
    expect(shape(outlook)).toEqual([
      '2026-09-10 10:00-10:45 Weekly sync',
      '2026-09-17 10:00-10:45 Weekly sync',
    ])
  })
})

describe('what it refuses to treat as busy', () => {
  const wrap = (lines: string[]) =>
    crlf(['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', ...lines, 'END:VEVENT', 'END:VCALENDAR'])

  it('an all-day event', () => {
    // Both Google and Outlook mark these free by default, and a birthday is
    // not a reason to refuse to train. Treating one as busy empties a day.
    expect(
      shape(wrap(['DTSTART;VALUE=DATE:20260908', 'DTEND;VALUE=DATE:20260909', 'SUMMARY:Birthday'])),
    ).toEqual([])
  })

  it('one the calendar itself calls transparent', () => {
    expect(
      shape(
        wrap([
          'DTSTART:20260908T140000',
          'DTEND:20260908T150000',
          'SUMMARY:Focus time',
          'TRANSP:TRANSPARENT',
        ]),
      ),
    ).toEqual([])
  })

  it('a cancelled one', () => {
    expect(
      shape(
        wrap([
          'DTSTART:20260908T140000',
          'DTEND:20260908T150000',
          'SUMMARY:Off',
          'STATUS:CANCELLED',
        ]),
      ),
    ).toEqual([])
  })

  it('a single moved instance, rather than guessing where it moved to', () => {
    expect(
      shape(
        wrap([
          'DTSTART:20260908T140000',
          'DTEND:20260908T150000',
          'RECURRENCE-ID:20260908T140000',
          'SUMMARY:Moved',
        ]),
      ),
    ).toEqual([])
  })

  it('a repeat it cannot read, rather than importing one instance of it', () => {
    // Better to lose a monthly meeting than to put it on every day of the
    // window, or on one arbitrary day of it.
    expect(
      shape(
        wrap([
          'DTSTART:20260908T140000',
          'DTEND:20260908T150000',
          'RRULE:FREQ=MONTHLY;BYMONTHDAY=8',
          'SUMMARY:Board',
        ]),
      ),
    ).toEqual([])
  })

  it('an event with no end', () => {
    expect(shape(wrap(['DTSTART:20260908T140000', 'SUMMARY:Something']))).toEqual([])
  })

  it('an event whose times make no sense', () => {
    expect(shape(wrap(['DTSTART:20260908T150000', 'DTEND:20260908T140000', 'SUMMARY:X']))).toEqual([])
    expect(shape(wrap(['DTSTART:not-a-date', 'DTEND:20260908T140000', 'SUMMARY:X']))).toEqual([])
  })

  it('a date the series says is excluded', () => {
    expect(
      shape(
        wrap([
          'DTSTART:20260907T090000',
          'DTEND:20260907T100000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO',
          'EXDATE:20260914T090000',
          'SUMMARY:Stand up',
        ]),
      ),
    ).toEqual([
      '2026-09-07 09:00-10:00 Stand up',
      '2026-09-21 09:00-10:00 Stand up',
    ])
  })
})

describe('the awkward times', () => {
  const wrap = (lines: string[]) =>
    crlf(['BEGIN:VEVENT', ...lines, 'END:VEVENT'])

  it('clips an event that runs past midnight at the end of its own day', () => {
    // A shift finishing at one in the morning still blocks the evening it
    // started in, and the planner works one day at a time.
    expect(
      shape(wrap(['DTSTART:20260908T220000', 'DTEND:20260909T010000', 'SUMMARY:Late shift'])),
    /* 23:59 rather than 24:00: the clock strings the rest of the app reads run
       00:00 to 23:59, and a minute is not a scheduling difference. */
    ).toEqual(['2026-09-08 22:00-23:59 Late shift'])
  })

  it('converts a UTC instant to this device local hours', () => {
    // The one branch that converts, because it is the one where the answer is
    // knowable. Asserted against the platform rather than a fixed string, so
    // the test says the same thing in every timezone CI might run in.
    const at = new Date(Date.UTC(2026, 8, 8, 12, 0, 0))
    const expected = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    const [event] = parseIcs(
      wrap(['DTSTART:20260908T120000Z', 'DTEND:20260908T130000Z', 'SUMMARY:Call']),
      { from: '2026-09-07', to: '2026-09-27' },
    )
    expect(event.start).toBe(expected)
  })

  it('takes a floating time as written', () => {
    expect(
      shape(wrap(['DTSTART:20260908T140000', 'DTEND:20260908T150000', 'SUMMARY:Floating'])),
    ).toEqual(['2026-09-08 14:00-15:00 Floating'])
  })

  it('names an untitled event rather than leaving a blank row', () => {
    expect(shape(wrap(['DTSTART:20260908T140000', 'DTEND:20260908T150000']))).toEqual([
      '2026-09-08 14:00-15:00 Busy',
    ])
  })
})

describe('what bounds it', () => {
  it('caps how many events one file can contribute', () => {
    // The profile is one synced record with an array inside it. A decade of
    // somebody meetings in there is a record nobody wants to merge.
    const daily = crlf([
      'BEGIN:VEVENT',
      'DTSTART:20260907T090000',
      'DTEND:20260907T093000',
      'RRULE:FREQ=DAILY',
      'SUMMARY:Every day',
      'END:VEVENT',
    ])
    const wide = parseIcs(daily, { from: '2026-09-07', to: '2028-09-07' })
    expect(wide).toHaveLength(MAX_EVENTS)
  })

  it('does not spin on a rule with no end that started years ago', () => {
    const ancient = crlf([
      'BEGIN:VEVENT',
      'DTSTART:20110103T090000',
      'DTEND:20110103T093000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'SUMMARY:Ancient stand up',
      'END:VEVENT',
    ])
    expect(shape(ancient)).toEqual([
      '2026-09-07 09:00-09:30 Ancient stand up',
      '2026-09-14 09:00-09:30 Ancient stand up',
      '2026-09-21 09:00-09:30 Ancient stand up',
    ])
  })

  it('reads a file with nothing in it as nothing', () => {
    expect(parseIcs('', WINDOW)).toEqual([])
    expect(parseIcs('this is not a calendar', WINDOW)).toEqual([])
    expect(parseIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR', WINDOW)).toEqual([])
  })
})

describe('toIcs', () => {
  const day = [
    { date: '2026-09-07', start: '09:00', end: '17:00', title: 'work' },
    { date: '2026-09-07', start: '18:00', end: '19:30', title: 'Push day' },
  ]

  it('writes a calendar every app can open', () => {
    const text = toIcs(day, 'enForma, Monday')
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('VERSION:2.0')
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })

  it('uses CRLF, which the format requires', () => {
    expect(toIcs(day, 'x')).not.toMatch(/[^\r]\n/)
  })

  it('writes floating times, so a day plan does not move when you travel', () => {
    const text = toIcs(day, 'x')
    expect(text).toContain('DTSTART:20260907T090000')
    expect(text).not.toContain('DTSTART:20260907T090000Z')
  })

  it('escapes a title that would otherwise break the line', () => {
    const text = toIcs([{ ...day[0], title: 'Lunch, then gym; maybe' }], 'x')
    expect(text).toContain('SUMMARY:Lunch\\, then gym\\; maybe')
  })

  it('round-trips its own output', () => {
    // The strongest single check on both halves: what this writes, the parser
    // reads back as the same day.
    const text = toIcs(day, 'enForma')
    expect(shape(text)).toEqual([
      '2026-09-07 09:00-17:00 work',
      '2026-09-07 18:00-19:30 Push day',
    ])
  })

  it('writes whatever it is handed, so the filtering is the caller job', () => {
    // Worth pinning where the responsibility sits: `toIcs` has no opinion about
    // slot kinds, and `calendar-import.tsx` is what drops the intimate activity
    // slot before the file is written. A test here that expected filtering
    // would be testing the wrong file.
    const text = toIcs([{ date: '2026-09-07', start: '21:00', end: '21:30', title: 'Anything' }], 'x')
    expect(text).toContain('SUMMARY:Anything')
  })

  it('gives every event a distinct uid', () => {
    const uids = toIcs(day, 'x').match(/^UID:.*$/gm) ?? []
    expect(new Set(uids).size).toBe(2)
  })
})
