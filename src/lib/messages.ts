/**
 * Gym-to-member messaging. Messages live in a device-level plaintext store:
 * events, menus and offers are broadcast material, not member secrets, so
 * they sit at the same trust level as the profile directory. Training data
 * stays encrypted per profile and is never touched by any of this.
 */

import type { Challenge } from './challenge'
import type { Collection } from './collection'
import type { GymProgramme } from './gym-programme'
import { DURATION_LABELS } from './labels'
import { htmlToLine } from './rich-text'

/**
 * Who a message is for, beyond the gym it was written in.
 *
 * A gym only ever writes to its own members and never sees this. It exists for
 * the one sender that is not a gym: the platform, which has two audiences that
 * must never be confused. `unaffiliated` reaches the people no gym has claimed
 * — the ones who, before this, received nothing at all. `everyone` reaches
 * them and every gym's members too, which is a different and more dangerous
 * thing: those people already pay somebody else.
 *
 * Identification is by scope, never by the sender's name. That is what makes a
 * device-local gym that happens to be called the same thing as the house
 * harmless rather than a leak — its messages are `members`, and `members` is
 * checked against the gym name, which is exactly the old behaviour.
 *
 * `open-door` is the fourth, and the only one a gym may use to reach past its
 * own roster: people with no gym, who have not turned it off. It is a scope of
 * its own rather than a gym borrowing `unaffiliated`, because `senderOf`
 * attributes everything that is not `members` to the platform — a gym's offer
 * arriving over the name enForma would be both untrue and a way to borrow
 * credibility that is not for sale.
 */
export type MessageScope = 'members' | 'unaffiliated' | 'everyone' | 'open-door'

/**
 * The same list at runtime, because the wire needs to recognise one.
 *
 * A message that arrives without its scope is judged as `members` and matched
 * against the gym's name, so it becomes invisible to exactly the people it was
 * written for. `messageFromWire` therefore has to know which values are real —
 * and when that knowledge was a literal list inside it, adding a fourth scope
 * meant remembering to edit a file three directories away. It was not
 * remembered. This array is the one place to add the fifth.
 */
export const MESSAGE_SCOPES: readonly MessageScope[] = [
  'members',
  'unaffiliated',
  'everyone',
  'open-door',
]

/** Whether a value off the wire is a scope this build understands. */
export function isMessageScope(value: unknown): value is MessageScope {
  return typeof value === 'string' && (MESSAGE_SCOPES as readonly string[]).includes(value)
}

/** What a member sees above a platform message. Display only — see MessageScope. */
export const HOUSE_GYM = 'enForma'

export type TemplateKind =
  | 'announcement'
  | 'event'
  | 'menu'
  | 'offer'
  | 'challenge'
  | 'collection'
  | 'product'
  | 'programme'

export interface MenuCourse {
  name: string
  dishes: string[]
}

/**
 * A picture the gym attached. `url` points at the sync server's file endpoint;
 * a message published on a device with no account carries none, because there
 * is nowhere to put the bytes that is not the training history's own quota.
 */
export interface MessageImage {
  url: string
  alt?: string
}

export interface GymMessage {
  id: string
  /** Gym name as written in the directory; matched case-insensitively. */
  gym: string
  authorId: string
  createdAt: string
  kind: TemplateKind
  title: string
  body?: string
  /** 'all' reaches every member of the gym; otherwise explicit profile ids. */
  audience: 'all' | string[]
  /**
   * Absent on every message written before this existed, and on every message
   * a gym will ever write. Absent reads as `members`, which is the rule this
   * app shipped with — so nothing already sent changes who it reaches.
   */
  scope?: MessageScope
  event?: { date: string; time?: string; place?: string }
  menu?: { courses: MenuCourse[] }
  offer?: { discount: string; validUntil?: string; code: string }
  /**
   * Something the gym sells over the counter. There is no basket and no
   * payment here: a member reserves one and picks it up, which is what a
   * counter-service gym actually does. Interest is counted in `saved`, the
   * same field an offer uses, so the panel tallies it without new plumbing.
   */
  /** `price` is whatever the gym typed, currency and all: the app has no
      currency field and must never staple a symbol onto it. */
  product?: { name: string; price: string; note?: string }
  challenge?: Challenge
  collection?: Collection
  /**
   * A programme the gym designed, as structure only.
   *
   * Deliberately not a `GeneratedPlan`: that object carries the `input` of
   * whoever designed it — their age, weight and the field their injuries are
   * written in. See `gym-programme.ts` for what is stripped and why. The
   * member's own numbers re-enter when they adopt it.
   */
  programme?: GymProgramme
  /**
   * When this becomes readable. Absent means the moment it was written.
   *
   * The server withholds it until then — `@now` in the collection's read rule —
   * so a queued message is genuinely unfetchable rather than merely unrendered.
   * This copy exists because the gym's own device holds what it published
   * before the server ever answers, and the operator's Sent list needs to say
   * "Monday, 08:00" rather than showing it as gone out.
   */
  publishAt?: string
  /** Also surface as a strip under the top bar, for this many minutes. */
  banner?: { minutes: number }
  /** Where the banner's View action goes; default is the inbox. */
  link?: 'menu'
  /** Up to four, in the order the gym picked them; the first one leads. */
  images?: MessageImage[]
  readBy: string[]
  rsvp: Record<string, 'yes' | 'no'>
  saved: string[]
  /** Members who joined a challenge; the definition copy in their profile is theirs. */
  joined?: string[]
  /**
   * Display names for the ids above, filled in when the gym pulls its members'
   * answers off the server. A guest list of user ids is not a guest list.
   */
  respondents?: Record<string, string>
  bannerDismissedBy?: string[]
  /**
   * Profiles that removed this from their own inbox.
   *
   * Not a deletion. The row belongs to whoever published it and the server
   * gives `delete` to that gym's operators only, which is right — a member
   * clearing their inbox must not erase an event forty other people are still
   * reading. So this hides it for one profile on one device, and the copy the
   * gym keeps is untouched. Anything the UI says about it has to say that.
   */
  deletedBy?: string[]
}

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  announcement: 'Announcement',
  event: 'Event',
  menu: 'Daily menu',
  offer: 'Offer',
  challenge: 'Challenge',
  collection: 'Collection',
  product: 'In the shop',
  programme: 'Programme',
}

