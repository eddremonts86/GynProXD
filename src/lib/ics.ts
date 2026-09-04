/**
 * Enough iCalendar to know when somebody is busy.
 *
 * No OAuth, no tokens, no server holding a key that can read a whole calendar
 * forever. Every calendar exports this format and every calendar can subscribe
 * to it, so a file the member picks is the smallest thing that works and the
 * only one that works offline. `docs/plans/2026-09-03-life-plan.md` step 4.4
 * says why two-way sync is deliberately not here.
 *
 * The subset is chosen, not accidental. What is read: `VEVENT`, `DTSTART`,
 * `DTEND`, `SUMMARY`, `RRULE` for daily and weekly repeats, `EXDATE`. What is
 * skipped, each for a reason:
 *
 *   all-day events        Google and Outlook both mark these free by default,
 *                         and a birthday is not a reason to refuse to train.
 *                         Treating one as busy would empty a whole day.
 *   TRANSP:TRANSPARENT    the calendar itself says this does not block time.
 *   STATUS:CANCELLED      it is not happening.
 *   RECURRENCE-ID         a single moved instance. Skipped, which means the
 *                         series' original time is used for that date. Known
 *                         wrong and rare; the import preview shows every time
 *                         before it is accepted, which is where it gets caught.
 *   FREQ=MONTHLY/YEARLY   a monthly meeting is not what a day planner is for,
 *                         and the window it reads is three weeks wide.
 *
 * **Times are read as wall clock.** A `Z` time is converted to this device's
 * local hours, because that is a real instant and the answer is knowable. A
 * floating time is already wall clock. A `TZID` time is used as written, which
 * is exactly right for the common case — somebody's own calendar, in the zone
 * they are standing in — and off by the offset for an event authored elsewhere.
 * Converting properly needs a named-zone lookup; showing the time on the
 * preview and making somebody tick it is cheaper and catches the same mistake.
 */

export interface IcsEvent {
  /** yyyy-mm-dd, local. */
  date: string
  /** `HH:MM`, local wall clock. */
  start: string
  end: string
  /** From `SUMMARY`. The caller decides whether to keep it; see the import UI. */
  title: string
}

/** How many occurrences of one rule are ever walked. A bound, not a rule. */
const MAX_OCCURRENCES = 1000
/** How many events one file may contribute, so the profile stays small. */
export const MAX_EVENTS = 200

/**
 * Unfolds the line wrapping RFC 5545 requires.
 *
 * A continuation is a CRLF followed by one space or tab, and every exporter
 * uses it because the spec caps a line at 75 octets. Apple wraps a long
 * `SUMMARY` mid-word, Google wraps `RRULE`, Outlook wraps almost everything.
 * Getting this wrong does not fail loudly: it produces a `SUMMARY` that stops
 * halfway and an `RRULE` missing its `UNTIL`.
 */
