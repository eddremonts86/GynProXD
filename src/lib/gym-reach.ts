import { sentBy, type GymMessage } from './messages'

/**
 * What a gym got back for publishing. The per-message tallies already existed,
 * buried one row at a time in a collapsed list; nothing ever added them up.
 *
 * This matters more than it looks: the gym is the paying side of this product,
 * and a customer who cannot see what they are buying does not renew. Every
 * figure here is counted from what members actually did, never estimated.
 */

export interface ReachSummary {
  /** Messages published in the window. */
  published: number
  /** Distinct members who opened at least one of them. */
  membersReached: number
  /** Yes answers across every event. */
  going: number
  /** Offers put aside by a member — the closest thing to intent to redeem. */
  offersSaved: number
  /** Shop items a member asked the desk to hold. */
  itemsReserved: number
  /** Members who took up a published challenge. */
  challengesJoined: number
}

export const REACH_WINDOW_DAYS = 30

function withinWindow(message: GymMessage, sinceIso: string): boolean {
  return message.createdAt.slice(0, 10) >= sinceIso
}

/**
 * `sinceIso` is a plain date; pass the window's first day, or `null` for
 * everything ever — which is what the Plus window selector's last option means.
 */
export function summariseReach(
  messages: GymMessage[],
  gym: string,
  sinceIso: string | null,
): ReachSummary {
  const window = sentBy(messages, gym).filter(
    (m) => sinceIso === null || withinWindow(m, sinceIso),
  )
  const readers = new Set<string>()

  let going = 0
  let offersSaved = 0
  let itemsReserved = 0
  let challengesJoined = 0

  for (const message of window) {
    for (const id of message.readBy) readers.add(id)
    if (message.kind === 'event') {
      going += Object.values(message.rsvp).filter((answer) => answer === 'yes').length
    }
    if (message.kind === 'offer') offersSaved += message.saved.length
    if (message.kind === 'product') itemsReserved += message.saved.length
    if (message.kind === 'challenge') challengesJoined += message.joined?.length ?? 0
  }

  return {
    published: window.length,
    membersReached: readers.size,
    going,
    offersSaved,
    itemsReserved,
    challengesJoined,
  }
}

/**
 * The windows a gym can look through.
 *
 * `null` is everything ever, which is what "reach with no window" means and why
 * it is a Plus feature: the 30-day figure answers "did last month work", and
 * the whole history answers "is this worth renewing". The second question is
 * the one a gym asks at renewal, so it is the one behind the upgrade.
 */
export const REACH_WINDOWS = [
  { key: 'd30', days: REACH_WINDOW_DAYS, label: 'Last 30 days' },
  { key: 'd90', days: 90, label: 'Last 90 days' },
  { key: 'y1', days: 365, label: 'Last year' },
  { key: 'all', days: null, label: 'Everything' },
] as const

/**
 * A key, not the number. The first version used `String(days)` as the select's
 * value, so "everything" travelled as the literal string `"null"` — and a
 * select whose value is the word "null" is a bug looking for somewhere to
 * happen. It found one: picking Everything changed nothing at all.
 */
export type ReachWindowKey = (typeof REACH_WINDOWS)[number]['key']

export function windowDays(key: ReachWindowKey): number | null {
  /* Not `?.days ?? REACH_WINDOW_DAYS`. `null` is a legitimate answer here — it
     is what "everything" means — and nullish coalescing cannot tell it from a
     key that was not found, so it quietly turned Everything back into 30 days.
     The selector changed, every label changed, and the numbers did not. */
  const found = REACH_WINDOWS.find((w) => w.key === key)
  return found ? found.days : REACH_WINDOW_DAYS
}

export function windowLabel(key: ReachWindowKey): string {
  return REACH_WINDOWS.find((w) => w.key === key)?.label ?? ''
}

/**
 * One row per message, for a gym that wants these numbers next to its own.
 *
 * CSV rather than a chart, because the point is to leave: this goes into
 * whatever the gym already counts takings in. Every field is one a member
 * actually produced — nothing here is modelled, and nothing here is training
 * data, which the server could not read even if somebody asked for it.
 */
export function reachCsv(messages: GymMessage[], gym: string, sinceIso: string | null): string {
  const rows = sentBy(messages, gym).filter((m) => sinceIso === null || withinWindow(m, sinceIso))
  const head = [
    'date',
    'kind',
    'title',
    'audience',
    'read',
    'going',
    'declined',
    'saved',
    'joined',
  ]
  const cell = (value: string | number) => {
    const text = String(value)
    /* Quote anything that would otherwise break the row. A gym's own title is
       the field most likely to contain a comma. */
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const body = rows.map((m) =>
    [
      m.createdAt.slice(0, 10),
      m.kind,
      m.title,
      m.audience === 'all' ? 'everyone' : `${m.audience.length} named`,
      m.readBy.length,
      Object.values(m.rsvp).filter((a) => a === 'yes').length,
      Object.values(m.rsvp).filter((a) => a === 'no').length,
      m.saved.length,
      m.joined?.length ?? 0,
    ]
      .map(cell)
      .join(','),
  )
  return [head.join(','), ...body].join('\n')
}

/** The first day of the reach window, as a plain date. */
export function windowStart(todayIso: string, days: number = REACH_WINDOW_DAYS): string {
  const start = new Date(`${todayIso}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - days)
  return start.toISOString().slice(0, 10)
}