const sameGym = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Absent means `members`: the rule this app shipped with, applied unchanged. */
export function scopeOf(message: GymMessage): MessageScope {
  return message.scope ?? 'members'
}

export function isAddressedTo(
  message: GymMessage,
  profile: { id: string; gym?: string; openToGyms?: boolean },
  now: string = new Date().toISOString(),
): boolean {
  /* Authors never receive their own broadcasts; their view is the sent list. */
  if (message.authorId === profile.id) return false
  /* Not yet. The server will not hand a queued message to anybody but its own
     gym, so this only matters for the copy a device published locally — but it
     has to matter there too, or a gym testing its own schedule on one device
     would watch it arrive immediately. */
  if (message.publishAt && message.publishAt > now) return false
  /* Removed from this profile's inbox. Checked here rather than in `inboxFor`
     so the badge, the banner and the notification all agree with the list —
     four places asking the same question is four places to forget one. */
  if (message.deletedBy?.includes(profile.id)) return false

  switch (scopeOf(message)) {
    case 'everyone':
      break
    case 'unaffiliated':
      /* The whole point of the scope. Somebody who joined a gym this morning
         stops being in this audience this morning, with no list to maintain
         and nothing to un-send. */
      if (profile.gym?.trim()) return false
      break
    case 'open-door':
      /* Same audience as above, and one more condition: they have not said no.
         Absent reads as yes, matching the server's backfill — a profile written
         before this existed is opted in, which is the decision the migration
         made out loud rather than one this line makes by omission. */
      if (profile.gym?.trim()) return false
      if (profile.openToGyms === false) return false
      break
    default:
      if (!sameGym(message.gym, profile.gym)) return false
  }

  return message.audience === 'all' || message.audience.includes(profile.id)
}

/**
 * Who a desk can address, given the scope it is writing under.
 *
 * Extracted so the composer's pickable list, the count in the confirmation and
 * the count in the success line all come from one function. They did not, for
 * about ten minutes: narrowing an offer from everyone to the unaffiliated
 * delivered it correctly to five people and then reported ten, because the
 * number came from a list memoised under the scope that had just been
 * abandoned. Delivering right and reporting wrong is worse than either.
 */
export function audienceWithin<T extends { id: string; gym?: string }>(
  profiles: T[],
  gym: string,
  scope: MessageScope | undefined,
  authorId: string,
): T[] {
  const others = profiles.filter((p) => p.id !== authorId)
  if (scope === 'everyone') return others
  if (scope === 'unaffiliated') return others.filter((p) => !p.gym?.trim())
  if (scope === 'open-door') {
    return others.filter((p) => !p.gym?.trim() && (p as { openToGyms?: boolean }).openToGyms !== false)
  }
  const key = gym.trim().toLowerCase()
  return others.filter((p) => p.gym?.trim().toLowerCase() === key)
}

export interface AudienceSplit {
  /** Everyone this device knows about, minus the author. */
  total: number
  /** No gym has claimed them. */
  unaffiliated: number
  /** They already train somewhere, and somebody is already selling to them. */
  affiliated: number
}

/**
 * Who a broadcast is about to land on, counted rather than described.
 *
 * This exists to be read out loud in a confirmation. "Are you sure?" is a
 * question nobody has ever answered no to; "890 of these people train at a
 * gym" is a fact that makes the sender stop. So the numbers are counted from
 * the directory at the moment of asking, never cached and never estimated.
 */