export function unfold(text: string): string[] {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

interface Property {
  name: string
  params: Record<string, string>
  value: string
}

/** `DTSTART;TZID=Europe/Madrid:20260907T090000` into its three parts. */
export function property(line: string): Property | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [name, ...rest] = left.split(';')
  const params: Record<string, string> = {}
  for (const part of rest) {
    const eq = part.indexOf('=')
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  return { name: name.toUpperCase(), params, value }
}

/** `\,` `\;` `\n` `\\` are escapes in a text value, and titles are full of them. */
export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Stamp {
  /** Local wall-clock fields. */
  y: number
  m: number
  d: number
  minutes: number
  allDay: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoOf(stamp: Pick<Stamp, 'y' | 'm' | 'd'>): string {
  return `${stamp.y}-${pad(stamp.m)}-${pad(stamp.d)}`
}

/**
 * Minutes into `HH:MM`, with midnight at the far end written as 23:59.
 *
 * The rest of this codebase reads clock strings through
 * `life-profile.minutesOf`, whose domain is 00:00 to 23:59, so a block ending
 * at "24:00" would be refused by the very code that has to place the day
 * around it. One minute is not a scheduling difference — nothing is ever put in
 * a one-minute gap — and a valid string that is a minute short beats an
 * expressive one that gets thrown away.
 */
export function clockOfMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded >= 1440) return '23:59'
  const total = ((rounded % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/**
 * A `DTSTART`/`DTEND` value into local wall-clock fields.
 *
 * The `Z` branch is the only one that converts: it names a real instant, so
 * `Date` can be asked what that is here. Everything else is taken as written.
 */
export function stamp(prop: Property): Stamp | null {
  const value = prop.value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (dateOnly || prop.params.VALUE === 'DATE') {
    if (!dateOnly) return null
    return {
      y: Number(dateOnly[1]),
      m: Number(dateOnly[2]),
      d: Number(dateOnly[3]),
      minutes: 0,
      allDay: true,
    }
  }
  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value)
  if (!full) return null
  const [, y, m, d, hh, mm, , zulu] = full
  if (zulu === 'Z') {
    const at = new Date(
      Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0),
    )
    if (Number.isNaN(at.getTime())) return null
    return {
      y: at.getFullYear(),
      m: at.getMonth() + 1,
      d: at.getDate(),
      minutes: at.getHours() * 60 + at.getMinutes(),
      allDay: false,
    }
  }
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null
  if (Number(hh) > 23 || Number(mm) > 59) return null
  return {
    y: Number(y),
    m: Number(m),
    d: Number(d),
    minutes: Number(hh) * 60 + Number(mm),
    allDay: false,
  }
}

const BYDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

interface Rule {
  freq: 'DAILY' | 'WEEKLY'
  interval: number
  byDay: number[]
  until: string | null
  count: number | null
}

export function rule(value: string): Rule | null {
  const parts: Record<string, string> = {}
  for (const piece of value.split(';')) {
    const eq = piece.indexOf('=')
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1)
  }
  const freq = (parts.FREQ ?? '').toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return null
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1)
  const byDay = (parts.BYDAY ?? '')
    .split(',')
    .map((token) => BYDAY_INDEX[token.trim().slice(-2).toUpperCase()])
    .filter((index) => index !== undefined)
  const untilStamp = parts.UNTIL ? stamp({ name: 'UNTIL', params: {}, value: parts.UNTIL }) : null
  const count = parts.COUNT ? Math.max(1, Number(parts.COUNT) || 1) : null
  return { freq, interval, byDay, until: untilStamp ? isoOf(untilStamp) : null, count }
}

function dateFrom(stampValue: Stamp): Date {
  return new Date(stampValue.y, stampValue.m - 1, stampValue.d)
}

function plusDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isoOfDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Every date this rule lands on inside the window.
 *
 * Walked forward from `DTSTART` rather than tested per date, because `COUNT`
 * counts occurrences and only a walk knows which number a given date is. The
 * walk is bounded twice: by the window's far end and by `MAX_OCCURRENCES`, so a
 * rule with no `UNTIL` and no `COUNT` that started in 2011 cannot spin.
 */
export function occurrences(start: Stamp, repeat: Rule, from: string, to: string): string[] {
  const days = repeat.freq === 'DAILY' ? repeat.interval : 7 * repeat.interval
  const weekly = repeat.freq === 'WEEKLY' && repeat.byDay.length > 0
  const out: string[] = []
  let cursor = dateFrom(start)
  let seen = 0

  for (let step = 0; step < MAX_OCCURRENCES; step += 1) {
    /* A weekly rule with BYDAY lands on several days of the same week, so the
       week is the unit and the named days inside it are the occurrences. */
    const inThisStep = weekly
      ? repeat.byDay
          .map((index) => plusDays(cursor, (index - cursor.getDay() + 7) % 7))
          .sort((a, b) => a.getTime() - b.getTime())
      : [cursor]

    for (const at of inThisStep) {
      const iso = isoOfDate(at)
      if (iso < isoOf(start)) continue
      if (repeat.until && iso > repeat.until) return out
      seen += 1
      if (repeat.count !== null && seen > repeat.count) return out
      if (iso > to) return out
      if (iso >= from) out.push(iso)
    }

    cursor = plusDays(cursor, days)
    if (isoOfDate(cursor) > to && out.length > 0) break
    if (isoOfDate(cursor) > to && repeat.count === null) break
  }
  return out
}

export interface Window {
  /** yyyy-mm-dd, inclusive. */
  from: string
  to: string
}

/**
 * The events in this file that fall inside the window, already expanded.
 *
 * Anything unparseable is skipped rather than repaired, which is the house rule
 * for malformed input everywhere in this codebase. A file that produces nothing
 * is a fine answer: the anchor form is two fields away.
 */
