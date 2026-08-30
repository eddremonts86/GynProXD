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

/** `sinceIso` is a plain date; pass the window's first day. */
export function summariseReach(
  messages: GymMessage[],
  gym: string,
  sinceIso: string,
): ReachSummary {
  const window = sentBy(messages, gym).filter((m) => withinWindow(m, sinceIso))
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

/** The first day of the reach window, as a plain date. */
export function windowStart(todayIso: string, days: number = REACH_WINDOW_DAYS): string {
  const start = new Date(`${todayIso}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - days)
  return start.toISOString().slice(0, 10)
}