export function splitAudience(
  profiles: { id: string; gym?: string }[],
  authorId: string,
): AudienceSplit {
  let unaffiliated = 0
  let affiliated = 0
  for (const profile of profiles) {
    if (profile.id === authorId) continue
    if (profile.gym?.trim()) affiliated += 1
    else unaffiliated += 1
  }
  return { total: unaffiliated + affiliated, unaffiliated, affiliated }
}

export function inboxFor(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
  now: string = new Date().toISOString(),
): GymMessage[] {
  return messages
    .filter((m) => isAddressedTo(m, profile, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function unreadCount(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
  now: string = new Date().toISOString(),
): number {
  return messages.filter((m) => isAddressedTo(m, profile, now) && !m.readBy.includes(profile.id))
    .length
}

/** Still waiting for its moment. The gym's own view of what it has queued. */
export function isQueued(
  message: GymMessage,
  now: string = new Date().toISOString(),
): boolean {
  return !!message.publishAt && message.publishAt > now
}

/**
 * Who the unread messages are actually from.
 *
 * The notification used to name `gym ?? 'Your gym'` and say "from your gym",
 * which was a guess that had always been right because there was only ever one
 * sender. There are two now, and it was wrong in both directions at once: it
 * told somebody with no gym that they had a message from a gym they do not
 * have, and told a gym's member that a message from enForma came from theirs.
 *
 * Returning the senders rather than a formatted string keeps the wording where
 * the wording belongs and lets the caller say nothing when it cannot say
 * something true.
 */
export function unreadSenders(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
): string[] {
  const senders: string[] = []
  for (const message of messages) {
    if (!isAddressedTo(message, profile) || message.readBy.includes(profile.id)) continue
    const from = senderOf(message)
    if (!senders.some((s) => s.toLowerCase() === from.toLowerCase())) senders.push(from)
  }
  return senders
}

/** Banners still inside their window, addressed to and not dismissed by the viewer. */
export function activeBanners(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
  now: number = Date.now(),
): GymMessage[] {
  return messages
    .filter((m) => {
      if (!m.banner || !isAddressedTo(m, profile)) return false
      if (m.bannerDismissedBy?.includes(profile.id)) return false
      const expires = new Date(m.createdAt).getTime() + m.banner.minutes * 60_000
      return expires > now
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const BANNER_DURATIONS = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: 'All day' },
] as const

export function sentBy(messages: GymMessage[], gym: string): GymMessage[] {
  return messages
    .filter((m) => sameGym(m.gym, gym))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * One line of the message, for a list row.
 *
 * A body is the obvious source and often absent: most templates are structured
 * rather than prose, and an offer with no body would have shown an empty row
 * next to a full one. So each kind falls back to the thing it is actually
 * about — the discount, the price, the date, what the kitchen is cooking —
 * which is also the thing somebody scanning the list is looking for.
 *
 * Plain text, always, and stripped without a DOM: this runs for every row on
 * every render, where `htmlToPlain`'s sanitise-and-parse would be both wasteful
 * and unavailable. Safe because the result is set as text, never as HTML.
 */
export function previewOf(message: GymMessage): string {
  const fromBody = message.body ? htmlToLine(message.body) : ''
  if (fromBody) return fromBody

  switch (message.kind) {
    case 'offer':
      return message.offer?.discount ?? ''
    case 'product':
      return [message.product?.name, message.product?.price].filter(Boolean).join(' — ')
    case 'event':
      return [message.event?.date, message.event?.time, message.event?.place]
        .filter(Boolean)
        .join(' · ')
    case 'menu':
      return (message.menu?.courses ?? [])
        .map((course) => course.dishes.join(', '))
        .filter(Boolean)
        .join(' · ')
    case 'challenge':
      return message.challenge
        ? `${message.challenge.days} days, ${message.challenge.start} ${message.challenge.unit} to start`
        : ''
    case 'collection':
      return message.collection
        ? `${message.collection.exerciseIds.length} movements`
        : ''
    case 'programme':
      /* What a member weighing it up wants: how long, and how often. */
      return message.programme
        ? `${DURATION_LABELS[message.programme.duration]}, ${message.programme.daysPerWeek} days a week`
        : ''
    default:
      return ''
  }
}

/**
 * Who the message is from, as a member reads it.
 *
 * Their own gym, the platform, or — for the open door — the gym that paid to
 * reach them, named as itself. A stranger's offer must never arrive over the
 * platform's name: that would be untrue, and it would lend our credibility to
 * whoever bought the tier.
 */
export function senderOf(message: GymMessage): string {
  const scope = scopeOf(message)
  return scope === 'members' || scope === 'open-door' ? message.gym : HOUSE_GYM
}

/** Short, unambiguous redemption code: no 0/O or 1/I lookalikes. */
export function makeOfferCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(random() * alphabet.length)]
    if (i === 3) code += '-'
  }
  return code
}

/** What the offer QR encodes: scannable, human-checkable at the desk. */
export function offerPayload(code: string, gym: string): string {
  return `enforma:offer:${code}:${gym}`
}