export function parseIcs(text: string, window: Window): IcsEvent[] {
  const lines = unfold(text)
  const events: IcsEvent[] = []

  let inEvent = false
  let start: Stamp | null = null
  let end: Stamp | null = null
  let title = ''
  let repeat: Rule | null = null
  let skip = false
  let excluded: Set<string> = new Set()
  let hasRecurrenceId = false

  const reset = () => {
    start = null
    end = null
    title = ''
    repeat = null
    skip = false
    excluded = new Set()
    hasRecurrenceId = false
  }

  const flush = () => {
    if (skip || hasRecurrenceId || !start || start.allDay) return
    /* No DTEND is legal and means a zero-length event for a timed one. Nothing
       to avoid, so nothing to import. */
    if (!end) return
    const from = start.minutes
    let to = end.minutes
    /* An event ending the next day is clipped at midnight rather than dropped:
       a shift finishing at 01:00 still blocks the evening it started in, and
       the day planner works one day at a time. */
    if (isoOf(end) > isoOf(start)) to = 24 * 60
    if (to <= from) return

    const dates = repeat ? occurrences(start, repeat, window.from, window.to) : [isoOf(start)]
    for (const date of dates) {
      if (date < window.from || date > window.to) continue
      if (excluded.has(date)) continue
      if (events.length >= MAX_EVENTS) return
      events.push({
        date,
        start: clockOfMinutes(from),
        end: clockOfMinutes(to),
        title: title === '' ? 'Busy' : title,
      })
    }
  }

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      reset()
      continue
    }
    if (upper === 'END:VEVENT') {
      if (inEvent) flush()
      inEvent = false
      continue
    }
    if (!inEvent) continue

    const prop = property(line)
    if (!prop) continue
    switch (prop.name) {
      case 'DTSTART':
        start = stamp(prop)
        break
      case 'DTEND':
        end = stamp(prop)
        break
      case 'SUMMARY':
        /* Long enough to be recognisable on the preview. Whether it is stored
           at all is the import screen's decision, and a stored label is
           trimmed again there. */
        title = unescapeText(prop.value).slice(0, 120)
        break
      case 'RRULE':
        repeat = rule(prop.value)
        /* A repeat this does not read is not a licence to import one instance
           of it forever. Better to lose a monthly meeting than to put it on
           every day of the window. */
        if (repeat === null) skip = true
        break
      case 'EXDATE': {
        for (const piece of prop.value.split(',')) {
          const at = stamp({ ...prop, value: piece })
          if (at) excluded.add(isoOf(at))
        }
        break
      }
      case 'TRANSP':
        if (prop.value.trim().toUpperCase() === 'TRANSPARENT') skip = true
        break
      case 'STATUS':
        if (prop.value.trim().toUpperCase() === 'CANCELLED') skip = true
        break
      case 'RECURRENCE-ID':
        hasRecurrenceId = true
        break
      default:
        break
    }
  }
  return events
}

/* ------------------------------------------------------------------- export */

/** Folds a line to 75 octets the way every exporter does. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`)
  return parts.join('\r\n')
}

function escapeText(value: string): string {
  return value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

export interface ExportEvent {
  date: string
  start: string
  end: string
  title: string
}

/**
 * A day as a calendar file, for whoever wants it in the app they already use.
 *
 * Floating times, deliberately: no `Z` and no `TZID`. A day plan is a wall
 * clock — the session is at six in the evening wherever the person is — and
 * stamping it with this device's zone would move it if they travelled.
 */
export function toIcs(events: readonly ExportEvent[], name: string): string {
  const stampNow = new Date()
  const dtstamp = `${stampNow.getUTCFullYear()}${pad(stampNow.getUTCMonth() + 1)}${pad(stampNow.getUTCDate())}T${pad(stampNow.getUTCHours())}${pad(stampNow.getUTCMinutes())}${pad(stampNow.getUTCSeconds())}Z`
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//enForma//Day plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(name)}`),
  ]
  events.forEach((event, index) => {
    const day = event.date.replace(/-/g, '')
    const from = event.start.replace(':', '')
    const to = event.end.replace(':', '')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${day}-${index}-${from}@enforma`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${day}T${from}00`,
      `DTEND:${day}T${to}00`,
      fold(`SUMMARY:${escapeText(event.title)}`),
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
