import { inboxFor, type GymMessage } from './messages'

/**
 * Which of the gym's messages deserve a place on Today rather than waiting in
 * the inbox behind a bell.
 *
 * Only two kinds qualify, and only while they can still be acted on: an event
 * you can still attend and an offer you can still redeem. An announcement has
 * nothing to press, and a message whose date has passed is clutter. Keeping
 * the bar this high is what lets the block sit high on the page without
 * turning the home screen into a hoarding.
 */

/** Device-local, per profile. Dismissing here must not touch the banner or the
    inbox: three surfaces, three different jobs. */
const DISMISSED_KEY = 'forma-notice-dismissed'

type DismissedMap = Record<string, string[]>

function readDismissed(): DismissedMap {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as DismissedMap) : {}
  } catch {
    return {}
  }
}

export function dismissedNotices(profileId: string): string[] {
  return readDismissed()[profileId] ?? []
}

export function dismissNotice(profileId: string, messageId: string): void {
  try {
    const all = readDismissed()
    const mine = all[profileId] ?? []
    if (mine.includes(messageId)) return
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...all, [profileId]: [...mine, messageId] }))
  } catch {
    // Private mode: the card comes back next load, which is survivable.
  }
}

/** An event still ahead of us. A missing date cannot be judged, so it is out. */
export function eventIsUpcoming(message: GymMessage, todayIso: string): boolean {
  return message.kind === 'event' && !!message.event?.date && message.event.date >= todayIso
}

/** An offer with no end date runs until the gym deletes it. */
export function offerIsLive(message: GymMessage, todayIso: string): boolean {
  if (message.kind !== 'offer' || !message.offer) return false
  return !message.offer.validUntil || message.offer.validUntil >= todayIso
}

/**
 * How long something on sale counts as news. Without a window a shop item
 * would sit on the home screen forever, which is the difference between
 * telling members what is new and running a permanent hoarding.
 */
export const PRODUCT_FRESH_DAYS = 14

/** A shop item is eligible while it is still new. */
export function productIsFresh(message: GymMessage, todayIso: string): boolean {
  if (message.kind !== 'product' || !message.product) return false
  const published = new Date(`${message.createdAt.slice(0, 10)}T00:00:00.000Z`).getTime()
  const today = new Date(`${todayIso}T00:00:00.000Z`).getTime()
  const days = Math.floor((today - published) / 86_400_000)
  return days >= 0 && days <= PRODUCT_FRESH_DAYS
}

export interface TodayNotices {
  /** The soonest event still ahead, not the newest one published. */
  event?: GymMessage
  /**
   * One commercial card: the newest live offer or fresh shop item, whichever
   * came last. Offers and products share the slot so the block is capped at
   * two cards however much the gym publishes.
   */
  deal?: GymMessage
}

/**
 * At most one of each, so the block can never grow past two cards however
 * busy the gym gets.
 */
export function noticesForToday(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
  todayIso: string,
): TodayNotices {
  const dismissed = new Set(dismissedNotices(profile.id))
  const mine = inboxFor(messages, profile).filter((m) => !dismissed.has(m.id))

  const event = mine
    .filter((m) => eventIsUpcoming(m, todayIso))
    .sort((a, b) => (a.event?.date ?? '').localeCompare(b.event?.date ?? ''))[0]

  /* inboxFor already sorts newest first, so the first match is the latest. */
  const deal = mine.find((m) => offerIsLive(m, todayIso) || productIsFresh(m, todayIso))

  return { ...(event ? { event } : {}), ...(deal ? { deal } : {}) }
}
